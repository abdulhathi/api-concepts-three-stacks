// Concepts 23, 24 and 25 · The typed client: token caching, per-attempt timeout, retries with backoff.
import { randomUUID } from 'node:crypto';
import type { Order } from '../orders/schema.js';
import type { Product } from '../products/schema.js';
import { sleep } from '../util/time.js';
import { ApiError, type ProblemDetails } from './errors.js';
import { backoffDelay, isSafeToRetry, RETRYABLE_STATUSES, retryAfterMs } from './retry.js';

export interface ClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  /** Per-attempt timeout (concept 24). */
  timeoutMs?: number;
  /** Retries after the first attempt, so 3 means up to 4 attempts. */
  maxRetries?: number;
  backoffBaseMs?: number;
  backoffCapMs?: number;
  // Seams for tests and demos.
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (event: RetryEvent) => void;
}

export interface RetryEvent {
  /** The attempt that just failed (1-based). */
  attempt: number;
  delayMs: number;
  reason: string;
  /** Where the delay came from. */
  source: 'retry-after' | 'backoff';
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface Page<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
}

const TOKEN_REFRESH_MARGIN_MS = 30_000;

export class BookshopClient {
  private readonly fetchImpl: typeof fetch;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.wait = options.sleep ?? ((ms) => sleep(ms));
    this.now = options.now ?? Date.now;
  }

  // ---- typed operations -------------------------------------------------------------------------------------

  listProducts(params: { limit?: number; cursor?: string; tag?: string } = {}): Promise<Page<Product>> {
    return this.request('GET', '/v1/products', { query: params });
  }

  /** Follows `nextCursor` until the last page. */
  async *allProducts(params: { limit?: number; tag?: string } = {}): AsyncGenerator<Product> {
    let cursor: string | undefined;
    do {
      const page = await this.listProducts({ ...params, cursor });
      yield* page.data;
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor);
  }

  getProduct(id: string): Promise<Product> {
    return this.request('GET', `/v1/products/${encodeURIComponent(id)}`);
  }

  /** One Idempotency-Key per call, reused on every retry, so a lost response can never create two orders. */
  createOrder(items: Array<{ productId: string; quantity: number }>): Promise<Order> {
    return this.request('POST', '/v1/orders', { body: { items }, headers: { 'Idempotency-Key': randomUUID() } });
  }

  payOrder(id: string): Promise<Order> {
    return this.request('POST', `/v1/orders/${encodeURIComponent(id)}/pay`);
  }

  flaky(key: string, failTimes: number): Promise<{ key: string; attempts: number }> {
    return this.request('GET', '/v1/demo/flaky', { query: { key, failTimes } });
  }

  // ---- transport --------------------------------------------------------------------------------------------

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const headers = new Headers({ Accept: 'application/json', ...options.headers });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const init = { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) };

    const response = await this.withRetries(method, headers, async () => {
      headers.set('Authorization', `Bearer ${await this.accessToken()}`);
      return this.attempt(url, init);
    });
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  /** Runs `send` until it succeeds, fails for good, or the retry budget is spent. */
  private async withRetries(method: string, headers: Headers, send: () => Promise<Response>): Promise<Response> {
    const maxRetries = this.options.maxRetries ?? 3;
    const retryable = isSafeToRetry(method, headers);

    for (let attempt = 1; ; attempt++) {
      let failure: { reason: string; response?: Response; cause?: unknown };
      try {
        const response = await send();
        if (response.ok) return response;
        failure = { reason: `HTTP ${response.status}`, response };
        if (!RETRYABLE_STATUSES.has(response.status)) throw await this.toError(response, attempt);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        failure = { reason: describeNetworkError(error), cause: error };
      }

      if (!retryable || attempt > maxRetries) {
        if (failure.response) throw await this.toError(failure.response, attempt);
        throw new ApiError(`Request failed after ${attempt} attempt(s): ${failure.reason}`, {
          status: 0,
          attempts: attempt,
          cause: failure.cause,
        });
      }

      const serverDelay = retryAfterMs(failure.response?.headers.get('Retry-After') ?? null, this.now());
      const delayMs =
        serverDelay ??
        backoffDelay(attempt, this.options.backoffBaseMs ?? 200, this.options.backoffCapMs ?? 5000, this.options.random);
      this.options.onRetry?.({
        attempt,
        delayMs,
        reason: failure.reason,
        source: serverDelay === undefined ? 'backoff' : 'retry-after',
      });
      await failure.response?.body?.cancel();
      await this.wait(delayMs);
    }
  }

  private attempt(url: URL, init: RequestInit): Promise<Response> {
    return this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000) });
  }

  private async toError(response: Response, attempts: number): Promise<ApiError> {
    const problem = (await response.json().catch(() => undefined)) as ProblemDetails | undefined;
    const summary = problem?.detail ?? problem?.title ?? response.statusText;
    return new ApiError(`${response.status} ${summary}`, { status: response.status, problem, attempts });
  }

  // ---- OAuth client credentials -----------------------------------------------------------------------------

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > this.now()) return this.token.value;

    const { clientId, clientSecret, scope } = this.options;
    const response = await this.fetchImpl(new URL('/oauth/token', this.options.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', ...(scope ? { scope } : {}) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string; error_description?: string };
      throw new ApiError(`Token request failed: ${body.error ?? response.status}`, {
        status: response.status,
        problem: { type: `oauth:${body.error ?? 'error'}`, title: body.error_description ?? 'Token request failed', status: response.status },
        attempts: 1,
      });
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return this.token.value;
  }
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  return error instanceof Error ? error.message : 'network error';
}
