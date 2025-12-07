const { getBudgetManager } = require('../../budget');
const logger = require('../../logger');

/**
 * Budget and rate limiting middleware
 */
function budgetMiddleware(req, res, next) {
  const budgetManager = getBudgetManager();

  // Extract user ID (from session, auth header, or default)
  const userId = req.session?.id || req.headers['x-user-id'] || 'default';

  // Check rate limits
  const rateLimitCheck = budgetManager.checkRateLimit(userId);
  if (!rateLimitCheck.allowed) {
    logger.warn({
      userId,
      reason: rateLimitCheck.reason,
      limit: rateLimitCheck.limit,
      current: rateLimitCheck.current,
    }, 'Rate limit exceeded');

    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Rate limit exceeded: ${rateLimitCheck.limit} requests per ${rateLimitCheck.reason === 'rate_limit_minute' ? 'minute' : 'hour'}`,
      limit: rateLimitCheck.limit,
      current: rateLimitCheck.current,
      resetInMs: rateLimitCheck.resetInMs,
      retryAfter: Math.ceil(rateLimitCheck.resetInMs / 1000), // seconds
    });
  }

  // Check budget
  const budgetCheck = budgetManager.checkBudget(userId);
  if (!budgetCheck.allowed) {
    logger.warn({
      userId,
      reason: budgetCheck.reason,
      limit: budgetCheck.limit,
      current: budgetCheck.current,
    }, 'Budget limit exceeded');

    return res.status(402).json({ // 402 Payment Required
      error: 'budget_exceeded',
      message: `Budget limit exceeded: ${budgetCheck.reason}`,
      reason: budgetCheck.reason,
      limit: budgetCheck.limit,
      current: budgetCheck.current,
    });
  }

  // Log warnings if approaching limits
  if (budgetCheck.warnings && budgetCheck.warnings.length > 0) {
    logger.warn({
      userId,
      warnings: budgetCheck.warnings,
    }, 'Budget warning: approaching limits');
  }

  // Attach budget info to request for usage recording later
  req.budgetInfo = {
    userId,
    budgetCheck,
  };

  next();
}

module.exports = { budgetMiddleware };
