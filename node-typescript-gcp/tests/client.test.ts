import { describe, expect, it } from 'vitest';
import { ApiError, BookshopClient, backoffDelay, isSafeToRetry, retryAfterMs, type ClientOptions, type RetryEvent } from '../src/client/index.js';
import { startServer, type TestServer } from './helpers.js';

/** Fast client for tests: tiny backoff, and the waits are recorded instead of slept. */
function makeClient(s: TestServer, overrides: Partial<ClientOptions> = {}) {
  const waits: number[] = [];
  const events: RetryEvent[] = [];
  const client = new BookshopClient({
    baseUrl: s.baseUrl,
    clientId: 'writer',
    clientSecret: 'writer-secret',
    backoffBaseMs: 4,
    backoffCapMs: 16,
    random: () => 1,
    sleep: async (ms) => void waits.push(ms),
    onRetry: (event) => events.push(event),
    ...overrides,
  });
  return { client, waits, events };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('Typed client: retries, timeouts and backoff', () => {
  it('23 retries a flaky endpoint until it succeeds', async () => {
    const s = await startServer();
    const { client, events } = makeClient(s);
    const result = await client.flaky('c-1', 2);
    expect(result).toEqual({ key: 'c-1', attempts: 3 });
    expect(events.map((e) => e.reason)).toEqual(['HTTP 503', 'HTTP 503']);
  });

  it('23 gives up after 4 attempts with a typed error carrying the problem details', async () => {
    const s = await startServer();
    const { client } = makeClient(s);
    const error = await client.flaky('c-2', 10).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect(api.status).toBe(503);
    expect(api.attempts).toBe(4);
    expect(api.problem).toMatchObject({ type: '/problems/service-unavailable', status: 503 });
  });

  it('23 never retries other 4xx or 5xx responses', async () => {
    const s = await startServer();
    const { client, events } = makeClient(s);
    const notFound = (await client.getProduct('nope').catch((e: unknown) => e)) as ApiError;
    expect(notFound.status).toBe(404);
    expect(notFound.attempts).toBe(1);
    const crash = (await client.request('GET', '/v1/demo/crash').catch((e: unknown) => e)) as ApiError;
    expect(crash.status).toBe(500);
    expect(events).toHaveLength(0);
  });

  it('23 only retries a POST that carries an Idempotency-Key', () => {
    expect(isSafeToRetry('GET', new Headers())).toBe(true);
    expect(isSafeToRetry('DELETE', new Headers())).toBe(true);
    expect(isSafeToRetry('POST', new Headers())).toBe(false);
    expect(isSafeToRetry('PATCH', new Headers())).toBe(false);
    expect(isSafeToRetry('POST', new Headers({ 'Idempotency-Key': 'k' }))).toBe(true);
  });

  it('23 a POST without a key is not retried', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async (input) => {
      if (String(input).endsWith('/oauth/token')) return json(200, { access_token: 't', expires_in: 900 });
      calls++;
      return json(503, { type: '/problems/service-unavailable', title: 'x', status: 503 });
    };
    const s = await startServer();
    const { client } = makeClient(s, { fetch: fakeFetch });
    await expect(client.request('POST', '/v1/anything', { body: {} })).rejects.toMatchObject({ status: 503, attempts: 1 });
    expect(calls).toBe(1);
  });

  it('23 createOrder reuses one Idempotency-Key on every attempt, so a lost response creates one order', async () => {
    const s = await startServer();
    const keys: string[] = [];
    let first = true;
    const flakyFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith('/v1/orders') && init?.method === 'POST') {
        keys.push(new Headers(init.headers).get('Idempotency-Key')!);
        if (first) {
          first = false;
          throw new TypeError('connection reset'); // the server processed it, but the answer was lost
        }
      }
      return response;
    };
    const { client } = makeClient(s, { fetch: flakyFetch });
    const order = await client.createOrder([{ productId: 'prd_01', quantity: 1 }]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(order.status).toBe('pending');
    const orders = await s.api.get('/v1/orders').set(await s.bearer('writer'));
    expect(orders.body.data).toHaveLength(1);
  });

  it('25 backoff doubles from the base, is jittered between 50% and 100%, and is capped', async () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffDelay(n, 200, 5000, () => 1))).toEqual([200, 400, 800, 1600, 3200]);
    expect(backoffDelay(6, 200, 5000, () => 1)).toBe(5000);
    expect(backoffDelay(1, 200, 5000, () => 0)).toBe(100);
    const s = await startServer();
    const { events, client } = makeClient(s);
    await client.flaky('c-3', 3);
    expect(events.map((e) => [e.source, e.delayMs])).toEqual([['backoff', 4], ['backoff', 8], ['backoff', 16]]);
  });

  it('25 Retry-After wins over computed backoff, as seconds or an HTTP date', async () => {
    expect(retryAfterMs('2')).toBe(2000);
    expect(retryAfterMs('Wed, 21 Oct 2026 07:28:05 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(5000);
    expect(retryAfterMs('soon')).toBeUndefined();

    const answers = [json(429, { type: '/problems/rate-limited', title: 'x', status: 429 }, { 'Retry-After': '2' }), json(200, { key: 'k', attempts: 1 })];
    const fakeFetch: typeof fetch = async (input) =>
      String(input).endsWith('/oauth/token') ? json(200, { access_token: 't', expires_in: 900 }) : answers.shift()!;
    const s = await startServer();
    const { client, waits, events } = makeClient(s, { fetch: fakeFetch });
    await client.flaky('k', 0);
    expect(waits).toEqual([2000]);
    expect(events[0]).toMatchObject({ source: 'retry-after', reason: 'HTTP 429' });
  });

  it('24 a per-attempt timeout aborts a hung request and the next attempt can succeed', async () => {
    let calls = 0;
    const hangingFetch: typeof fetch = (input, init) => {
      if (String(input).endsWith('/oauth/token')) return Promise.resolve(json(200, { access_token: 't', expires_in: 900 }));
      if (++calls === 1) {
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
      }
      return Promise.resolve(json(200, { key: 'k', attempts: 1 }));
    };
    const s = await startServer();
    const { client, events } = makeClient(s, { fetch: hangingFetch, timeoutMs: 50 });
    await expect(client.flaky('k', 0)).resolves.toEqual({ key: 'k', attempts: 1 });
    expect(events[0]).toMatchObject({ reason: 'timeout' });
  });

  it('24 when every attempt times out the error says so and has status 0', async () => {
    const neverFetch: typeof fetch = (input, init) =>
      String(input).endsWith('/oauth/token')
        ? Promise.resolve(json(200, { access_token: 't', expires_in: 900 }))
        : new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    const s = await startServer();
    const { client } = makeClient(s, { fetch: neverFetch, timeoutMs: 20, maxRetries: 1 });
    await expect(client.flaky('k', 0)).rejects.toMatchObject({ status: 0, attempts: 2, message: expect.stringContaining('timeout') });
  });

  it('13 the client caches its token until 30 seconds before expiry', async () => {
    let tokenCalls = 0;
    let clock = 0;
    const fakeFetch: typeof fetch = async (input) => {
      if (String(input).endsWith('/oauth/token')) {
        tokenCalls++;
        return json(200, { access_token: `t${tokenCalls}`, expires_in: 100 });
      }
      return json(200, { key: 'k', attempts: 1 });
    };
    const s = await startServer();
    const { client } = makeClient(s, { fetch: fakeFetch, now: () => clock });
    await client.flaky('k', 0);
    clock = 69_000; // 31 s left
    await client.flaky('k', 0);
    expect(tokenCalls).toBe(1);
    clock = 71_000; // 29 s left: refresh
    await client.flaky('k', 0);
    expect(tokenCalls).toBe(2);
  });

  it('18 allProducts follows cursors across every page', async () => {
    const s = await startServer();
    const { client } = makeClient(s);
    const ids: string[] = [];
    for await (const product of client.allProducts({ limit: 7 })) ids.push(product.id);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });
});
