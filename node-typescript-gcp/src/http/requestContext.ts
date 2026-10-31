// Concept 4 · Headers: X-Request-Id on every response, echoed when well formed.
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Principal } from '../auth/principal.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Raw bytes of the body, kept so idempotency can hash exactly what the client sent. */
      rawBody?: Buffer;
      /** Parsed JSON body, undefined when the request had none. */
      json?: unknown;
      principal?: Principal;
    }
  }
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('X-Request-Id');
  res.setHeader('X-Request-Id', incoming && SAFE_ID.test(incoming) ? incoming : randomUUID());
  next();
};
