
<link rel="stylesheet" href="style.css">

<script defer data-url="https://devhunt.org/tool/lynkr" src="https://cdn.jsdelivr.net/gh/sidiDev/devhunt-banner/indexV0.js"></script>


# Lynkr – Claude Code-Compatible Proxy for Databricks 
#### Lynkr is an open-source Claude Code-compatible proxy that allows the Claude Code CLI to run directly with Databricks LLMs. It supports MCP servers, Git workflows, repo intelligence, workspace tools, and prompt caching for LLM-powered development.
<!--
SEO Keywords:
Databricks, Claude Code, Anthropic, Azure Anthropic,
LLM tools, LLM agents, Model Context Protocol, MCP,
developer tools, proxy, git automation, AI developer tools,
prompt caching, Node.js
-->


---

#  Lynkr  
### Claude Code-Compatible Proxy for Databricks & Azure Anthropic Models
**MCP • Git Tools • Repo Intelligence • Prompt Caching • Workspace Automation**

[⭐ Star on GitHub](https://github.com/vishalveerareddy123/Lynkr) ·  
[📘 Documentation](https://deepwiki.com/vishalveerareddy123/Lynkr) ·  
[🐙 Source Code](https://github.com/vishalveerareddy123/Lynkr)

---

# 🚀 What is Lynkr?

**Lynkr** is an open-source **Claude Code-compatible backend proxy** that lets you run the **Claude Code CLI** and Claude-style tools **directly against Databricks** or **Azure-hosted Anthropic models** instead of the default Anthropic cloud.

It enables full repo-aware LLM workflows:

- code navigation  
- diff review  
- Git operations  
- test execution  
- workspace tools  
- Model Context Protocol (MCP) servers  
- repo indexing and project intelligence  
- prompt caching  
- conversational sessions  

This makes Databricks a first-class environment for **AI-assisted software development**, **LLM agents**, **automated refactoring**, **debugging**, and **ML/ETL workflow exploration**.

---

# 🌟 Key Features (SEO Summary)

### ✔ Claude Code-compatible API (`/v1/messages`)  
Emulates Anthropic’s backend so the **Claude Code CLI works without modification**.

### ✔ Works with Databricks LLM Serving  
Supports **Databricks-hosted Claude Sonnet / Haiku models**, or any LLM served from Databricks.

### ✔ Supports Azure Anthropic models
Route Claude Code requests into Azure's `/anthropic/v1/messages` endpoint.

### ✔ Supports OpenRouter (100+ models)
Access GPT-4o, Claude, Gemini, Llama, and more through a single unified API with full tool calling support.

### ✔ Full Model Context Protocol (MCP) integration  
Auto-discovers MCP manifests and exposes them as tools for smart workflows.

### ✔ Repo Intelligence: `CLAUDE.md`, Symbol Index, Cross-file analysis  
Lynkr builds a repo index using SQLite + Tree-sitter for rich context.

### ✔ Git Tools and Workflow Automation  
Commit, push, diff, stage, generate release notes, etc.

### ✔ Prompt Caching (LRU + TTL)  
Reuses identical prompts to reduce cost + latency.

### ✔ Workspace Tools
Task tracker, file I/O, test runner, index rebuild, etc.

### ✔ Client-Side Tool Execution (Passthrough Mode)
Tools can execute on the Claude Code CLI side instead of the server, enabling local file operations and commands.

### ✔ Fully extensible Node.js architecture
Add custom tools, policies, or backend adapters.

---

# 📚 Table of Contents

- [What Lynkr Solves](#-what-lynkr-solves)
- [Architecture Overview](#-architecture-overview)
- [Installation](#-installation)
- [Configuring Providers (Databricks & Azure Anthropic)](#-configuring-providers)
- [Using Lynkr With Claude Code CLI](#-using-lynkr-with-claude-code-cli)
- [Repo Intelligence & Indexing](#-repo-intelligence--indexing)
- [Prompt Caching](#-prompt-caching)
- [MCP (Model Context Protocol) Integration](#-model-context-protocol-mcp)
- [Git Tools](#-git-tools)
- [Client-Side Tool Execution (Passthrough Mode)](#-client-side-tool-execution-passthrough-mode)
- [API Examples](#-api-examples)
- [Roadmap](#-roadmap)
- [Links](#-links)

---

# 🧩 What Lynkr Solves

### **The Problem**
Claude Code is exceptionally useful—but it only communicates with Anthropic’s hosted backend.

This means:

❌ You can’t point Claude Code at **Databricks LLMs**  
❌ You can’t run Claude workflows **locally**, offline, or in secure contexts  
❌ MCP tools must be managed manually  
❌ You don’t control caching, policies, logs, or backend behavior

### **The Solution: Lynkr**
Lynkr is a **Claude Code-compatible backend** that sits between the CLI and your actual model provider.

```

Claude Code CLI
↓
Lynkr Proxy
↓
Databricks / Azure Anthropic / MCP / Tools

```

This enables:

- **Databricks-native LLM development**
- **Enterprise-private model usage**
- **LLM agents with Git + file system access**
- **Smart workflows via MCP**
- **Transparent caching + logging**

---

# 🏗 Architecture Overview

```

Claude Code CLI
↓  (HTTP POST /v1/messages)
Lynkr Proxy (Node.js + Express)
↓
────────────────────────────────────────
│  Orchestrator (Agent Loop)          │
│  ├─ Tool Execution Pipeline         │
│  ├─ MCP Registry + Sandbox          │
│  ├─ Prompt Cache (LRU + TTL)        │
│  ├─ Session Store (SQLite)          │
│  ├─ Repo Indexer (Tree-sitter)      │
│  ├─ Policy Engine                   │
────────────────────────────────────────
↓
Databricks / Azure Anthropic / Other Providers

````

Key directories:

- `src/api` → Claude-compatible API proxy  
- `src/orchestrator` → LLM agent runtime loop  
- `src/mcp` → Model Context Protocol tooling  
- `src/tools` → Git, diff, test, tasks, fs tools  
- `src/cache` → prompt caching backend  
- `src/indexer` → repo intelligence

---

# ⚙ Installation

## Global install (recommended)
```bash
npm install -g lynkr
lynkr start
````

## Homebrew

```bash
brew tap vishalveerareddy123/lynkr
brew install vishalveerareddy123/lynkr/lynkr
```

## From source

```bash
git clone https://github.com/vishalveerareddy123/Lynkr.git
cd Lynkr
npm install
npm start
```

---

# 🔧 Configuring Providers

## Databricks Setup

```env
MODEL_PROVIDER=databricks
DATABRICKS_API_BASE=https://<workspace>.cloud.databricks.com
DATABRICKS_API_KEY=<personal-access-token>
DATABRICKS_ENDPOINT_PATH=/serving-endpoints/databricks-claude-sonnet-4-5/invocations
WORKSPACE_ROOT=/path/to/your/repo
PORT=8080
```

## Azure Anthropic Setup

```env
MODEL_PROVIDER=azure-anthropic
AZURE_ANTHROPIC_ENDPOINT=https://<resource>.services.ai.azure.com/anthropic/v1/messages
AZURE_ANTHROPIC_API_KEY=<api-key>
AZURE_ANTHROPIC_VERSION=2023-06-01
WORKSPACE_ROOT=/path/to/repo
PORT=8080
```

## OpenRouter Setup

**What is OpenRouter?**

OpenRouter provides unified access to 100+ AI models (GPT-4o, Claude, Gemini, Llama, etc.) through a single API. Benefits:
- ✅ No vendor lock-in - switch models without code changes
- ✅ Competitive pricing ($0.15/$0.60 per 1M for GPT-4o-mini)
- ✅ Automatic fallbacks if primary model unavailable
- ✅ Pay-as-you-go, no monthly fees
- ✅ Full tool calling support

**Configuration:**

```env
MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...                                    # Get from https://openrouter.ai/keys
OPENROUTER_MODEL=openai/gpt-4o-mini                                # See https://openrouter.ai/models
OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
PORT=8080
WORKSPACE_ROOT=/path/to/your/repo
```

**Popular Models:**
- `openai/gpt-4o-mini` – Fast, affordable ($0.15/$0.60 per 1M)
- `anthropic/claude-3.5-sonnet` – Claude's best reasoning
- `google/gemini-pro-1.5` – Large context window
- `meta-llama/llama-3.1-70b-instruct` – Open-source Llama

See [https://openrouter.ai/models](https://openrouter.ai/models) for complete list.

**Getting Started:**
1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign in with GitHub/Google/email
3. Create API key at [https://openrouter.ai/keys](https://openrouter.ai/keys)
4. Add credits (minimum $5)
5. Configure Lynkr as shown above

---

# 💬 Using Lynkr With Claude Code CLI

```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_API_KEY=dummy
```

Then:

```bash
claude chat
claude diff
claude review
claude apply
```

Everything routes through your Databricks or Azure model.

---

# 🧠 Repo Intelligence & Indexing

Lynkr uses Tree-sitter and SQLite to analyze your workspace:

* **Symbol definitions**
* **Cross-file references**
* **Language mix**
* **Framework hints**
* **Dependency patterns**
* **Testing metadata**

It generates a structured `CLAUDE.md` so the model always has context.

---

# ⚡ Prompt Caching

Lynkr includes an LRU+TTL prompt cache.

### Benefits:

* Reduced Databricks compute consumption
* Faster response times
* Deterministic repeated responses

Configure:

```env
PROMPT_CACHE_ENABLED=true
PROMPT_CACHE_TTL_MS=300000
PROMPT_CACHE_MAX_ENTRIES=64
```

---

# 🧩 Model Context Protocol (MCP)

Lynkr automatically discovers MCP manifests from:

```
~/.claude/mcp
```

or directories defined via:

```
MCP_MANIFEST_DIRS
```

MCP tools become available inside the Claude Code environment, including:

* GitHub integrations
* Jira automations
* custom internal tools
* filesystem operations
* build systems
* CI/CD triggers

Optional sandboxing uses Docker or OCI runtimes.

---

# 🔧 Git Tools

Lynkr includes a full suite of Git operations:

* `workspace_git_status`
* `workspace_git_diff`
* `workspace_git_stage`
* `workspace_git_commit`
* `workspace_git_push`
* `workspace_git_pull`
* Release-note generation
* Diff summarization & analysis

Policies:

* `POLICY_GIT_ALLOW_PUSH`
* `POLICY_GIT_REQUIRE_TESTS`
* `POLICY_GIT_TEST_COMMAND`

Example:

> Disallow push unless tests pass?
> Set `POLICY_GIT_REQUIRE_TESTS=true`.

---

# 🔄 Client-Side Tool Execution (Passthrough Mode)

Lynkr supports **client-side tool execution**, enabling tools to execute on the Claude Code CLI machine instead of the proxy server.

**Enable passthrough mode:**

```bash
export TOOL_EXECUTION_MODE=client
npm start
```

**How it works:**

1. Model generates tool calls (from Databricks/OpenRouter/Ollama)
2. Proxy converts to Anthropic format with `tool_use` blocks
3. Claude Code CLI receives `tool_use` blocks and executes locally
4. CLI sends `tool_result` blocks back in the next request
5. Proxy forwards complete conversation back to the model

**Benefits:**

* ✅ Local filesystem access on CLI user's machine
* ✅ Local credentials, SSH keys, environment variables
* ✅ Integration with local dev tools (git, npm, docker)
* ✅ Reduced network latency for file operations
* ✅ Server doesn't need filesystem permissions

**Use cases:**

* Remote proxy server with local CLI execution
* Multi-user environments where each needs their own workspace
* Security-sensitive setups where server shouldn't access user files

**Configuration:**

* `TOOL_EXECUTION_MODE=server` – Tools run on proxy (default)
* `TOOL_EXECUTION_MODE=client` – Tools run on CLI side
* `TOOL_EXECUTION_MODE=passthrough` – Alias for client mode

---

# 🧪 API Example (Index Rebuild)

```bash
curl http://localhost:8080/v1/messages \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "claude-proxy",
    "messages": [{ "role": "user", "content": "Rebuild the index." }],
    "tool_choice": {
      "type": "function",
      "function": { "name": "workspace_index_rebuild" }
    }
  }'
```

---

# 🛣 Roadmap

## ✅ Recently Completed (December 2025)

* **Client-side tool execution** (`TOOL_EXECUTION_MODE=client/passthrough`) – Tools can execute on the Claude Code CLI side, enabling local file operations, commands, and access to local credentials
* **OpenRouter error resilience** – Graceful handling of malformed OpenRouter responses, preventing crashes during rate limits or service errors
* **Enhanced format conversion** – Improved Anthropic ↔ OpenRouter format conversion for tool calls with proper `tool_use` block generation

## 🔮 Future Features

* LSP integration (TypeScript, Python, more languages)
* Per-file diff comments
* Risk scoring for Git diffs
* Expand MCP support
* Skill-like declarative automation layer
* Historical test dashboards
* Databricks-specific tools

---

# 🔗 Links

* **GitHub**: [https://github.com/vishalveerareddy123/Lynkr](https://github.com/vishalveerareddy123/Lynkr)
* **Docs**: [https://deepwiki.com/vishalveerareddy123/Lynkr](https://deepwiki.com/vishalveerareddy123/Lynkr)
* **Issues**: [https://github.com/vishalveerareddy123/Lynkr/issues](https://github.com/vishalveerareddy123/Lynkr/issues)

If you use Databricks or Azure Anthropic and want rich Claude Code workflows, Lynkr gives you the control and extensibility you need.

Feel free to open issues, contribute tools, or integrate with MCP servers!
