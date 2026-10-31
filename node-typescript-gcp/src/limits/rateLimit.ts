// Concept 20 · Rate limiting: token bucket per client, capacity and refill rate set by the client's plan.
import type { RequestHandler } from 'express';
import { principalOf } from '../auth/authenticate.js';
import type { Plan } from '../auth/principal.js';
import { ApiProblem } from '../http/problem.js';
import { systemClock, type Clock } from '../util/time.js';

/** Requests per minute. */
export const PLAN_LIMITS: Record<Plan, number> = { free: 5, standard: 1000 };

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until one more token exists (0 while tokens remain). */
  resetSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly clock: Clock = systemClock) {}

  /** Refills the bucket for the time elapsed, then tries to take one token. */
  take(key: string, limitPerMinute: number): RateLimitResult {
    const now = this.clock();
    const ratePerMs = limitPerMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: limitPerMinute, updatedAt: now };
    bucket.tokens = Math.min(limitPerMinute, bucket.tokens + (now - bucket.updatedAt) * ratePerMs);
    bucket.updatedAt = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);

    const remaining = Math.floor(bucket.tokens);
    const resetSeconds = remaining > 0 ? 0 : Math.ceil((1 - bucket.tokens) / (ratePerMs * 1000));
    return { allowed, limit: limitPerMinute, remaining, resetSeconds };
  }
}

export function rateLimit(limiter: TokenBucketLimiter): RequestHandler {
  return (req, res, next) => {
    const principal = principalOf(req);
    const result = limiter.take(principal.clientId, PLAN_LIMITS[principal.plan]);
    res.setHeader('RateLimit-Limit', String(result.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(result.resetSeconds));
    if (!result.allowed) {
      throw new ApiProblem('rate-limited', `Rate limit of ${result.limit} requests per minute exceeded.`, {
        headers: { 'Retry-After': String(Math.max(1, result.resetSeconds)) },
      });
    }
    next();
  };
}
