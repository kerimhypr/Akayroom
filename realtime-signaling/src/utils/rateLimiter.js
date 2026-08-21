"use strict";

const config = require("../config");

/**
 * Sliding window rate limiter per key (IP + userId).
 * Simple in-memory token bucket + window counter.
 */
class RateLimiter {
  constructor(opts = {}) {
    this.windowMs = opts.windowMs ?? config.rateLimit.windowMs;
    this.maxEvents = opts.maxEvents ?? config.rateLimit.maxEvents;
    this.burst = opts.burst ?? config.rateLimit.burst;
    this.banDurationMs = opts.banDurationMs ?? config.rateLimit.banDurationMs;
    this.buckets = new Map(); // key -> { count, windowStart, bannedUntil }
  }

  _now() {
    return Date.now();
  }

  isBanned(key) {
    const b = this.buckets.get(key);
    if (!b || !b.bannedUntil) return false;
    if (this._now() > b.bannedUntil) {
      b.bannedUntil = null;
      b.count = 0;
      b.windowStart = this._now();
      return false;
    }
    return true;
  }

  /**
   * Try to consume 1 event. Returns { allowed, remaining, retryAfterMs, banned }
   */
  consume(key) {
    const now = this._now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, windowStart: now, bannedUntil: null };
      this.buckets.set(key, bucket);
    }
    if (bucket.bannedUntil && now < bucket.bannedUntil) {
      return { allowed: false, banned: true, remaining: 0, retryAfterMs: bucket.bannedUntil - now };
    }
    if (bucket.bannedUntil && now >= bucket.bannedUntil) {
      bucket.bannedUntil = null;
      bucket.count = 0;
      bucket.windowStart = now;
    }
    // Window reset
    if (now - bucket.windowStart >= this.windowMs) {
      bucket.windowStart = now;
      bucket.count = 0;
    }
    // Hard burst check (instant)
    if (bucket.count >= this.burst) {
      bucket.bannedUntil = now + this.banDurationMs;
      return { allowed: false, banned: true, remaining: 0, retryAfterMs: this.banDurationMs };
    }
    if (bucket.count >= this.maxEvents) {
      const retryAfterMs = bucket.windowStart + this.windowMs - now;
      return { allowed: false, banned: false, remaining: 0, retryAfterMs };
    }
    bucket.count += 1;
    return { allowed: true, banned: false, remaining: Math.max(0, this.maxEvents - bucket.count), retryAfterMs: 0 };
  }

  cleanup() {
    const now = this._now();
    for (const [k, b] of this.buckets.entries()) {
      if (b.bannedUntil && now < b.bannedUntil) continue;
      if (now - b.windowStart > this.windowMs * 2 && b.count === 0) this.buckets.delete(k);
    }
  }

  stats() {
    return { keys: this.buckets.size, banned: [...this.buckets.values()].filter((b) => b.bannedUntil).length };
  }
}

module.exports = { RateLimiter };
