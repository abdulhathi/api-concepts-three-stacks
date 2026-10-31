import { describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers.js';

async function gql(s: TestServer, query: string, headers: Record<string, string>, variables?: object) {
  return s.api.post('/graphql').set(headers).set('Accept', 'application/json').send({ query, variables });
}

describe('GraphQL', () => {
  it('17 a nested query walks order, items and products', async () => {
    const s = await startServer();
    const writer = await s.bearer('writer');
    const created = await s.api
      .post('/v1/orders')
      .set(writer)
      .set('Idempotency-Key', 'g')
      .send({ items: [{ productId: 'prd_06', quantity: 3 }] });
    const res = await gql(
      s,
      'query($id: ID!) { order(id: $id) { id status totalCents items { quantity unitPriceCents product { id title tags } } } }',
      writer,
      { id: created.body.id },
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.data.order).toEqual({
      id: created.body.id,
      status: 'pending',
      totalCents: 11397,
      items: [{ quantity: 3, unitPriceCents: 3799, product: { id: 'prd_06', title: 'The GraphQL Field Guide', tags: ['graphql'] } }],
    });
  });

  it('17 products paginate with endCursor and filter by tag', async () => {
    const s = await startServer();
    const reader = await s.bearer('reader');
    const first = await gql(s, '{ products(first: 2, tag: "reliability") { nodes { id } pageInfo { endCursor hasNextPage } } }', reader);
    expect(first.body.data.products.nodes.map((n: { id: string }) => n.id)).toEqual(['prd_08', 'prd_09']);
    expect(first.body.data.products.pageInfo.hasNextPage).toBe(true);
    const next = await gql(s, 'query($after: String) { products(first: 5, tag: "reliability", after: $after) { nodes { id } pageInfo { endCursor hasNextPage } } }', reader, {
      after: first.body.data.products.pageInfo.endCursor,
    });
    expect(next.body.data.products.nodes.map((n: { id: string }) => n.id)).toEqual(['prd_13', 'prd_23']);
    expect(next.body.data.products.pageInfo.hasNextPage).toBe(false);
    expect((await gql(s, '{ product(id: "prd_01") { id priceCents currency } missing: product(id: "zz") { id } }', reader)).body.data).toEqual({
      product: { id: 'prd_01', priceCents: 3499, currency: 'USD' },
      missing: null,
    });
  });

  it('17 first outside 1-50 and a bad cursor are BAD_USER_INPUT errors', async () => {
    const s = await startServer();
    const reader = await s.bearer('reader');
    const tooMany = await gql(s, '{ products(first: 51) { nodes { id } } }', reader);
    expect(tooMany.status).toBe(200);
    expect(tooMany.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const badCursor = await gql(s, '{ products(after: "junk") { nodes { id } } }', reader);
    expect(badCursor.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  it('17 order without orders:read is a FORBIDDEN field error and data.order is null', async () => {
    const s = await startServer();
    const free = await s.bearer('free');
    const res = await gql(s, '{ order(id: "ord_x") { id } products(first: 1) { nodes { id } } }', free);
    expect(res.status).toBe(200);
    expect(res.body.data.order).toBeNull();
    expect(res.body.data.products.nodes).toHaveLength(1);
    expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it("17 another client's order is null", async () => {
    const s = await startServer();
    const created = await s.api.post('/v1/orders').set(await s.bearer('writer')).set('Idempotency-Key', 'o').send({ items: [{ productId: 'prd_01', quantity: 1 }] });
    const res = await gql(s, `{ order(id: "${created.body.id}") { id } }`, await s.bearer('partner'));
    expect(res.body).toEqual({ data: { order: null } });
  });

  it('17 /graphql needs a token with products:read and a JSON body', async () => {
    const s = await startServer();
    const body = { query: '{ products { nodes { id } } }' };
    const none = await s.api.post('/graphql').send(body);
    expect(none.status).toBe(401);
    expect(none.body.type).toBe('/problems/unauthorized');
    const noScope = await s.api.post('/graphql').set('Authorization', `Bearer ${await s.token('writer', 'orders:read')}`).send(body);
    expect(noScope.status).toBe(403);
    const text = await s.api.post('/graphql').set(await s.bearer('reader')).set('Content-Type', 'text/plain').send('{ products }');
    expect(text.status).toBe(415);
    const empty = await s.api.post('/graphql').set(await s.bearer('reader')).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.type).toBe('/problems/validation-error');
  });
});

describe('OpenAPI', () => {
  it('08 /openapi.json describes every route and reuses the validation schemas', async () => {
    const s = await startServer();
    const res = await s.api.get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.1/);
    const paths = Object.keys(res.body.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/health', '/oauth/token', '/v1/me', '/v1/echo', '/v1/products', '/v1/products/{id}', '/v1/orders', '/v1/orders/{id}',
        '/v1/orders/{id}/pay', '/v1/reports/sales', '/v1/demo/flaky', '/v1/webhooks', '/v1/webhooks/{id}/deliveries', '/graphql',
      ]),
    );
    expect(res.body.components.schemas.Product.properties.priceCents.maximum).toBe(10_000_000);
    expect(res.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    const limit = res.body.paths['/v1/products'].get.parameters.find((p: { name: string }) => p.name === 'limit');
    expect(limit.schema).toMatchObject({ minimum: 1, maximum: 50 });
  });

  it('08 /docs serves the interactive documentation UI', async () => {
    const s = await startServer();
    const res = await s.api.get('/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('/openapi.json');
  });
});
