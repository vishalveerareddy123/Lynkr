const { spawn } = require("child_process");
const path = require("path");
const config = require("../config");
const logger = require("../logger");
const { workspaceRoot } = require("../workspace");
const { evaluateSandboxRequest } = require("./permissions");

const DEFAULT_MAX_BUFFER = 1024 * 1024;
const sessionStore = new Map();

function isSandboxEnabled() {
  return Boolean(config.mcp?.sandbox?.enabled);
}

function normaliseSessionId(sessionId) {
  if (!sessionId) return "shared";
  return String(sessionId);
}

function ensureSession(sessionId) {
  const key = normaliseSessionId(sessionId);
  if (!sessionStore.has(key)) {
    sessionStore.set(key, {
      id: key,
      createdAt: Date.now(),
      lastUsedAt: null,
      runCount: 0,
    });
  }
  return sessionStore.get(key);
}

function listSessions() {
  return Array.from(sessionStore.values()).map((session) => ({
    id: session.id,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    runCount: session.runCount,
  }));
}

function releaseSession(sessionId) {
  const key = normaliseSessionId(sessionId);
  sessionStore.delete(key);
}

function toContainerPath(hostPath) {
  const relative = path.relative(workspaceRoot, hostPath);
  if (relative && relative.startsWith("..")) {
    throw new Error(`Path "${hostPath}" is outside of the workspace root and cannot be mounted.`);
  }
  const containerRoot = config.mcp?.sandbox?.containerWorkspace ?? "/workspace";
  if (!relative || relative === "") {
    return containerRoot;
  }
  const segments = relative.split(path.sep).filter(Boolean);
  return [containerRoot, ...segments].join("/").replace(/\/+/g, "/");
}

function buildRuntimeArgs({ session, command, args, cwd, env }) {
  const sandboxConfig = config.mcp?.sandbox ?? {};
  const runtimeArgs = ["run", "--rm"];

  // Security hardening options
  if (sandboxConfig.readOnlyRoot) {
    runtimeArgs.push("--read-only");
  }

  if (sandboxConfig.noNewPrivileges !== false) {
    runtimeArgs.push("--security-opt", "no-new-privileges");
  }

  // Resource limits
  if (sandboxConfig.memoryLimit) {
    runtimeArgs.push("--memory", sandboxConfig.memoryLimit);
  }

  if (sandboxConfig.cpuLimit) {
    runtimeArgs.push("--cpus", String(sandboxConfig.cpuLimit));
  }

  if (sandboxConfig.pidsLimit && !isNaN(sandboxConfig.pidsLimit)) {
    runtimeArgs.push("--pids-limit", String(sandboxConfig.pidsLimit));
  }

  // Capability management
  const dropCaps = sandboxConfig.dropCapabilities ?? [];
  for (const cap of dropCaps) {
    runtimeArgs.push("--cap-drop", cap);
  }

  const addCaps = sandboxConfig.addCapabilities ?? [];
  for (const cap of addCaps) {
    runtimeArgs.push("--cap-add", cap);
  }

  if (!sandboxConfig.allowNetworking) {
    runtimeArgs.push("--network", "none");
  } else if (sandboxConfig.networkMode && sandboxConfig.networkMode !== "none") {
    runtimeArgs.push("--network", sandboxConfig.networkMode);
  }

  if (sandboxConfig.mountWorkspace !== false) {
    runtimeArgs.push(
      "-v",
      `${workspaceRoot}:${sandboxConfig.containerWorkspace ?? "/workspace"}:rw`,
    );
  }

  for (const mount of sandboxConfig.extraMounts ?? []) {
    runtimeArgs.push("-v", `${mount.host}:${mount.container}:${mount.mode}`);
  }

  const containerCwd = toContainerPath(cwd ?? workspaceRoot);
  runtimeArgs.push("-w", containerCwd);

  if (sandboxConfig.user) {
    runtimeArgs.push("-u", sandboxConfig.user);
  }
  if (sandboxConfig.entrypoint) {
    runtimeArgs.push("--entrypoint", sandboxConfig.entrypoint);
  }

  const passthroughEnv = new Set(
    Array.isArray(sandboxConfig.passthroughEnv)
      ? sandboxConfig.passthroughEnv.map((name) => String(name).toUpperCase())
      : [],
  );

  const envArgs = [];
  if (env && typeof env === "object") {
    for (const [key, value] of Object.entries(env)) {
      if (passthroughEnv.size > 0 && !passthroughEnv.has(String(key).toUpperCase())) {
        continue;
      }
      if (value === undefined || value === null) continue;
      envArgs.push("-e", `${key}=${value}`);
    }
  }

  envArgs.push("-e", `MCP_SANDBOX_SESSION=${session.id}`);
  runtimeArgs.push(...envArgs);

  const commandArgs = Array.isArray(args) ? args.map(String) : [];
  runtimeArgs.push(sandboxConfig.image, command, ...commandArgs);
  return runtimeArgs;
}

