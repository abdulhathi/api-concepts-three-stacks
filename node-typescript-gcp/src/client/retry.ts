// Concepts 23 and 25 · Retries and exponential backoff with jitter: the policy, separate from the HTTP plumbing.

export const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

/** Repeating a request is only safe when it cannot do its work twice. */
export function isSafeToRetry(method: string, headers: Headers): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase()) || headers.has('Idempotency-Key');
}

/** random(0.5, 1.0) x min(cap, base x 2^(retry-1)): the "equal jitter" variant, never zero, never a stampede. */
export function backoffDelay(retry: number, baseMs: number, capMs: number, random: () => number = Math.random): number {
  return (0.5 + random() * 0.5) * Math.min(capMs, baseMs * 2 ** (retry - 1));
}

/** Retry-After as milliseconds: delta-seconds or an HTTP date. Undefined when absent or unreadable. */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
