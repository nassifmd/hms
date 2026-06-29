const redis = require('../config/redis');
const logger = require('../config/logger');

/**
 * Rate limiter using Redis for distributed environments
 */
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
    this.max = options.max || 100; // 100 requests per window default
    this.message = options.message || 'Too many requests, please try again later.';
    this.statusCode = options.statusCode || 429;
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
    this.skip = options.skip || (() => false);
    this.useRedis = options.useRedis !== false;
  }

  defaultKeyGenerator(req) {
    return req.user?.userId || req.ip;
  }

  async middleware(req, res, next) {
    try {
      // Skip rate limiting if condition met
      if (this.skip(req)) {
        return next();
      }

      const key = this.keyGenerator(req);
      const now = Date.now();
      const windowStart = now - this.windowMs;

      if (this.useRedis) {
        // Use Redis for distributed rate limiting
        const redisKey = `rate_limit:${key}`;
        
        // Remove old entries and add current request
        const multi = redis.client.multi();
        multi.zremrangebyscore(redisKey, 0, windowStart);
        multi.zadd(redisKey, now, `${now}-${Math.random()}`);
        multi.zcard(redisKey);
        multi.expire(redisKey, Math.ceil(this.windowMs / 1000));

        const results = await multi.exec();
        const requestCount = results[2][1];

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.max - requestCount));
        res.setHeader('X-RateLimit-Reset', Math.ceil((windowStart + this.windowMs) / 1000));

        if (requestCount > this.max) {
          logger.warn('Rate limit exceeded', {
            key,
            count: requestCount,
            limit: this.max,
            path: req.path
          });

          return res.status(this.statusCode).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: this.message
            }
          });
        }
      } else {
        // Use in-memory store (for development or single instance)
        if (!global.rateLimitStore) {
          global.rateLimitStore = new Map();
        }

        const store = global.rateLimitStore;
        const userRequests = store.get(key) || [];
        
        // Filter requests within window
        const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
        
        // Set headers
        res.setHeader('X-RateLimit-Limit', this.max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.max - validRequests.length));
        res.setHeader('X-RateLimit-Reset', Math.ceil((windowStart + this.windowMs) / 1000));

        if (validRequests.length >= this.max) {
          logger.warn('Rate limit exceeded', {
            key,
            count: validRequests.length,
            limit: this.max,
            path: req.path
          });

          return res.status(this.statusCode).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: this.message
            }
          });
        }

        // Add current request
        validRequests.push(now);
        store.set(key, validRequests);

        // Clean up old entries periodically
        if (Math.random() < 0.01) { // 1% chance on each request
          for (const [k, timestamps] of store.entries()) {
            const valid = timestamps.filter(t => t > Date.now() - this.windowMs);
            if (valid.length === 0) {
              store.delete(k);
            } else {
              store.set(k, valid);
            }
          }
        }
      }

      next();
    } catch (error) {
      // If rate limiting fails, allow the request (fail open)
      logger.error('Rate limiter error:', error);
      next();
    }
  }

  /**
   * Create a rate limiter instance with custom options
   */
  static create(options) {
    const limiter = new RateLimiter(options);
    return limiter.middleware.bind(limiter);
  }
}

/**
 * Pre-configured rate limiters for different use cases
 */
const rateLimiters = {
  // Strict limiter for login attempts
  login: RateLimiter.create({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many login attempts. Please try again in 15 minutes.'
  }),

  // Moderate limiter for API endpoints
  api: RateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: 'Too many requests. Please slow down.'
  }),

  // Loose limiter for public endpoints
  public: RateLimiter.create({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many requests. Please try again later.'
  }),

  // Strict limiter for sensitive operations
  sensitive: RateLimiter.create({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many attempts. Please try again in an hour.'
  }),

  // No limit for internal services
  internal: RateLimiter.create({
    skip: (req) => req.headers['x-internal-service'] === process.env.INTERNAL_SECRET
  })
};

module.exports = rateLimiters;