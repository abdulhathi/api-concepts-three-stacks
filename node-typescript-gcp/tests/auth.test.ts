import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { startServer } from './helpers.js';

const encode = (secret: string) => new TextEncoder().encode(secret);
const DEV_SECRET = 'dev-only-secret-change-me-0123456789abcdef';

function claims(overrides: { iss?: string; aud?: string; exp?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: 'products:read' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(overrides.iss ?? 'api-concepts')
    .setAudience(overrides.aud ?? 'api-concepts-clients')
    .setSubject('reader')
    .setIssuedAt(now - 100)
    .setExpirationTime(overrides.exp ?? now + 600)
    .setJti('test');
}

describe('Authentication and authorization', () => {
  it('10 a missing token is 401 with WWW-Authenticate', async () => {
    const s = await startServer();
    const res = await s.api.get('/v1/me');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer realm="api-concepts"');
    expect(res.body.type).toBe('/problems/unauthorized');
  });

  it('10 a rejected token adds error="invalid_token"', async () => {
    const s = await startServer();
    const res = await s.api.get('/v1/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer realm="api-concepts", error="invalid_token"');
  });

  it('11 a token without the scope is 403 and names the scope it needed', async () => {
    const s = await startServer();
    const res = await s.api.post('/v1/products').set(await s.bearer('reader')).send({ title: 'T', author: 'A', priceCents: 1 });
    expect(res.status).toBe(403);
    expect(res.headers['www-authenticate']).toBe('Bearer realm="api-concepts", error="insufficient_scope", scope="products:write"');
    expect(res.body.type).toBe('/problems/forbidden');
  });

  it("11 another client's order is 404 for everything except admin", async () => {
    const s = await startServer();
    const order = await s.api
      .post('/v1/orders')
      .set(await s.bearer('writer'))
      .set('Idempotency-Key', 'k1')
      .send({ items: [{ productId: 'prd_01', quantity: 1 }] });
    const url = `/v1/orders/${order.body.id}`;
    expect((await s.api.get(url).set(await s.bearer('writer'))).status).toBe(200);
    expect((await s.api.get(url).set(await s.bearer('partner'))).status).toBe(404);
    expect((await s.api.post(`${url}/pay`).set(await s.bearer('partner'))).status).toBe(404);
    expect((await s.api.get(url).set(await s.bearer('admin'))).status).toBe(200);
    expect((await s.api.get('/v1/orders').set(await s.bearer('partner'))).body.data).toEqual([]);
    expect((await s.api.get('/v1/orders').set(await s.bearer('admin'))).body.data).toHaveLength(1);
  });

  it('12 tokens are HS256 JWTs with the required claims', async () => {
    const s = await startServer();
    const token = await s.token('writer');
    const [header, payload] = token.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part!, 'base64url').toString()));
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toMatchObject({
      iss: 'api-concepts',
      aud: 'api-concepts-clients',
      sub: 'writer',
      scope: 'products:read products:write orders:read orders:write',
    });
    expect(payload.exp - payload.iat).toBe(900);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('12 expired, wrong-issuer, wrong-audience, badly signed and alg=none tokens are rejected', async () => {
    const s = await startServer();
    const now = Math.floor(Date.now() / 1000);
    const rejected = [
      await claims({ exp: now - 1 }).sign(encode(DEV_SECRET)),
      await claims({ iss: 'someone-else' }).sign(encode(DEV_SECRET)),
      await claims({ aud: 'other' }).sign(encode(DEV_SECRET)),
      await claims().sign(encode('another-secret-that-is-at-least-32-bytes!')),
      `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'api-concepts', aud: 'api-concepts-clients', sub: 'admin', scope: 'admin', exp: now + 60, iat: now, jti: 'x' })).toString('base64url')}.`,
    ];
    for (const token of rejected) {
      expect((await s.api.get('/v1/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    }
    const valid = await claims().sign(encode(DEV_SECRET));
    expect((await s.api.get('/v1/me').set('Authorization', `Bearer ${valid}`)).status).toBe(200);
  });

  it('12 /v1/me reports the caller, scopes, plan and expiry', async () => {
    const s = await startServer();
    const me = (await s.api.get('/v1/me').set(await s.bearer('free'))).body;
    expect(me).toMatchObject({ clientId: 'free', scopes: ['products:read'], plan: 'free' });
    expect(me.tokenExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/);
  });

  it('13 client credentials work with Basic auth and with form fields', async () => {
    const s = await startServer();
    const basic = await s.api.post('/oauth/token').auth('reader', 'reader-secret').type('form').send({ grant_type: 'client_credentials' });
    expect(basic.status).toBe(200);
    expect(basic.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'products:read orders:read' });
    expect(basic.headers['cache-control']).toBe('no-store');
    const post = await s.api
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'client_credentials', client_id: 'admin', client_secret: 'admin-secret', scope: 'admin' });
    expect(post.body.scope).toBe('admin');
  });

  it('13 token errors follow RFC 6749', async () => {
    const s = await startServer();
    const badSecret = await s.api.post('/oauth/token').auth('reader', 'nope').type('form').send({ grant_type: 'client_credentials' });
    expect(badSecret.status).toBe(401);
    expect(badSecret.body.error).toBe('invalid_client');
    expect(badSecret.headers['www-authenticate']).toBe('Basic realm="api-concepts"');
    const grant = await s.api.post('/oauth/token').auth('reader', 'reader-secret').type('form').send({ grant_type: 'password' });
    expect(grant.status).toBe(400);
    expect(grant.body.error).toBe('unsupported_grant_type');
    const scope = await s.api.post('/oauth/token').auth('reader', 'reader-secret').type('form').send({ grant_type: 'client_credentials', scope: 'admin' });
    expect(scope.status).toBe(400);
    expect(scope.body.error).toBe('invalid_scope');
    const missing = await s.api.post('/oauth/token').auth('reader', 'reader-secret').type('form').send({});
    expect(missing.body.error).toBe('invalid_request');
  });

  it('13 a narrower requested scope limits what the token can do', async () => {
    const s = await startServer();
    const token = await s.token('writer', 'products:read');
    expect((await s.api.get('/v1/products').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await s.api.get('/v1/orders').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });
});
