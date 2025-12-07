const logger = require("../../logger");
const config = require("../../config");

/**
 * Consistent error handling middleware
 *
 * Features:
 * - Standard error response format
 * - Error codes and messages
 * - Stack traces in development only
 * - User-friendly error messages
 * - No internal detail leakage
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = "internal_error", details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error types
 */
class BadRequestError extends AppError {
  constructor(message, details = null) {
    super(message, 400, "bad_request", details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "unauthorized");
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "forbidden");
  }
}

class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "not_found");
  }
}

class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, "conflict", details);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", retryAfter = null) {
    super(message, 429, "too_many_requests", { retryAfter });
  }
}

class InternalServerError extends AppError {
  constructor(message = "Internal server error") {
    super(message, 500, "internal_error");
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super(message, 503, "service_unavailable");
  }
}

/**
 * Error handling middleware
 */
function errorHandlingMiddleware(err, req, res, next) {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Determine if this is an operational error
  const isOperational = err.isOperational || err.statusCode < 500;

  // Log error
  if (isOperational) {
    logger.warn(
      {
        requestId: req.requestId,
        error: {
          message: err.message,
          code: err.code,
          statusCode: err.statusCode,
        },
      },
      "Operational error"
    );
  } else {
    logger.error(
      {
        requestId: req.requestId,
        error: {
          message: err.message,
          stack: err.stack,
          code: err.code,
          statusCode: err.statusCode,
        },
      },
      "Unexpected error"
    );
  }

  // Build error response
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || "internal_error";

  const response = {
    error: {
      code: errorCode,
      message: err.message || "An unexpected error occurred",
      requestId: req.requestId,
    },
  };

  // Add details if present (validation errors, etc.)
  if (err.details) {
    response.error.details = err.details;
  }

  // Add stack trace in development
  if (config.env === "development" && err.stack) {
    response.error.stack = err.stack;
  }

  // Send response
  res.status(statusCode).json(response);
}

/**
 * 404 handler (must be registered after all routes)
 */
function notFoundHandler(req, res, next) {
  const err = new NotFoundError(`Route not found: ${req.method} ${req.path}`);
  next(err);
}

/**
 * Async handler wrapper (catches promise rejections)
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
  errorHandlingMiddleware,
  notFoundHandler,
  asyncHandler,
};
