const redis = require("../../config/redis");

describe("InMemoryRedis", () => {
  beforeEach(async () => {
    // Clear all state between tests
    redis.store.clear();
    redis.hashes.clear();
    redis.lists.clear();
    redis.channels.clear();
    redis.rateWindows.clear();
  });

  describe("get / set", () => {
    it("set creates a key and get retrieves its value", async () => {
      await redis.set("mykey", "myvalue");
      const val = await redis.get("mykey");
      expect(val).toBe("myvalue");
    });

    it("get returns null for missing key", async () => {
      const val = await redis.get("nonexistent");
      expect(val).toBe(null);
    });

    it("get returns null for expired key", async () => {
      await redis.set("temp", "val");
      await redis.expire("temp", 0);
      // Wait a tick for the expiry to trigger
      await new Promise((r) => setTimeout(r, 10));
      const val = await redis.get("temp");
      expect(val).toBe(null);
    });
  });

  describe("del", () => {
    it("deletes a single key", async () => {
      await redis.set("key1", "val1");
      await redis.del("key1");
      expect(await redis.get("key1")).toBe(null);
    });

    it("deletes multiple keys passed as array", async () => {
      await redis.set("k1", "v1");
      await redis.set("k2", "v2");
      await redis.del(["k1", "k2"]);
      expect(await redis.get("k1")).toBe(null);
      expect(await redis.get("k2")).toBe(null);
    });
  });

  describe("setnx", () => {
    it("sets a key that does not exist", async () => {
      const result = await redis.setnx("newkey", "val");
      expect(result).toBe(true);
      expect(await redis.get("newkey")).toBe("val");
    });

    it("does not overwrite an existing key", async () => {
      await redis.set("key", "original");
      const result = await redis.setnx("key", "overwrite");
      expect(result).toBe(false);
      expect(await redis.get("key")).toBe("original");
    });
  });

  describe("exists", () => {
    it("returns true for existing key", async () => {
      await redis.set("key", "val");
      expect(await redis.exists("key")).toBe(true);
    });

    it("returns false for missing key", async () => {
      expect(await redis.exists("nonexistent")).toBe(false);
    });
  });

  describe("ttl", () => {
    it("returns -1 for key without TTL", async () => {
      await redis.set("key", "val");
      const ttl = await redis.ttl("key");
      expect(ttl).toBe(-1);
    });

    it("returns -2 for non-existent key", async () => {
      expect(await redis.ttl("nonexistent")).toBe(-2);
    });

    it("returns positive number for key with TTL", async () => {
      await redis.set("key", "val", 10);
      const ttl = await redis.ttl("key");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });
  });

  describe("incr", () => {
    it("increments a key starting from 0", async () => {
      const result = await redis.incr("counter");
      expect(result).toBe(1);
    });

    it("increments existing value", async () => {
      await redis.set("counter", 5);
      expect(await redis.incr("counter")).toBe(6);
    });
  });

  describe("expire", () => {
    it("sets TTL on an existing key", async () => {
      await redis.set("key", "val");
      const result = await redis.expire("key", 60);
      expect(result).toBe(true);
      const entry = redis.store.get("key");
      expect(entry.expiresAt).toBeGreaterThan(Date.now());
    });

    it("returns false for non-existent key", async () => {
      expect(await redis.expire("noexist", 60)).toBe(false);
    });
  });

  describe("hset / hget / hgetall", () => {
    it("hset/hget stores and retrieves hash fields", async () => {
      await redis.hset("user:1", "name", "Alice");
      await redis.hset("user:1", "age", "30");
      expect(await redis.hget("user:1", "name")).toBe("Alice");
      expect(await redis.hget("user:1", "age")).toBe("30");
    });

    it("hget returns null for missing hash or field", async () => {
      expect(await redis.hget("nonexistent", "field")).toBe(null);
      await redis.hset("hash", "f1", "v1");
      expect(await redis.hget("hash", "missing")).toBe(null);
    });

    it("hgetall returns all fields", async () => {
      await redis.hset("user:1", "name", "Alice");
      await redis.hset("user:1", "age", "30");
      const all = await redis.hgetall("user:1");
      expect(all).toEqual({ name: "Alice", age: "30" });
    });

    it("hgetall returns empty object for missing hash", async () => {
      expect(await redis.hgetall("noexist")).toEqual({});
    });
  });

  describe("lpush / rpop / lrange", () => {
    it("lpush adds items to the left", async () => {
      expect(await redis.lpush("list", "a")).toBe(1);
      expect(await redis.lpush("list", "b")).toBe(2);
      expect(await redis.lrange("list", 0, -1)).toEqual(["b", "a"]);
    });

    it("rpop removes and returns from the right", async () => {
      await redis.lpush("list", "x");
      await redis.lpush("list", "y");
      expect(await redis.rpop("list")).toBe("x");
      expect(await redis.rpop("list")).toBe("y");
      expect(await redis.rpop("list")).toBe(null);
    });
  });

  describe("ltrim / lset / lrem", () => {
    it("ltrims the list", async () => {
      await redis.lpush("list", "c");
      await redis.lpush("list", "b");
      await redis.lpush("list", "a");
      await redis.ltrim("list", 0, 1);
      expect(await redis.lrange("list", 0, -1)).toEqual(["a", "b"]);
    });

    it("lset sets value at index", async () => {
      await redis.lpush("list", "a");
      await redis.lpush("list", "b");
      await redis.lset("list", 0, "z");
      expect(await redis.lrange("list", 0, -1)).toEqual(["z", "a"]);
    });

    it("lset throws for out of range", async () => {
      await redis.lpush("list", "a");
      await expect(redis.lset("list", 5, "x")).rejects.toThrow("index out of range");
    });

    it("lrem removes elements by value", async () => {
      await redis.lpush("list", "a");
      await redis.lpush("list", "b");
      await redis.lpush("list", "a");
      const removed = await redis.lrem("list", 1, "a");
      expect(removed).toBe(1);
      expect(await redis.lrange("list", 0, -1)).toEqual(["b", "a"]);
    });

    it("lrem with count 0 removes all", async () => {
      await redis.lpush("list", "a");
      await redis.lpush("list", "b");
      await redis.lpush("list", "a");
      const removed = await redis.lrem("list", 0, "a");
      expect(removed).toBe(2);
      expect(await redis.lrange("list", 0, -1)).toEqual(["b"]);
    });
  });

  describe("clearPattern", () => {
    it("deletes keys matching wildcard pattern", async () => {
      await redis.set("session:user:1", "a");
      await redis.set("session:user:2", "b");
      await redis.set("other:key", "c");
      const count = await redis.clearPattern("session:*");
      expect(count).toBe(2);
      expect(await redis.get("session:user:1")).toBe(null);
      expect(await redis.get("session:user:2")).toBe(null);
      expect(await redis.get("other:key")).toBe("c");
    });
  });

  describe("publish / subscribe", () => {
    it("delivers published messages to subscribers", (done) => {
      redis.subscribe("test-channel", (message) => {
        expect(message).toBe("hello");
        done();
      });
      redis.publish("test-channel", "hello");
    });
  });

  describe("multi()", () => {
    it("returns a chainable mock", async () => {
      const multi = redis.multi();
      expect(multi).toHaveProperty("zremrangebyscore");
      expect(multi).toHaveProperty("zadd");
      expect(multi).toHaveProperty("zcard");
      expect(multi).toHaveProperty("expire");
      expect(multi).toHaveProperty("exec");

      const results = await multi
        .zremrangebyscore("key", 0, 100)
        .zadd("key", 1, "member")
        .zcard("key")
        .expire("key", 60)
        .exec();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(4);
    });
  });

  describe("rateLimit", () => {
    it("allows requests under the limit", async () => {
      const result = await redis.rateLimit("ip:test", 5, 60);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.limit).toBe(5);
    });

    it("blocks requests over the limit", async () => {
      const key = "ip:block-test";
      for (let i = 0; i < 3; i++) {
        await redis.rateLimit(key, 2, 60);
      }
      const result = await redis.rateLimit(key, 2, 60);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(4);
    });
  });

  describe("client", () => {
    it("ping returns PONG", async () => {
      expect(await redis.client.ping()).toBe("PONG");
    });

    it("quit returns true", async () => {
      expect(await redis.client.quit()).toBe(true);
    });
  });
});
