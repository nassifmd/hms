const logger = require("./logger");

// Lightweight in-memory Redis-like shim to remove external Redis dependency.
// Implements the subset of methods used across the app (get/set/hash/list/publish/subscribe/etc.).
class InMemoryRedis {
  constructor() {
    this.store = new Map(); // key -> { value, expiresAt }
    this.hashes = new Map(); // key -> Map(field -> value)
    this.lists = new Map(); // key -> Array
    this.channels = new Map(); // channel -> [callbacks]
    this.rateWindows = new Map(); // key -> [timestamps]

    // client and subscriber compatibility with original code.
    const self = this;
    this.client = {
      status: "ready",
      _inMemory: true,
      ping: async () => "PONG",
      quit: async () => true,
      multi: () => self.multi(),
    };
    this.subscriber = { quit: async () => true };

    // periodic cleanup of expired keys
    this._cleanupInterval = setInterval(
      () => this._cleanupExpired(),
      60 * 1000
    );
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt && v.expiresAt <= now) this.store.delete(k);
    }
  }

  _isExpired(entry) {
    return entry && entry.expiresAt && entry.expiresAt <= Date.now();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry || this._isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttl = 0) {
    const expiresAt = ttl && ttl > 0 ? Date.now() + ttl * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return true;
  }

  async setnx(key, value, ttl = 0) {
    const existing = this.store.get(key);
    if (existing && !this._isExpired(existing)) return false;
    await this.set(key, value, ttl);
    return true;
  }

  async del(key) {
    if (Array.isArray(key)) {
      for (const k of key) this.store.delete(k);
      return true;
    }
    this.store.delete(key);
    this.hashes.delete(key);
    this.lists.delete(key);
    return true;
  }

  async clearPattern(pattern) {
    // convert Redis-style pattern to RegExp: '*' -> '.*'
    const regex = new RegExp(
      "^" + pattern.split("*").map(this._escapeRegExp).join(".*") + "$"
    );
    let count = 0;
    for (const k of Array.from(this.store.keys())) {
      if (regex.test(k)) {
        this.store.delete(k);
        count++;
      }
    }
    for (const k of Array.from(this.hashes.keys())) {
      if (regex.test(k)) {
        this.hashes.delete(k);
        count++;
      }
    }
    for (const k of Array.from(this.lists.keys())) {
      if (regex.test(k)) {
        this.lists.delete(k);
        count++;
      }
    }
    return count;
  }

  _escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async exists(key) {
    return this.store.has(key) ? true : false;
  }

  async ttl(key) {
    const entry = this.store.get(key);
    if (!entry) return -2; // key does not exist
    if (!entry.expiresAt) return -1; // no TTL
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async incr(key) {
    const cur = await this.get(key);
    const n = Number.isFinite(Number(cur)) ? Number(cur) + 1 : 1;
    await this.set(key, n);
    return n;
  }

  async expire(key, ttl) {
    const entry = this.store.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttl * 1000;
    this.store.set(key, entry);
    return true;
  }

  // Hashes
  async hset(key, field, value) {
    let m = this.hashes.get(key);
    if (!m) {
      m = new Map();
      this.hashes.set(key, m);
    }
    m.set(field, value);
    return 1;
  }

  async hget(key, field) {
    const m = this.hashes.get(key);
    if (!m) return null;
    return m.has(field) ? m.get(field) : null;
  }

  async hgetall(key) {
    const m = this.hashes.get(key);
    if (!m) return {};
    const obj = {};
    for (const [f, v] of m.entries()) obj[f] = v;
    return obj;
  }

  // Lists
  async lpush(key, value) {
    const arr = this.lists.get(key) || [];
    arr.unshift(value);
    this.lists.set(key, arr);
    return arr.length;
  }

  async rpop(key) {
    const arr = this.lists.get(key) || [];
    const val = arr.pop();
    this.lists.set(key, arr);
    return val === undefined ? null : val;
  }

  async lrange(key, start = 0, stop = -1) {
    const arr = this.lists.get(key) || [];
    const len = arr.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop + 1 : stop + 1;
    return arr.slice(s, e);
  }

  async ltrim(key, start = 0, stop = -1) {
    const arr = this.lists.get(key) || [];
    const newArr = await this.lrange(key, start, stop);
    this.lists.set(key, newArr);
    return true;
  }

  async lset(key, index, value) {
    const arr = this.lists.get(key) || [];
    const idx = index < 0 ? arr.length + index : index;
    if (idx < 0 || idx >= arr.length) throw new Error("index out of range");
    arr[idx] = value;
    this.lists.set(key, arr);
    return true;
  }

  async lrem(key, count, value) {
    const arr = this.lists.get(key) || [];
    let removed = 0;
    if (count === 0) {
      const filtered = arr.filter((v) => {
        if (v === value) {
          removed++;
          return false;
        }
        return true;
      });
      this.lists.set(key, filtered);
      return removed;
    }
    // remove from head or tail depending on sign of count
    const res = [];
    if (count > 0) {
      for (const v of arr) {
        if (v === value && removed < count) {
          removed++;
          continue;
        }
        res.push(v);
      }
    } else {
      for (let i = arr.length - 1; i >= 0; i--) {
        const v = arr[i];
        if (v === value && removed < Math.abs(count)) {
          removed++;
          arr.splice(i, 1);
        }
      }
      this.lists.set(key, arr);
      return removed;
    }
    this.lists.set(key, res);
    return removed;
  }

  // Pub/Sub (in-process)
  async publish(channel, message) {
    const subs = this.channels.get(channel) || [];
    for (const cb of subs) {
      try {
        cb(message);
      } catch (e) {
        logger.error("pub/sub handler error", e.message);
      }
    }
    return subs.length;
  }

  async subscribe(channel, callback) {
    const subs = this.channels.get(channel) || [];
    subs.push(callback);
    this.channels.set(channel, subs);
    return true;
  }

  // Stub for redis.client.multi() used by the rate limiter.
  // Returns a chainable mock that records operations and replays
  // them individually on exec().
  multi() {
    const self = this;
    const ops = [];
    const mock = {
      zremrangebyscore(key, min, max) {
        ops.push({ cmd: "zremrangebyscore", args: [key, min, max] });
        return mock;
      },
      zadd(key, score, member) {
        ops.push({ cmd: "zadd", args: [key, score, member] });
        return mock;
      },
      zcard(key) {
        ops.push({ cmd: "zcard", args: [key] });
        return mock;
      },
      expire(key, ttl) {
        ops.push({ cmd: "expire", args: [key, ttl] });
        return mock;
      },
      async exec() {
        const results = [];
        for (const op of ops) {
          try {
            if (op.cmd === "zremrangebyscore") {
              // Not implemented for in-memory; treat as no-op
              results.push([null, 0]);
            } else if (op.cmd === "zadd") {
              // Not implemented; treat as no-op
              results.push([null, 1]);
            } else if (op.cmd === "zcard") {
              results.push([null, 1]);
            } else if (op.cmd === "expire") {
              await self.expire(op.args[0], op.args[1]);
              results.push([null, true]);
            } else {
              results.push([null, null]);
            }
          } catch (err) {
            results.push([err, null]);
          }
        }
        return results;
      },
    };
    return mock;
  }

  // Simple token-bucket / sliding-window rate limit emulation
  async rateLimit(key, limit, windowSec) {
    const now = Date.now();
    const win = this.rateWindows.get(key) || [];
    const windowStart = now - windowSec * 1000;
    const newWin = win.filter((ts) => ts > windowStart);
    newWin.push(now);
    this.rateWindows.set(key, newWin);
    const allowed = newWin.length <= limit;
    return {
      allowed,
      current: newWin.length,
      limit,
      reset: windowStart + windowSec * 1000,
    };
  }

  // Close/cleanup
  async close() {
    clearInterval(this._cleanupInterval);
    return true;
  }
}

// In production, a real Redis instance (REDIS_URL) must be configured.
// The InMemoryRedis shim is only safe for single-instance development.
if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
  logger.error(
    "REDIS_URL must be configured in production. " +
      "Without it, token blacklisting, rate limiting, and cache are not shared across instances."
  );
  throw new Error("REDIS_URL is required in production mode");
}

module.exports = new InMemoryRedis();
