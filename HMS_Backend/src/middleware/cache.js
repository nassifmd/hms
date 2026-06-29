const redis = require('../config/redis');
const logger = require('../config/logger');

/**
 * Cache middleware using Redis
 */
class CacheMiddleware {
  constructor(options = {}) {
    this.ttl = options.ttl || 300; // 5 minutes default
    this.keyPrefix = options.keyPrefix || 'cache:';
    this.excludePaths = options.excludePaths || [];
    this.excludeMethods = options.excludeMethods || ['POST', 'PUT', 'DELETE', 'PATCH'];
    this.condition = options.condition || (() => true);
  }

  /**
   * Generate cache key from request
   */
  generateKey(req) {
    const parts = [
      this.keyPrefix,
      req.method,
      req.originalUrl || req.url,
      req.user?.userId || 'anonymous',
      req.user?.facilityId || 'all'
    ];

    // Add query parameters if present
    if (Object.keys(req.query).length > 0) {
      parts.push(JSON.stringify(req.query));
    }

    return parts.join(':').replace(/\s+/g, '_');
  }

  /**
   * Check if request should be cached
   */
  shouldCache(req) {
    // Skip excluded methods
    if (this.excludeMethods.includes(req.method)) {
      return false;
    }

    // Skip excluded paths
    if (this.excludePaths.some(path => req.path.includes(path))) {
      return false;
    }

    // Check custom condition
    if (!this.condition(req)) {
      return false;
    }

    return true;
  }

  /**
   * Get cached response
   */
  async getFromCache(key) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        logger.debug(`Cache hit: ${key}`);
        return cached;
      }
    } catch (error) {
      logger.error('Cache get error:', error);
    }
    return null;
  }

  /**
   * Save response to cache
   */
  async saveToCache(key, data) {
    try {
      await redis.set(key, data, this.ttl);
      logger.debug(`Cache set: ${key} (TTL: ${this.ttl}s)`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Cache middleware
   */
  middleware = async (req, res, next) => {
    if (!this.shouldCache(req)) {
      return next();
    }

    const key = this.generateKey(req);
    const cachedResponse = await this.getFromCache(key);

    if (cachedResponse) {
      return res
        .setHeader('X-Cache', 'HIT')
        .setHeader('X-Cache-Key', key)
        .status(200)
        .json(JSON.parse(cachedResponse));
    }

    // Store original json function
    const originalJson = res.json;

    // Override json function
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Save to cache asynchronously
        const cacheMiddleware = this;
        setTimeout(() => {
          cacheMiddleware.saveToCache(key, JSON.stringify(data));
        }, 0);
      }

      // Set cache headers
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', key);
      res.setHeader('Cache-Control', `public, max-age=${this.ttl}`);

      // Call original json
      return originalJson.call(this, data);
    }.bind(this);

    next();
  };

  /**
   * Clear cache by pattern
   */
  static async clear(pattern) {
    try {
      const keys = await redis.client.keys(`cache:${pattern}*`);
      if (keys.length > 0) {
        await redis.client.del(keys);
        logger.info(`Cleared ${keys.length} cache keys matching: ${pattern}`);
      }
      return keys.length;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  static async clearAll() {
    return CacheMiddleware.clear('*');
  }
}

/**
 * Create a cache middleware instance with options
 */
const cache = (options = {}) => {
  const instance = new CacheMiddleware(options);
  return instance.middleware;
};

/**
 * Pre-configured cache instances
 */
const caches = {
  // Short cache (1 minute)
  short: cache({ ttl: 60 }),

  // Medium cache (5 minutes)
  medium: cache({ ttl: 300 }),

  // Long cache (1 hour)
  long: cache({ ttl: 3600 }),

  // Very long cache (1 day) - for static data
  day: cache({ ttl: 86400 }),

  // No cache for dynamic data
  none: cache({
    condition: () => false
  }),

  // Cache only for GET requests
  getOnly: cache({
    excludeMethods: ['POST', 'PUT', 'DELETE', 'PATCH']
  }),

  // Cache by user
  byUser: cache({
    keyPrefix: 'cache:user:',
    condition: (req) => !!req.user?.userId
  }),

  // Cache by facility
  byFacility: cache({
    keyPrefix: 'cache:facility:',
    condition: (req) => !!req.user?.facilityId
  })
};

module.exports = {
  cache,
  caches,
  CacheMiddleware
};