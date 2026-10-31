import { describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from '../src/limits/rateLimit.js';
import { ConcurrencyThrottle, ThrottleFullError } from '../src/limits/throttle.js';
import { startServer } from './helpers.js';

describe('Rate limiting', () => {
  it('20 the free plan allows 5 requests then 429 with Retry-After and RateLimit headers', async () => {
    const s = await startServer();
    const headers = await s.bearer('free');
    const remaining: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await s.api.get('/v1/products').set(headers);
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('5');
      remaining.push(res.headers['ratelimit-remaining']!);
    }
    expect(remaining).toEqual(['4', '3', '2', '1', '0']);
    const limited = await s.api.get('/v1/products').set(headers);
    expect(limited.status).toBe(429);
    expect(limited.body.type).toBe('/problems/rate-limited');
    expect(limited.headers['retry-after']).toBe('12'); // one token every 60 / 5 seconds
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(limited.headers['ratelimit-reset']).toBe('12');
  });

  it('20 buckets are per client and unauthenticated requests are not counted', async () => {
    const s = await startServer();
    for (let i = 0; i < 6; i++) await s.api.get('/v1/products');
    const standard = await s.api.get('/v1/products').set(await s.bearer('reader'));
    expect(standard.headers['ratelimit-limit']).toBe('1000');
    expect(standard.headers['ratelimit-remaining']).toBe('999');
    expect(standard.headers['ratelimit-reset']).toBe('0');
    expect((await s.api.get('/health')).headers['ratelimit-limit']).toBeUndefined();
  });

  it('20 the bucket refills continuously with time', () => {
    let now = 0;
    const limiter = new TokenBucketLimiter(() => now);
    for (let i = 0; i < 5; i++) expect(limiter.take('c', 5).allowed).toBe(true);
    expect(limiter.take('c', 5)).toMatchObject({ allowed: false, remaining: 0, resetSeconds: 12 });
    now = 6_000; // half a token
    expect(limiter.take('c', 5)).toMatchObject({ allowed: false, resetSeconds: 6 });
    now = 12_000;
    expect(limiter.take('c', 5)).toMatchObject({ allowed: true, remaining: 0 });
    now = 600_000; // long idle: capped at capacity
    expect(limiter.take('c', 5).remaining).toBe(4);
  });
});

describe('Throttling and timeouts', () => {
  it('21 two reports run, two wait, and the fifth and sixth get 503 throttled with Retry-After', async () => {
    const s = await startServer({ REQUEST_TIMEOUT_MS: '5000' });
    const headers = await s.bearer('reader');
    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => s.api.get('/v1/reports/sales?delayMs=300').set(headers)),
    );
    const ok = results.filter((r) => r.status === 200);
    const shed = results.filter((r) => r.status === 503);
    expect(ok).toHaveLength(4);
    expect(shed).toHaveLength(2);
    for (const r of shed) {
      expect(r.body.type).toBe('/problems/throttled');
      expect(r.headers['retry-after']).toBe('1');
    }
    expect(Date.now() - started).toBeGreaterThanOrEqual(550); // the queued two waited for a free slot
    expect(ok[0]!.body).toMatchObject({ orderCount: 0, paidCount: 0, revenueCents: 0 });
  });

  it('21 the throttle runs queued work in FIFO order and frees slots', async () => {
    const throttle = new ConcurrencyThrottle(1, 1);
    const order: string[] = [];
    const task = (name: string) => async () => {
      order.push(name);
      await new Promise((resolve) => setTimeout(resolve, 20));
    };
    const a = throttle.run(task('a'));
    const b = throttle.run(task('b'));
    await expect(throttle.run(task('c'))).rejects.toBeInstanceOf(ThrottleFullError);
    await Promise.all([a, b]);
    expect(order).toEqual(['a', 'b']);
    await throttle.run(task('d'));
    expect(throttle.stats).toEqual({ running: 0, waiting: 0 });
  });

  it('24 a report slower than REQUEST_TIMEOUT_MS is cancelled with 504 at the deadline', async () => {
    const s = await startServer({ REQUEST_TIMEOUT_MS: '200' });
    const started = Date.now();
    const res = await s.api.get('/v1/reports/sales?delayMs=3000').set(await s.bearer('reader'));
    expect(res.status).toBe(504);
    expect(res.body.type).toBe('/problems/timeout');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('24 a timed-out report frees its slot', async () => {
    const s = await startServer({ REQUEST_TIMEOUT_MS: '100' });
    const headers = await s.bearer('reader');
    const slow = await Promise.all(Array.from({ length: 4 }, () => s.api.get('/v1/reports/sales?delayMs=5000').set(headers)));
    expect(slow.map((r) => r.status)).toEqual([504, 504, 504, 504]);
    expect((await s.api.get('/v1/reports/sales?delayMs=0').set(headers)).status).toBe(200);
  });

  it('24 the report counts paid revenue only', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const one = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', '1').send({ items: [{ productId: 'prd_01', quantity: 1 }] });
    await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', '2').send({ items: [{ productId: 'prd_02', quantity: 1 }] });
    await s.api.post(`/v1/orders/${one.body.id}/pay`).set(headers);
    const report = await s.api.get('/v1/reports/sales?delayMs=0').set(headers);
    expect(report.body).toMatchObject({ orderCount: 2, paidCount: 1, revenueCents: 3499 });
    expect(report.body.generatedAt).toMatch(/Z$/);
  });
});

describe('Flaky endpoint', () => {
  it('23 fails the planned number of times per key, then succeeds', async () => {
    const s = await startServer();
    const headers = await s.bearer('reader');
    const calls = [];
    for (let i = 0; i < 4; i++) calls.push(await s.api.get('/v1/demo/flaky?key=k1&failTimes=2').set(headers));
    expect(calls.map((c) => c.status)).toEqual([503, 503, 200, 200]);
    expect(calls[0]!.body.type).toBe('/problems/service-unavailable');
    expect(calls[0]!.headers['retry-after']).toBeUndefined();
    expect(calls[3]!.body).toEqual({ key: 'k1', attempts: 4 });
    expect((await s.api.get('/v1/demo/flaky?key=other&failTimes=0').set(headers)).status).toBe(200);
    expect((await s.api.get('/v1/demo/flaky?failTimes=11').set(headers)).status).toBe(400);
  });
});
