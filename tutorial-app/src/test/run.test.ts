import { describe, expect, it } from 'vitest';
import { check, curlFor, fill, missingVars, pick, prepare, type Result } from '../practice/run';

const res = (status: number, headers: Record<string, string>, body?: unknown): Result => ({
  status,
  statusText: '',
  headers: Object.entries(headers),
  text: body === undefined ? '' : JSON.stringify(body),
  json: body,
  ms: 5,
});

describe('practice requests', () => {
  it('fills placeholders and lists the ones without a value', () => {
    expect(fill('/v1/orders/{{ORDER_ID}}?k={{KEY}}', { ORDER_ID: 'ord_1' })).toBe('/v1/orders/ord_1?k={{KEY}}');
    expect(missingVars({ method: 'GET', path: '/v1/orders/{{ORDER_ID}}', headers: { 'If-Match': '{{ETAG}}' } }, { ORDER_ID: 'x' })).toEqual(['ETAG']);
  });

  it('prepares JSON, form and Basic bodies with their headers', () => {
    const j = prepare({ method: 'POST', path: '/v1/orders', json: { items: [{ productId: '{{P}}' }] } }, { P: 'prd_01' }, 'tok');
    expect(j.body).toBe('{"items":[{"productId":"prd_01"}]}');
    expect(j.headers).toEqual([['Content-Type', 'application/json'], ['Authorization', 'Bearer tok']]);
    const f = prepare({ method: 'POST', path: '/oauth/token', form: { grant_type: 'client_credentials' }, basic: ['reader', 'reader-secret'] }, {});
    expect(f.body).toBe('grant_type=client_credentials');
    expect(f.headers[1]).toEqual(['Authorization', `Basic ${btoa('reader:reader-secret')}`]);
  });

  it('checks status, header and body expectations', () => {
    const r = res(201, { location: '/v1/orders/ord_1', 'idempotent-replayed': 'true' }, { id: 'ord_1', items: [{ quantity: 2 }] });
    const checks = check({ status: 201, headers: { Location: '~/v1/orders/', 'Idempotent-Replayed': 'true', ETag: false }, body: { id: '*', 'items.0.quantity': 2, 'items.length': 1 } }, [r]);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(check({ statuses: { 200: 2, 429: 1 } }, [res(200, {}), res(200, {}), res(429, {})]).every((c) => c.ok)).toBe(true);
    expect(check({ status: 200 }, [res(500, {})])[0]).toMatchObject({ ok: false, detail: 'got 500' });
    expect(pick(r, 'header.Location')).toBe('/v1/orders/ord_1');
  });

  it('writes the same request as a curl command for the chosen stack', () => {
    const curl = curlFor({ method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY}}' }, json: { a: 1 } }, 'node', {});
    expect(curl).toBe(`curl -si -X POST "http://localhost:8002/v1/orders" \\\n  -H "Authorization: Bearer $WRITER_TOKEN" \\\n  -H "Idempotency-Key: $KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"a":1}'`);
  });
});
