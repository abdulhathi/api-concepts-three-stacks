import { describe, expect, it } from 'vitest';
import type { Response } from 'supertest';
import { startServer } from './helpers.js';

describe('Pagination and caching', () => {
  it('18 cursor pagination visits all 25 seeded products exactly once, in order', async () => {
    const s = await startServer();
    const headers = await s.bearer('reader');
    const ids: string[] = [];
    let url: string | undefined = '/v1/products?limit=10';
    let pages = 0;
    while (url) {
      const res: Response = await s.api.get(url).set(headers);
      ids.push(...res.body.data.map((p: { id: string }) => p.id));
      pages++;
      expect(res.body.page.limit).toBe(10);
      if (res.body.page.hasMore) {
        expect(res.body.page.nextCursor).toEqual(expect.any(String));
        url = /<([^>]+)>; rel="next"/.exec(res.headers.link!)![1];
      } else {
        expect(res.body.page.nextCursor).toBeNull();
        expect(res.headers.link).toBeUndefined();
        url = undefined;
      }
    }
    expect(pages).toBe(3);
    expect(ids).toEqual(Array.from({ length: 25 }, (_, i) => `prd_${String(i + 1).padStart(2, '0')}`));
  });

  it('18 a cursor that does not decode is 400 invalid-cursor', async () => {
    const s = await startServer();
    const res = await s.api.get('/v1/products?cursor=garbage').set(await s.bearer('reader'));
    expect(res.status).toBe(400);
    expect(res.body.type).toBe('/problems/invalid-cursor');
  });

  it('18 cursors stay valid when new products are added', async () => {
    const s = await startServer();
    const headers = await s.bearer('admin');
    const first = await s.api.get('/v1/products?limit=24').set(headers);
    await s.api.post('/v1/products').set(headers).send({ title: 'New', author: 'A', priceCents: 1 });
    const second = await s.api.get(`/v1/products?limit=24&cursor=${encodeURIComponent(first.body.page.nextCursor)}`).set(headers);
    expect(second.body.data.map((p: { id: string }) => p.id)[0]).toBe('prd_25');
    expect(second.body.data).toHaveLength(2);
  });

  it('19 a product has a strong ETag and If-None-Match returns 304 without a body', async () => {
    const s = await startServer();
    const headers = await s.bearer('reader');
    const first = await s.api.get('/v1/products/prd_01').set(headers);
    expect(first.headers.etag).toBe('"prd_01-v1"');
    expect(first.headers['cache-control']).toBe('private, max-age=60');
    const cached = await s.api.get('/v1/products/prd_01').set(headers).set('If-None-Match', '"prd_01-v1"');
    expect(cached.status).toBe(304);
    expect(cached.text).toBe('');
    expect(cached.headers.etag).toBe('"prd_01-v1"');
    expect(cached.headers['cache-control']).toBe('private, max-age=60');
    expect((await s.api.get('/v1/products/prd_01').set(headers).set('If-None-Match', '*')).status).toBe(304);
    expect((await s.api.get('/v1/products/prd_01').set(headers).set('If-None-Match', '"other"')).status).toBe(200);
  });

  it('19 the list has a weak ETag that changes when the data changes', async () => {
    const s = await startServer();
    const reader = await s.bearer('reader');
    const first = await s.api.get('/v1/products?limit=3').set(reader);
    expect(first.headers.etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(first.headers['cache-control']).toBe('private, max-age=30');
    expect((await s.api.get('/v1/products?limit=3').set(reader).set('If-None-Match', first.headers.etag!)).status).toBe(304);
    await s.api.patch('/v1/products/prd_01').set(await s.bearer('writer')).send({ priceCents: 1 });
    expect((await s.api.get('/v1/products?limit=3').set(reader).set('If-None-Match', first.headers.etag!)).status).toBe(200);
  });

  it('19 If-Match with a stale ETag is 412 and a fresh one succeeds', async () => {
    const s = await startServer();
    const headers = await s.bearer('admin');
    const url = '/v1/products/prd_02';
    const stale = await s.api.patch(url).set(headers).set('If-Match', '"prd_02-v7"').send({ priceCents: 1 });
    expect(stale.status).toBe(412);
    expect(stale.body.type).toBe('/problems/precondition-failed');
    const ok = await s.api.patch(url).set(headers).set('If-Match', '"prd_02-v1"').send({ priceCents: 1 });
    expect(ok.status).toBe(200);
    expect(ok.headers.etag).toBe('"prd_02-v2"');
    expect((await s.api.put(url).set(headers).set('If-Match', '"prd_02-v1"').send({ title: 'a', author: 'b', priceCents: 1, tags: [] })).status).toBe(412);
    expect((await s.api.delete(url).set(headers).set('If-Match', '"prd_02-v1"')).status).toBe(412);
    expect((await s.api.delete(url).set(headers).set('If-Match', '"prd_02-v2"')).status).toBe(204);
  });
});
