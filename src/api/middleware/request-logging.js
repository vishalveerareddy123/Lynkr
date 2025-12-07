const crypto = require("crypto");
const logger = require("../../logger");

/**
 * Structured request logging middleware
 *
 * Features:
 * - Request ID tracking (X-Request-ID header)
 * - Correlation across services
 * - Performance metrics
 * - Minimal overhead
 */

function generateRequestId() {
  return crypto.randomBytes(16).toString("hex");
}

function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Generate or use existing request ID
  const requestId = req.headers["x-request-id"] || generateRequestId();
  req.requestId = requestId;

  // Add to response headers
  res.setHeader("X-Request-ID", requestId);

  // Log request start
  logger.info(
    {
      requestId,
      method: req.method,
      path: req.path || req.url,
      query: req.query,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    },
    "Request started"
  );

  // Capture response finish
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;

    // Log request completion
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.path || req.url,
        status: res.statusCode,
        duration,
        contentLength: res.getHeader("content-length"),
      },
      "Request completed"
    );

    return originalSend.call(this, body);
  };

  // Handle errors
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      const duration = Date.now() - startTime;
      logger.warn(
        {
          requestId,
          method: req.method,
          path: req.path || req.url,
          status: res.statusCode,
          duration,
        },
        "Request failed"
      );
    }
  });

  next();
}

module.exports = { requestLoggingMiddleware };
