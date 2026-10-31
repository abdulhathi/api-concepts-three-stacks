// Concept 14 · HTTPS: HSTS only when the request really arrived over TLS.
import type { Request, RequestHandler } from 'express';
import type { TLSSocket } from 'node:tls';

/** TLS ends at the cloud edge (Cloud Run), so the original scheme arrives in X-Forwarded-Proto. */
export function arrivedOverHttps(req: Request): boolean {
  const forwarded = req.get('X-Forwarded-Proto')?.split(',')[0]?.trim().toLowerCase();
  return forwarded === 'https' || Boolean((req.socket as TLSSocket).encrypted);
}

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (arrivedOverHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

/** Concept 19 · Caching: API responses are not cacheable unless a handler opts in with its own header. */
export const noStoreByDefault: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
