const config = require("../config");
const logger = require("../logger");

/**
 * High-performance metrics collection
 *
 * Optimizations:
 * - In-memory counters (no I/O overhead)
 * - Lazy histogram calculations
 * - Minimal object allocation
 * - Lock-free counters
 */

class MetricsCollector {
  constructor() {
    // Request metrics
    this.requestCount = 0;
    this.requestErrors = 0;
    this.requestLatencies = [];
    this.requestsByStatus = new Map();
    this.requestsByEndpoint = new Map();

    // Token metrics
    this.tokensInput = 0;
    this.tokensOutput = 0;
    this.tokensTotal = 0;

    // Cost metrics
    this.totalCost = 0;

    // Budget metrics
    this.budgetBlocks = 0;
    this.rateLimitBlocks = 0;

    // API metrics
    this.databricksRequests = 0;
    this.databricksErrors = 0;
    this.databricksRetries = 0;

    // System metrics
    this.startTime = Date.now();
    this.lastResetTime = Date.now();

    // Histogram buckets for latency (in ms)
    this.latencyBuckets = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

    // Performance: Pre-allocate latency buffer
    this.maxLatencyBuffer = 10000;
  }

  /**
   * Record HTTP request
   */
  recordRequest(method, path, status, durationMs) {
    this.requestCount++;

    if (status >= 400) {
      this.requestErrors++;
    }

    // Track by status code
    const statusCount = this.requestsByStatus.get(status) || 0;
    this.requestsByStatus.set(status, statusCount + 1);

    // Track by endpoint
    const endpoint = `${method} ${path}`;
    const endpointCount = this.requestsByEndpoint.get(endpoint) || 0;
    this.requestsByEndpoint.set(endpoint, endpointCount + 1);

    // Record latency (with buffer limit for memory)
    if (this.requestLatencies.length < this.maxLatencyBuffer) {
      this.requestLatencies.push(durationMs);
    }
  }

  /**
   * Record token usage
   */
  recordTokens(input, output) {
    this.tokensInput += input || 0;
    this.tokensOutput += output || 0;
    this.tokensTotal += (input || 0) + (output || 0);
  }

  /**
   * Record cost
   */
  recordCost(costUsd) {
    this.totalCost += costUsd || 0;
  }

  /**
   * Record budget block
   */
  recordBudgetBlock() {
    this.budgetBlocks++;
  }

  /**
   * Record rate limit block
   */
  recordRateLimitBlock() {
    this.rateLimitBlocks++;
  }

  /**
   * Record Databricks API call
   */
  recordDatabricksRequest(success, retries = 0) {
    this.databricksRequests++;
    if (!success) {
      this.databricksErrors++;
    }
    this.databricksRetries += retries;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    const now = Date.now();
    const uptime = now - this.startTime;
    const periodSeconds = (now - this.lastResetTime) / 1000;

    // Calculate latency stats
    const latencyStats = this.calculateLatencyStats();

    return {
      // Counters
      requests_total: this.requestCount,
      requests_errors_total: this.requestErrors,
      requests_per_second: periodSeconds > 0 ? this.requestCount / periodSeconds : 0,

      // Latency
      latency_ms: latencyStats,

      // Tokens
      tokens_input_total: this.tokensInput,
      tokens_output_total: this.tokensOutput,
      tokens_total: this.tokensTotal,

      // Cost
      cost_usd_total: this.totalCost,

      // Budget
      budget_blocks_total: this.budgetBlocks,
      rate_limit_blocks_total: this.rateLimitBlocks,

      // API
      databricks_requests_total: this.databricksRequests,
      databricks_errors_total: this.databricksErrors,
      databricks_retries_total: this.databricksRetries,

      // Status codes
      status_codes: Object.fromEntries(this.requestsByStatus),

      // Endpoints
      endpoints: Object.fromEntries(this.requestsByEndpoint),

      // System
      uptime_seconds: Math.floor(uptime / 1000),
      memory_usage: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
    };
  }

  /**
   * Calculate latency statistics (lazy)
   */
  calculateLatencyStats() {
    if (this.requestLatencies.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...this.requestLatencies].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      min: sorted[0],
      max: sorted[count - 1],
      mean: sorted.reduce((a, b) => a + b, 0) / count,
      median: sorted[Math.floor(count / 2)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Export Prometheus format
   */
  toPrometheus() {
    const metrics = this.getMetrics();
    const lines = [];

    // Helper to format metric
    const metric = (name, type, help, value, labels = {}) => {
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");

      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(`${name}${labelStr ? `{${labelStr}}` : ""} ${value}`);
    };

    // Counters
    metric("http_requests_total", "counter", "Total HTTP requests", metrics.requests_total);
    metric("http_requests_errors_total", "counter", "Total HTTP errors", metrics.requests_errors_total);
    metric("tokens_input_total", "counter", "Total input tokens", metrics.tokens_input_total);
    metric("tokens_output_total", "counter", "Total output tokens", metrics.tokens_output_total);
    metric("tokens_total", "counter", "Total tokens", metrics.tokens_total);
    metric("cost_usd_total", "counter", "Total cost in USD", metrics.cost_usd_total);
    metric("budget_blocks_total", "counter", "Total budget blocks", metrics.budget_blocks_total);
    metric("rate_limit_blocks_total", "counter", "Total rate limit blocks", metrics.rate_limit_blocks_total);

    // Gauges
    metric("http_requests_per_second", "gauge", "Requests per second", metrics.requests_per_second);
    metric("uptime_seconds", "gauge", "Uptime in seconds", metrics.uptime_seconds);

    // Latency histogram
    metric("http_request_duration_ms", "summary", "HTTP request latency in ms", metrics.latency_ms.mean, { quantile: "0.5" });
    metric("http_request_duration_ms", "summary", "HTTP request latency in ms", metrics.latency_ms.p95, { quantile: "0.95" });
    metric("http_request_duration_ms", "summary", "HTTP request latency in ms", metrics.latency_ms.p99, { quantile: "0.99" });

    return lines.join("\n");
  }

  /**
   * Reset counters (for testing)
   */
  reset() {
    this.requestCount = 0;
    this.requestErrors = 0;
    this.requestLatencies = [];
    this.requestsByStatus.clear();
    this.requestsByEndpoint.clear();
    this.tokensInput = 0;
    this.tokensOutput = 0;
    this.tokensTotal = 0;
    this.totalCost = 0;
    this.budgetBlocks = 0;
    this.rateLimitBlocks = 0;
    this.databricksRequests = 0;
    this.databricksErrors = 0;
    this.databricksRetries = 0;
    this.lastResetTime = Date.now();
  }
}

// Singleton instance
let instance = null;

function getMetricsCollector() {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

module.exports = {
  MetricsCollector,
  getMetricsCollector,
};
