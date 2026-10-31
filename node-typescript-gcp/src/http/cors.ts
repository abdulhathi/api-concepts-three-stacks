// Concept 15 · CORS: explicit origin allowlist, answered before auth and rate limiting.
import type { RequestHandler } from 'express';

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type, Idempotency-Key, If-Match, If-None-Match, X-Request-Id';
const EXPOSED_HEADERS =
  'ETag, Link, Location, Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, X-Request-Id, Idempotent-Replayed';

export function cors(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get('Origin');
    res.vary('Origin');
    if (!origin || !allowed.has(origin)) return next();

    // No Access-Control-Allow-Credentials: clients send bearer tokens, never cookies.
    res.setHeader('Access-Control-Allow-Origin', origin);
    const isPreflight = req.method === 'OPTIONS' && req.get('Access-Control-Request-Method');
    if (isPreflight) {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    next();
  };
}
