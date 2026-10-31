import { describe, expect, it } from 'vitest';
import { InMemoryProductRepository } from '../src/products/repository.js';
import { seedProducts } from '../src/products/seed.js';
import { IdempotencyStore, fingerprintOf } from '../src/idempotency.js';
import { startServer } from './helpers.js';

const order = { items: [{ productId: 'prd_01', quantity: 2 }, { productId: 'prd_02', quantity: 1 }] };

describe('Orders and idempotency', () => {
  it('22 creating an order totals the lines and returns 201 with Location', async () => {
    const s = await startServer();
    const res = await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'a').send(order);
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/v1/orders/${res.body.id}`);
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect(res.body).toMatchObject({ clientId: 'writer', status: 'pending', totalCents: 3499 * 2 + 4299, currency: 'USD' });
    expect(res.body.items[0]).toEqual({ productId: 'prd_01', title: 'HTTP from the Ground Up', quantity: 2, unitPriceCents: 3499, lineTotalCents: 6998 });
  });

  it('22 the Idempotency-Key is required', async () => {
    const s = await startServer();
    const res = await s.api.post('/v1/orders').set(await s.bearer('writer')).send(order);
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('/problems/idempotency-key-required');
    const tooLong = await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'k'.repeat(256)).send(order);
    expect(tooLong.body.type).toBe('/problems/idempotency-key-required');
  });

  it('22 replaying the same key and body returns the stored response without a second order', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const first = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'same').send(order);
    const replay = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'same').send(order);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.headers.location).toBe(first.headers.location);
    expect(replay.body).toEqual(first.body);
    expect((await s.api.get('/v1/orders').set(headers)).body.data).toHaveLength(1);
  });

  it('22 the same key with a different body is 422 idempotency-key-reused', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'k').send(order);
    const reused = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'k').send({ items: [{ productId: 'prd_03', quantity: 1 }] });
    expect(reused.status).toBe(422);
    expect(reused.body.type).toBe('/problems/idempotency-key-reused');
  });

  it('22 keys are scoped to the client', async () => {
    const s = await startServer();
    const a = await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'shared').send(order);
    const b = await s.api.post('/v1/orders').set(await s.bearer('partner')).set('Idempotency-Key', 'shared').send(order);
    expect(b.headers['idempotent-replayed']).toBeUndefined();
    expect(b.body.id).not.toBe(a.body.id);
  });

  it('22 a request that arrives while the first is in flight is 409 idempotency-key-in-progress', async () => {
    // A product repository that takes a moment makes the first request slow enough to overlap the second.
    const slow = new InMemoryProductRepository(seedProducts());
    const findById = slow.findById.bind(slow);
    slow.findById = async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return findById(id);
    };
    const s = await startServer({}, { products: slow });
    const headers = await s.bearer('writer');
    const send = () => s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'race').send(order);
    const first = send().then((response) => response); // .then() is what makes supertest fire the request
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await send();
    expect(second.status).toBe(409);
    expect(second.body.type).toBe('/problems/idempotency-key-in-progress');
    expect((await first).status).toBe(201);
  });

  it('22 failed attempts are not remembered, so the key can be retried', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const bad = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'retry').send({ items: [{ productId: 'nope', quantity: 1 }] });
    expect(bad.status).toBe(422);
    expect(bad.body.type).toBe('/problems/unknown-product');
    const good = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'retry').send({ items: [{ productId: 'nope', quantity: 1 }] });
    expect(good.body.type).toBe('/problems/unknown-product'); // processed again, not 422 key-reused
  });

  it('22 the idempotency store expires entries after 24 hours', () => {
    let now = 0;
    const store = new IdempotencyStore(() => now);
    const print = fingerprintOf(Buffer.from('{}'));
    expect(store.begin('c', 'k', print).kind).toBe('new');
    expect(store.begin('c', 'k', print).kind).toBe('in-progress');
    store.complete('c', 'k', { status: 201, body: '{}', location: '/x' });
    expect(store.begin('c', 'k', print).kind).toBe('replay');
    now = 24 * 60 * 60 * 1000 + 1;
    expect(store.begin('c', 'k', print).kind).toBe('new');
  });

  it('11 paying moves pending to paid once, and a second pay changes nothing', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const created = await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', 'p').send(order);
    const paid = await s.api.post(`/v1/orders/${created.body.id}/pay`).set(headers);
    expect(paid.body.status).toBe('paid');
    const again = await s.api.post(`/v1/orders/${created.body.id}/pay`).set(headers);
    expect(again.body).toEqual(paid.body);
  });

  it('18 the orders list is paginated too', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    for (const key of ['1', '2', '3']) {
      await s.api.post('/v1/orders').set(headers).set('Idempotency-Key', key).send(order);
    }
    const page = await s.api.get('/v1/orders?limit=2').set(headers);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.page.hasMore).toBe(true);
    const next = await s.api.get(/<([^>]+)>/.exec(page.headers.link!)![1]!).set(headers);
    expect(next.body.data).toHaveLength(1);
  });
});
