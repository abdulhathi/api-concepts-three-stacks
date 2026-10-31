// Concepts 1, 4, 5 and 27 · Echo, "who am I", and the flaky/crash endpoints that exercise retries and error handling.
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/authenticate.js';
import { ApiProblem } from '../http/problem.js';
import { intInRange } from '../http/schemas.js';
import { jsonBody } from '../http/body.js';
import { parse } from '../http/validate.js';
import { isoTimestamp } from '../util/time.js';

export const flakyQuerySchema = z.object({
  key: z.string().min(1, 'must be 1 to 64 characters').max(64, 'must be 1 to 64 characters'),
  failTimes: intInRange('failTimes', 0, 10).default(2),
});

export const echoSchema = z
  .object({
    method: z.string(),
    path: z.string(),
    query: z.record(z.string(), z.string()),
    headers: z.record(z.string(), z.string()),
    body: z.unknown().nullable(),
  })
  .meta({ id: 'Echo' });

export const meSchema = z
  .object({
    clientId: z.string(),
    scopes: z.array(z.string()),
    plan: z.enum(['free', 'standard']),
    tokenExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'Me' });

export const flakyResultSchema = z.object({ key: z.string(), attempts: z.number().int() }).meta({ id: 'FlakyResult' });

export function demoRouter(): Router {
  const router = Router();
  const callsByKey = new Map<string, number>();

  router.get('/me', (req, res) => {
    const principal = principalOf(req);
    res.json({
      clientId: principal.clientId,
      scopes: principal.scopes,
      plan: principal.plan,
      tokenExpiresAt: isoTimestamp(principal.tokenExpiresAt),
    });
  });

  router.all('/echo', jsonBody, (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      throw new ApiProblem('not-found', 'Use GET or POST on /v1/echo.');
    }
    const query = Object.fromEntries(
      Object.entries(req.query).map(([name, value]) => [name, String(Array.isArray(value) ? value[0] : value)]),
    );
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : String(value)]),
    );
    if (headers.authorization) headers.authorization = 'Bearer ***'; // never reflect credentials
    res.json({ method: req.method, path: req.originalUrl.split('?')[0], query, headers, body: req.json ?? null });
  });

  router.get('/demo/flaky', (req, res) => {
    const { key, failTimes } = parse(flakyQuerySchema, req.query, 'query');
    const attempts = (callsByKey.get(key) ?? 0) + 1;
    callsByKey.set(key, attempts);
    if (attempts <= failTimes) {
      throw new ApiProblem('service-unavailable', `Planned failure ${attempts} of ${failTimes}.`);
    }
    res.json({ key, attempts });
  });

  router.get('/demo/crash', () => {
    throw new Error('Deliberate crash for the error-handling demo');
  });

  return router;
}
