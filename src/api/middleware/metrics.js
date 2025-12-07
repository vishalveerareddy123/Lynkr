const { getMetricsCollector } = require("../../observability/metrics");

/**
 * Metrics collection middleware
 *
 * Performance: Minimal overhead, non-blocking
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  // Capture response finish
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const metrics = getMetricsCollector();

    // Record request metrics
    metrics.recordRequest(req.method, req.path || req.url, res.statusCode, duration);

    // Record budget/rate limit blocks
    if (res.statusCode === 429) {
      metrics.recordRateLimitBlock();
    } else if (res.statusCode === 402) {
      metrics.recordBudgetBlock();
    }
  });

  next();
}

module.exports = { metricsMiddleware };
