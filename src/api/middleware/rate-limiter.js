const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const config = require("../../config");
const logger = require("../../logger");

/**
 * Create a rate limiter middleware based on configuration
 *
 * Supports rate limiting by:
 * - session: Uses session ID (x-session-id header)
 * - ip: Uses client IP address
 * - both: Combines session + IP for stricter limiting
 *
 * @returns {Function} Express middleware
 */
function createRateLimiter() {
  if (!config.rateLimit?.enabled) {
    // Rate limiting disabled - return no-op middleware
    return (req, res, next) => next();
  }

  const { windowMs, max, keyBy } = config.rateLimit;

  // Key generator function based on configuration
  const keyGenerator = (req) => {
    const sessionId = req.sessionId || req.headers["x-session-id"];
    const ip = ipKeyGenerator(req); // Properly handle IPv6

    switch (keyBy) {
      case "session":
        return sessionId || ip; // Fallback to IP if no session
      case "ip":
        return ip;
      case "both":
        return `${sessionId || "no-session"}:${ip}`;
      default:
        return sessionId || ip;
    }
  };

  // Custom handler for rate limit exceeded
  const handler = (req, res) => {
    const key = keyGenerator(req);
    logger.warn(
      {
        key,
        sessionId: req.sessionId,
        ip: req.ip,
        path: req.path,
      },
      "Rate limit exceeded"
    );

    res.status(429).json({
      error: {
        type: "rate_limit_error",
        message: `Too many requests from this ${keyBy}. Please try again later.`,
      },
    });
  };

  // Skip function - don't rate limit health checks
  const skip = (req) => {
    return req.path === "/health" || req.path === "/metrics/observability";
  };

  // Create and return the rate limiter
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    keyGenerator,
    handler,
    skip,
    // Store in memory (for production, consider Redis store)
    store: undefined, // Uses default MemoryStore
  });

  // Log rate limiter configuration
  logger.info(
    {
      enabled: true,
      windowMs,
      max,
      keyBy,
      windowMinutes: Math.floor(windowMs / 60000),
    },
    "Rate limiter initialized"
  );

  return limiter;
}

module.exports = {
  createRateLimiter,
};
