import { describe, expect, it } from 'vitest';
import { webhookRetryDelay } from '../src/webhooks/dispatcher.js';
import { signWebhook, verifyWebhookSignature } from '../src/webhooks/signature.js';
import { startReceiver, startServer, type TestServer } from './helpers.js';

const order = { items: [{ productId: 'prd_01', quantity: 1 }] };

async function subscribe(s: TestServer, url: string, events = ['order.created', 'order.paid']) {
  const res = await s.api.post('/v1/webhooks').set(await s.bearer('admin')).send({ url, events });
  expect(res.status).toBe(201);
  return res.body as { id: string; secret: string };
}

describe('Webhooks', () => {
  it('26 subscribing returns a secret once and the list never shows it', async () => {
    const s = await startServer();
    const admin = await s.bearer('admin');
    const created = await s.api.post('/v1/webhooks').set(admin).send({ url: 'https://example.com/hook', events: ['order.paid'] });
    expect(created.body.id).toMatch(/^whk_[0-9a-f]{12}$/);
    expect(created.body.secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    const list = await s.api.get('/v1/webhooks').set(admin);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).not.toHaveProperty('secret');
    expect((await s.api.delete(`/v1/webhooks/${created.body.id}`).set(admin)).status).toBe(204);
    expect((await s.api.delete(`/v1/webhooks/${created.body.id}`).set(admin)).status).toBe(404);
  });

  it('26 subscription input is validated and needs the admin scope', async () => {
    const s = await startServer();
    const admin = await s.bearer('admin');
    expect((await s.api.post('/v1/webhooks').set(admin).send({ url: 'ftp://x', events: ['order.paid'] })).status).toBe(400);
    expect((await s.api.post('/v1/webhooks').set(admin).send({ url: 'https://x.test', events: [] })).status).toBe(400);
    expect((await s.api.post('/v1/webhooks').set(admin).send({ url: 'https://x.test', events: ['nope'] })).status).toBe(400);
    expect((await s.api.get('/v1/webhooks').set(await s.bearer('writer'))).status).toBe(403);
  });

  it('26 a created order is delivered with a signature the receiver can verify', async () => {
    const s = await startServer();
    const receiver = await startReceiver();
    const sub = await subscribe(s, receiver.url, ['order.created']);
    const created = await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'w1').send(order);
    await s.webhooks.idle();

    expect(receiver.received).toHaveLength(1);
    const { headers, body } = receiver.received[0]!;
    const event = JSON.parse(body);
    expect(event).toMatchObject({ type: 'order.created', data: { order: { id: created.body.id } } });
    expect(event.id).toMatch(/^evt_[0-9a-f]{12}$/);
    expect(headers['webhook-id']).toBe(event.id);
    expect(headers['content-type']).toBe('application/json');
    expect(headers['webhook-signature']).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(
      verifyWebhookSignature({
        secret: sub.secret,
        timestamp: String(headers['webhook-timestamp']),
        signature: String(headers['webhook-signature']),
        rawBody: body,
      }),
    ).toBe(true);

    const log = await s.api.get(`/v1/webhooks/${sub.id}/deliveries`).set(await s.bearer('admin'));
    expect(log.body.data).toEqual([
      expect.objectContaining({ eventId: event.id, eventType: 'order.created', status: 'succeeded', attempts: 1, lastStatusCode: 204, lastError: null }),
    ]);
  });

  it('26 only subscribers of the event type get it, and an idempotent replay emits nothing new', async () => {
    const s = await startServer();
    const created = await startReceiver();
    const paid = await startReceiver();
    await subscribe(s, created.url, ['order.created']);
    await subscribe(s, paid.url, ['order.paid']);
    const writer = await s.bearer('writer');
    const first = await s.api.post('/v1/orders').set(writer).set('Idempotency-Key', 'e').send(order);
    await s.api.post('/v1/orders').set(writer).set('Idempotency-Key', 'e').send(order); // replay
    await s.api.post(`/v1/orders/${first.body.id}/pay`).set(writer);
    await s.api.post(`/v1/orders/${first.body.id}/pay`).set(writer); // already paid: no event
    await s.webhooks.idle();
    expect(created.received).toHaveLength(1);
    expect(paid.received).toHaveLength(1);
    expect(JSON.parse(paid.received[0]!.body).type).toBe('order.paid');
  });

  it('25 a failing receiver is retried with backoff until it succeeds', async () => {
    const s = await startServer({ WEBHOOK_RETRY_BASE_MS: '10', WEBHOOK_MAX_ATTEMPTS: '5' });
    const receiver = await startReceiver(2);
    const sub = await subscribe(s, receiver.url, ['order.created']);
    await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'r').send(order);
    await s.webhooks.idle();
    expect(receiver.received).toHaveLength(3);
    const [delivery] = (await s.api.get(`/v1/webhooks/${sub.id}/deliveries`).set(await s.bearer('admin'))).body.data;
    expect(delivery).toMatchObject({ status: 'succeeded', attempts: 3, lastStatusCode: 204 });
  });

  it('25 a receiver that never recovers ends as failed after WEBHOOK_MAX_ATTEMPTS', async () => {
    const s = await startServer({ WEBHOOK_RETRY_BASE_MS: '5', WEBHOOK_MAX_ATTEMPTS: '3' });
    const receiver = await startReceiver(99);
    const sub = await subscribe(s, receiver.url, ['order.created']);
    await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'f').send(order);
    await s.webhooks.idle();
    expect(receiver.received).toHaveLength(3);
    const [delivery] = (await s.api.get(`/v1/webhooks/${sub.id}/deliveries`).set(await s.bearer('admin'))).body.data;
    expect(delivery).toMatchObject({ status: 'failed', attempts: 3, lastStatusCode: 500, lastError: 'Receiver answered HTTP 500' });
  });

  it('26 an unreachable receiver never slows the API response', async () => {
    const s = await startServer({ WEBHOOK_RETRY_BASE_MS: '5', WEBHOOK_MAX_ATTEMPTS: '2' });
    await subscribe(s, 'http://127.0.0.1:1/unreachable', ['order.created']);
    const started = Date.now();
    const res = await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'u').send(order);
    expect(res.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(500);
    await s.webhooks.idle();
  });

  it('25 retry delays double from the base, are jittered 50-100%, and are capped at 60 s', () => {
    expect(webhookRetryDelay(1, 500, () => 0)).toBe(250);
    expect(webhookRetryDelay(1, 500, () => 1)).toBe(500);
    expect(webhookRetryDelay(3, 500, () => 1)).toBe(2000);
    expect(webhookRetryDelay(20, 500, () => 1)).toBe(60_000);
  });

  it('26 verification rejects tampering, wrong secrets and stale timestamps', () => {
    const secret = 'whsec_abc';
    const now = 1_800_000_000;
    const body = '{"id":"evt_1"}';
    const signature = signWebhook(secret, now, body);
    const verify = (overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
      verifyWebhookSignature({ secret, timestamp: String(now), signature, rawBody: body, nowSeconds: now + 10, ...overrides });
    expect(verify()).toBe(true);
    expect(verify({ rawBody: '{"id":"evt_2"}' })).toBe(false);
    expect(verify({ secret: 'whsec_other' })).toBe(false);
    expect(verify({ nowSeconds: now + 301 })).toBe(false);
    expect(verify({ nowSeconds: now - 301 })).toBe(false);
    expect(verify({ signature: 'v1=short' })).toBe(false);
    expect(verify({ signature: `v1=old ${signature}` })).toBe(true); // rotation: any listed signature may match
  });
});
