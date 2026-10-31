// Concepts 25 and 26 · Webhook delivery: signed POSTs in the background, retried with exponential backoff and jitter.
import type { Order } from '../orders/schema.js';
import type { EventPublisher } from '../orders/service.js';
import { newId } from '../util/ids.js';
import { isoTimestamp, sleep } from '../util/time.js';
import type { WebhookRepository } from './repository.js';
import type { Delivery, Subscription, WebhookEventType } from './schema.js';
import { signWebhook } from './signature.js';

export interface DispatcherOptions {
  retryBaseMs: number;
  maxAttempts: number;
  attemptTimeoutMs?: number;
  fetch?: typeof fetch;
  random?: () => number;
}

/** Delay before retry n (1-based): random(0.5, 1.0) x min(60 s, base x 2^(n-1)). */
export function webhookRetryDelay(retry: number, baseMs: number, random: () => number = Math.random): number {
  return (0.5 + random() * 0.5) * Math.min(60_000, baseMs * 2 ** (retry - 1));
}

export class WebhookDispatcher implements EventPublisher {
  private readonly inFlight = new Set<Promise<void>>();
  private readonly send: typeof fetch;

  constructor(
    private readonly repository: WebhookRepository,
    private readonly options: DispatcherOptions,
  ) {
    this.send = options.fetch ?? fetch;
  }

  /** Queues deliveries and returns immediately: the API response never waits for a receiver. */
  publish(type: WebhookEventType, data: { order: Order }): void {
    const task = this.fanOut(type, data).catch(() => undefined);
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task));
  }

  /** Resolves when every delivery started so far has finished (used by tests and graceful shutdown). */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  private async fanOut(type: WebhookEventType, data: { order: Order }): Promise<void> {
    const subscribers = (await this.repository.listSubscriptions()).filter((s) => s.events.includes(type));
    if (subscribers.length === 0) return;
    const event = { id: newId('evt'), type, createdAt: isoTimestamp(Date.now()), data };
    const body = JSON.stringify(event);
    await Promise.all(subscribers.map((subscriber) => this.deliver(subscriber, event, body)));
  }

  private async deliver(
    subscriber: Subscription,
    event: { id: string; type: WebhookEventType },
    body: string,
  ): Promise<void> {
    const now = isoTimestamp(Date.now());
    const delivery: Delivery = {
      id: newId('dlv'),
      eventId: event.id,
      eventType: event.type,
      status: 'pending',
      attempts: 0,
      lastStatusCode: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    const persist = () => {
      delivery.updatedAt = isoTimestamp(Date.now());
      return this.repository.saveDelivery(subscriber.id, delivery);
    };
    await persist();

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      delivery.attempts = attempt;
      const outcome = await this.attempt(subscriber, event.id, body);
      delivery.lastStatusCode = outcome.statusCode;
      delivery.lastError = outcome.error;
      if (outcome.ok) {
        delivery.status = 'succeeded';
        return persist();
      }
      const lastAttempt = attempt === this.options.maxAttempts;
      if (lastAttempt) delivery.status = 'failed';
      await persist();
      if (lastAttempt) return;
      await sleep(webhookRetryDelay(attempt, this.options.retryBaseMs, this.options.random));
    }
  }

  private async attempt(
    subscriber: Subscription,
    eventId: string,
    body: string,
  ): Promise<{ ok: boolean; statusCode: number | null; error: string | null }> {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      const response = await this.send(subscriber.url, {
        method: 'POST',
        body,
        redirect: 'manual', // a receiver must not bounce us to an internal address
        signal: AbortSignal.timeout(this.options.attemptTimeoutMs ?? 5000),
        headers: {
          'Content-Type': 'application/json',
          'Webhook-Id': eventId,
          'Webhook-Timestamp': String(timestamp),
          'Webhook-Signature': signWebhook(subscriber.secret, timestamp, body),
        },
      });
      await response.body?.cancel();
      const ok = response.status >= 200 && response.status < 300;
      return { ok, statusCode: response.status, error: ok ? null : `Receiver answered HTTP ${response.status}` };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return { ok: false, statusCode: null, error: timedOut ? 'Receiver did not answer in time' : 'Could not reach receiver' };
    }
  }
}
