const Database = require("better-sqlite3");
const { invokeModel } = require("../clients/databricks");
const logger = require("../logger");
const config = require("../config");

/**
 * Health check endpoints
 *
 * /health/live - Liveness probe (is process alive?)
 * /health/ready - Readiness probe (can handle traffic?)
 */

// Health status tracking
let isShuttingDown = false;
let healthChecks = {
  database: { healthy: true, lastCheck: Date.now(), error: null },
  databricks: { healthy: true, lastCheck: Date.now(), error: null },
  memory: { healthy: true, lastCheck: Date.now(), error: null },
};

/**
 * Liveness probe - is the process alive?
 * Should return 200 unless the process is deadlocked or unrecoverable
 */
function livenessCheck(req, res) {
  // Simple check - if we can respond, we're alive
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/**
 * Readiness probe - can the service handle traffic?
 * Checks all dependencies
 */
async function readinessCheck(req, res) {
  if (isShuttingDown) {
    return res.status(503).json({
      status: "not_ready",
      reason: "shutting_down",
      timestamp: new Date().toISOString(),
    });
  }

  const checks = {};
  let allHealthy = true;

  // Check database
  try {
    checks.database = await checkDatabase();
    if (!checks.database.healthy) allHealthy = false;
  } catch (err) {
    checks.database = { healthy: false, error: err.message };
    allHealthy = false;
  }

  // Check memory
  try {
    checks.memory = checkMemory();
    if (!checks.memory.healthy) allHealthy = false;
  } catch (err) {
    checks.memory = { healthy: false, error: err.message };
    allHealthy = false;
  }

  // Optional: Check Databricks (can be slow)
  if (req.query.deep === "true") {
    try {
      checks.databricks = await checkDatabricks();
      if (!checks.databricks.healthy) allHealthy = false;
    } catch (err) {
      checks.databricks = { healthy: false, error: err.message };
      allHealthy = false;
    }
  }

  // Update cache
  healthChecks = { ...healthChecks, ...checks };

  const status = allHealthy ? 200 : 503;
  res.status(status).json({
    status: allHealthy ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    checks,
  });
}

/**
 * Check database connectivity
 */
async function checkDatabase() {
  try {
    const dbPath = config.sessionStore?.dbPath;
    if (!dbPath) {
      return { healthy: true, note: "No database configured" };
    }

    // Quick query to verify database is accessible
    const db = new Database(dbPath);
    const result = db.prepare("SELECT 1 as test").get();
    db.close();

    return {
      healthy: result.test === 1,
      lastCheck: Date.now(),
    };
  } catch (err) {
    logger.error({ err }, "Database health check failed");
    return {
      healthy: false,
      error: err.message,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check Databricks API connectivity (slow, optional)
 */
async function checkDatabricks() {
  try {
    // Simple health check request (or skip if no API configured)
    if (!config.databricks?.url) {
      return { healthy: true, note: "No Databricks URL configured" };
    }

    // Could make a lightweight API call here
    // For now, just check config is present
    return {
      healthy: true,
      lastCheck: Date.now(),
      note: "Configuration present (deep check not implemented)",
    };
  } catch (err) {
    logger.error({ err }, "Databricks health check failed");
    return {
      healthy: false,
      error: err.message,
      lastCheck: Date.now(),
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory() {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  const heapTotalMB = usage.heapTotal / 1024 / 1024;
  const heapUsedPercent = (heapUsedMB / heapTotalMB) * 100;

  // Consider unhealthy if using >90% of heap
  const healthy = heapUsedPercent < 90;

  return {
    healthy,
    heapUsedMB: Math.round(heapUsedMB),
    heapTotalMB: Math.round(heapTotalMB),
    heapUsedPercent: Math.round(heapUsedPercent),
    lastCheck: Date.now(),
  };
}

/**
 * Set shutting down flag
 */
function setShuttingDown(value) {
  isShuttingDown = value;
}

module.exports = {
  livenessCheck,
  readinessCheck,
  setShuttingDown,
};
