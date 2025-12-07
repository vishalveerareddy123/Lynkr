const logger = require("../logger");

/**
 * Circuit Breaker Pattern
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 *
 * Performance:
 * - Fail fast instead of waiting for timeouts
 * - Automatic recovery testing
 * - Minimal overhead in CLOSED state
 */

const STATE = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;

    // Configuration
    this.failureThreshold = options.failureThreshold || 5; // failures before opening
    this.successThreshold = options.successThreshold || 2; // successes to close from half-open
    this.timeout = options.timeout || 60000; // time to wait before trying again (60s)
    this.resetTimeout = options.resetTimeout || 30000; // time in half-open before resetting (30s)

    // State
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.lastStateChange = Date.now();

    // Metrics
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalRejected: 0,
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    this.stats.totalRequests++;

    // Check circuit state
    if (this.state === STATE.OPEN) {
      if (Date.now() < this.nextAttempt) {
        this.stats.totalRejected++;
        throw new CircuitBreakerError(
          `Circuit breaker ${this.name} is OPEN`,
          this.nextAttempt - Date.now()
        );
      }

      // Try half-open
      this.transitionTo(STATE.HALF_OPEN);
    }

    try {
      const result = await fn();

      // Success
      this.onSuccess();
      return result;
    } catch (err) {
      // Failure
      this.onFailure();
      throw err;
    }
  }

  /**
   * Handle successful request
   */
  onSuccess() {
    this.stats.totalSuccesses++;
    this.failureCount = 0;

    if (this.state === STATE.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.transitionTo(STATE.CLOSED);
      }
    }
  }

  /**
   * Handle failed request
   */
  onFailure() {
    this.stats.totalFailures++;
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.transitionTo(STATE.OPEN);
    }
  }

  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;
    this.lastStateChange = Date.now();

    logger.info(
      {
        circuitBreaker: this.name,
        oldState,
        newState,
        failureCount: this.failureCount,
        successCount: this.successCount,
      },
      "Circuit breaker state change"
    );

    // Set next attempt time when opening
    if (newState === STATE.OPEN) {
      this.nextAttempt = Date.now() + this.timeout;
      logger.warn(
        {
          circuitBreaker: this.name,
          retryAfter: this.timeout,
        },
        "Circuit breaker opened - failing fast"
      );
    }

    // Reset counters
    if (newState === STATE.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      logger.info(
        {
          circuitBreaker: this.name,
        },
        "Circuit breaker closed - normal operation resumed"
      );
    }

    if (newState === STATE.HALF_OPEN) {
      this.successCount = 0;
      logger.info(
        {
          circuitBreaker: this.name,
        },
        "Circuit breaker half-open - testing service recovery"
      );
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
      lastStateChange: this.lastStateChange,
      stats: this.stats,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    this.transitionTo(STATE.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
  }
}

/**
 * Circuit breaker error
 */
class CircuitBreakerError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = "CircuitBreakerError";
    this.retryAfter = retryAfter;
    this.code = "circuit_breaker_open";
  }
}

/**
 * Circuit breaker registry
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create circuit breaker
   */
  get(name, options) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll() {
    return Array.from(this.breakers.values()).map((breaker) => breaker.getState());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Singleton registry
let registry = null;

function getCircuitBreakerRegistry() {
  if (!registry) {
    registry = new CircuitBreakerRegistry();
  }
  return registry;
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerRegistry,
  getCircuitBreakerRegistry,
  STATE,
};
