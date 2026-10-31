import { describe, expect, it } from 'vitest';
import { startServer } from './helpers.js';

describe('HTTP basics', () => {
  it('01 echo returns the request as the server saw it and masks the token', async () => {
    const s = await startServer();
    const res = await s.api
      .post('/v1/echo?a=1&a=2&b=x')
      .set(await s.bearer('reader'))
      .send({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ method: 'POST', path: '/v1/echo', query: { a: '1', b: 'x' }, body: { hello: 'world' } });
    expect(res.body.headers.authorization).toBe('Bearer ***');
    expect(res.body.headers['content-type']).toContain('application/json');
  });

  it('01 every request writes one JSON log line without secrets', async () => {
    const lines: string[] = [];
    const s = await startServer({}, { logSink: (line) => lines.push(line) });
    const headers = await s.bearer('reader');
    await s.api.get('/v1/me').set(headers).set('X-Request-Id', 'log-me');
    const entry = JSON.parse(lines.find((line) => line.includes('/v1/me'))!);
    expect(entry).toMatchObject({ level: 'info', requestId: 'log-me', method: 'GET', path: '/v1/me', status: 200, clientId: 'reader' });
    expect(typeof entry.durationMs).toBe('number');
    expect(lines.join('\n')).not.toContain(headers.Authorization.slice(7));
  });

  it('02 resource routes live under /v1 and the root document links to docs', async () => {
    const s = await startServer();
    expect((await s.api.get('/')).body).toEqual({ name: 'Bookshop API', docs: '/docs', openapi: '/openapi.json' });
    expect((await s.api.get('/health')).body).toEqual({ status: 'ok' });
  });

  it('03 methods map to read, create, replace, patch and delete on products', async () => {
    const s = await startServer();
    const admin = await s.bearer('admin');
    const created = await s.api.post('/v1/products').set(admin).send({ title: 'T', author: 'A', priceCents: 100 });
    expect(created.status).toBe(201);
    const url = `/v1/products/${created.body.id}`;
    expect((await s.api.get(url).set(admin)).status).toBe(200);
    expect((await s.api.put(url).set(admin).send({ title: 'T2', author: 'A', priceCents: 200, tags: ['x'] })).body.title).toBe('T2');
    expect((await s.api.patch(url).set(admin).send({ priceCents: 300 })).body).toMatchObject({ title: 'T2', priceCents: 300, version: 3 });
    expect((await s.api.delete(url).set(admin)).status).toBe(204);
    expect((await s.api.get(url).set(admin)).status).toBe(404);
  });

  it('04 X-Request-Id is echoed when valid and generated otherwise, even on 404s', async () => {
    const s = await startServer();
    expect((await s.api.get('/health').set('X-Request-Id', 'abc-123')).headers['x-request-id']).toBe('abc-123');
    const generated = (await s.api.get('/nope').set('X-Request-Id', 'bad id!')).headers['x-request-id'];
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('04 wrong Content-Type is 415 and a malformed body is 400', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const wrongType = await s.api.post('/v1/products').set(headers).set('Content-Type', 'text/plain').send('hello');
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.type).toBe('/problems/unsupported-media-type');
    const malformed = await s.api.post('/v1/products').set(headers).set('Content-Type', 'application/json').send('{oops');
    expect(malformed.status).toBe(400);
    expect(malformed.body.type).toBe('/problems/malformed-json');
    const patchType = await s.api.patch('/v1/products/prd_01').set(headers).set('Content-Type', 'application/merge-patch+json').send('{"priceCents":1}');
    expect(patchType.status).toBe(200);
  });

  it('04 create returns a Location header', async () => {
    const s = await startServer();
    const res = await s.api.post('/v1/products').set(await s.bearer('writer')).send({ title: 'T', author: 'A', priceCents: 1 });
    expect(res.headers.location).toBe(`/v1/products/${res.body.id}`);
    expect(res.body.id).toMatch(/^prd_[0-9a-f]{12}$/);
  });

  it('05 path and query parameters are validated', async () => {
    const s = await startServer();
    const headers = await s.bearer('reader');
    expect((await s.api.get('/v1/products/prd_05').set(headers)).body.title).toBe('OAuth Without Tears');
    const tagged = await s.api.get('/v1/products?tag=reliability&limit=2').set(headers);
    expect(tagged.body.data.map((p: { id: string }) => p.id)).toEqual(['prd_08', 'prd_09']);
    const bad = await s.api.get('/v1/products?limit=51').set(headers);
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toBe('limit must be between 1 and 50');
    expect(bad.body.errors).toEqual([{ field: 'limit', message: 'must be between 1 and 50' }]);
  });

  it('06 request bodies are validated field by field and unknown properties are ignored', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const bad = await s.api.post('/v1/products').set(headers).send({ title: '   ', author: 'A', priceCents: 1.5, tags: ['OK'] });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['priceCents', 'tags[0]', 'title']);
    const ok = await s.api.post('/v1/products').set(headers).send({ title: ' Padded ', author: 'A', priceCents: 1, extra: true });
    expect(ok.status).toBe(201);
    expect(ok.body.title).toBe('Padded');
    expect(ok.body).not.toHaveProperty('extra');
    const put = await s.api.put('/v1/products/prd_01').set(headers).send({ title: 'x', author: 'y', priceCents: 1 });
    expect(put.status).toBe(400);
  });

  it('07 JSON uses camelCase, integer cents, UTC timestamps and explicit nulls', async () => {
    const s = await startServer();
    const headers = await s.bearer('reader');
    const product = (await s.api.get('/v1/products/prd_01').set(headers)).body;
    expect(product).toEqual({
      id: 'prd_01',
      title: 'HTTP from the Ground Up',
      author: 'Maya Chen',
      priceCents: 3499,
      currency: 'USD',
      tags: ['http', 'basics'],
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const list = await s.api.get('/v1/products?limit=50').set(headers);
    expect(list.body.page.nextCursor).toBeNull();
  });

  it('09 status codes cover the success and error families', async () => {
    const s = await startServer();
    const headers = await s.bearer('writer');
    const statuses = [
      (await s.api.get('/health')).status,
      (await s.api.post('/v1/products').set(headers).send({ title: 'T', author: 'A', priceCents: 1 })).status,
      (await s.api.get('/v1/products/zzz').set(headers)).status,
      (await s.api.get('/v1/me')).status,
      (await s.api.delete('/v1/products/prd_01').set(headers)).status,
    ];
    expect(statuses).toEqual([200, 201, 404, 401, 403]);
  });

  it('14 HSTS is sent only when the request arrived over HTTPS', async () => {
    const s = await startServer();
    const plain = await s.api.get('/health');
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    expect(plain.headers['x-content-type-options']).toBe('nosniff');
    expect(plain.headers['referrer-policy']).toBe('no-referrer');
    const secure = await s.api.get('/health').set('X-Forwarded-Proto', 'https');
    expect(secure.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('15 CORS preflight from an allowed origin skips auth and lists methods and headers', async () => {
    const s = await startServer();
    const res = await s.api
      .options('/v1/products')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toMatch(/GET.*POST.*PUT.*PATCH.*DELETE/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization.*Idempotency-Key.*If-Match/);
    expect(res.headers['access-control-max-age']).toBe('600');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('15 CORS actual requests expose headers and disallowed origins get nothing', async () => {
    const s = await startServer();
    const allowed = await s.api.get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers.vary).toContain('Origin');
    expect(allowed.headers['access-control-expose-headers']).toContain('Idempotent-Replayed');
    const denied = await s.api.get('/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('16 collections link to the next page and creation points at the new resource', async () => {
    const s = await startServer();
    const res = await s.api.get('/v1/products?limit=2&tag=reliability').set(await s.bearer('reader'));
    expect(res.headers.link).toMatch(/^<\/v1\/products\?limit=2&cursor=[^&>]+&tag=reliability>; rel="next"$/);
  });

  it('27 errors are problem+json with request id, instance and no internals on 500', async () => {
    const s = await startServer();
    const crash = await s.api.get('/v1/demo/crash?x=1').set(await s.bearer('reader')).set('X-Request-Id', 'crash-1');
    expect(crash.status).toBe(500);
    expect(crash.headers['content-type']).toContain('application/problem+json');
    expect(crash.body).toMatchObject({
      type: '/problems/internal-error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: '/v1/demo/crash',
      requestId: 'crash-1',
    });
    expect(JSON.stringify(crash.body)).not.toContain('Deliberate');
    const unknown = await s.api.get('/no/such/route');
    expect(unknown.status).toBe(404);
    expect(unknown.body.type).toBe('/problems/not-found');
  });

  it('19 API responses default to no-store', async () => {
    const s = await startServer();
    expect((await s.api.get('/v1/me').set(await s.bearer('reader'))).headers['cache-control']).toBe('no-store');
    expect((await s.api.get('/v1/me')).headers['cache-control']).toBe('no-store');
    expect((await s.api.post('/oauth/token').send('x=1')).headers['cache-control']).toBe('no-store');
  });
});