function appendBuffer(current, chunk, maxBuffer) {
  if (current.length >= maxBuffer) {
    return { value: current, overflow: true };
  }
  const next = current + chunk;
  if (next.length > maxBuffer) {
    return { value: next.slice(0, maxBuffer), overflow: true };
  }
  return { value: next, overflow: false };
}

async function runSandboxProcess({
  sessionId,
  command,
  args = [],
  input,
  cwd,
  env,
  timeoutMs,
  maxBuffer = DEFAULT_MAX_BUFFER,
}) {
  if (!isSandboxEnabled()) {
    throw new Error("Sandbox execution requested but the sandbox is not enabled.");
  }
  const sandboxConfig = config.mcp?.sandbox ?? {};
  const session = ensureSession(sessionId);

  const permission = evaluateSandboxRequest({ sessionId: session.id, command });
  if (!permission.allowed) {
    const error = new Error(`Sandbox permission denied: ${permission.reason}`);
    error.code = "SANDBOX_PERMISSION_DENIED";
    throw error;
  }

  const runtimeCommand = sandboxConfig.runtime ?? "docker";
  const runtimeArgs = buildRuntimeArgs({
    session,
    command,
    args,
    cwd,
    env,
  });

  logger.debug(
    {
      sessionId: session.id,
      runtime: runtimeCommand,
      args: runtimeArgs,
      permissionSource: permission.source,
    },
    "Launching sandboxed process",
  );

  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : sandboxConfig.defaultTimeoutMs ?? 20000;

  return new Promise((resolve, reject) => {
    const child = spawn(runtimeCommand, runtimeArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutOverflow = false;
    let stderrOverflow = false;
    let timedOut = false;
    const start = Date.now();

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);

    child.stdout.on("data", (chunk) => {
      const { value, overflow } = appendBuffer(stdout, chunk.toString(), maxBuffer);
      stdout = value;
      if (overflow) stdoutOverflow = true;
    });

    child.stderr.on("data", (chunk) => {
      const { value, overflow } = appendBuffer(stderr, chunk.toString(), maxBuffer);
      stderr = value;
      if (overflow) stderrOverflow = true;
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      session.lastUsedAt = Date.now();
      session.runCount += 1;
      resolve({
        exitCode: code,
        signal,
        stdout,
        stderr,
        stdoutOverflow,
        stderrOverflow,
        timedOut,
        durationMs: Date.now() - start,
      });
    });

    if (typeof input === "string" && input.length > 0 && child.stdin.writable) {
      child.stdin.write(input);
      child.stdin.end();
    } else if (child.stdin.writable) {
      child.stdin.end();
    }
  });
}

module.exports = {
  isSandboxEnabled,
  runSandboxProcess,
  ensureSession,
  listSessions,
  releaseSession,
};
