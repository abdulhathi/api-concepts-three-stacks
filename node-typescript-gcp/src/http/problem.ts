// Concept 27 · Error handling: RFC 9457 problem+json, one class for every expected failure.
import type { Request, Response } from 'express';

export type ProblemSlug =
  | 'validation-error'
  | 'malformed-json'
  | 'invalid-cursor'
  | 'idempotency-key-required'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'invalid-state'
  | 'idempotency-key-in-progress'
  | 'precondition-failed'
  | 'unsupported-media-type'
  | 'unknown-product'
  | 'idempotency-key-reused'
  | 'rate-limited'
  | 'internal-error'
  | 'throttled'
  | 'service-unavailable'
  | 'timeout';

const CATALOG: Record<ProblemSlug, { status: number; title: string }> = {
  'validation-error': { status: 400, title: 'Your request is not valid' },
  'malformed-json': { status: 400, title: 'The request body is not valid JSON' },
  'invalid-cursor': { status: 400, title: 'The pagination cursor is not valid' },
  'idempotency-key-required': { status: 400, title: 'An Idempotency-Key header is required' },
  unauthorized: { status: 401, title: 'Authentication is required' },
  forbidden: { status: 403, title: 'You are not allowed to do this' },
  'not-found': { status: 404, title: 'Resource not found' },
  'invalid-state': { status: 409, title: 'The resource is in a state that does not allow this' },
  'idempotency-key-in-progress': { status: 409, title: 'A request with this Idempotency-Key is in progress' },
  'precondition-failed': { status: 412, title: 'The resource changed since you last saw it' },
  'unsupported-media-type': { status: 415, title: 'Unsupported media type' },
  'unknown-product': { status: 422, title: 'The order references an unknown product' },
  'idempotency-key-reused': { status: 422, title: 'This Idempotency-Key was used with a different request' },
  'rate-limited': { status: 429, title: 'Too many requests' },
  'internal-error': { status: 500, title: 'Internal server error' },
  throttled: { status: 503, title: 'The server is busy' },
  'service-unavailable': { status: 503, title: 'The service is temporarily unavailable' },
  timeout: { status: 504, title: 'The request took too long' },
};

export interface FieldError {
  field: string;
  message: string;
}

export class ApiProblem extends Error {
  readonly status: number;
  readonly title: string;

  constructor(
    readonly slug: ProblemSlug,
    readonly detail: string,
    readonly options: { errors?: FieldError[]; headers?: Record<string, string> } = {},
  ) {
    super(detail);
    this.status = CATALOG[slug].status;
    this.title = CATALOG[slug].title;
  }
}

export function sendProblem(req: Request, res: Response, problem: ApiProblem): void {
  for (const [name, value] of Object.entries(problem.options.headers ?? {})) res.setHeader(name, value);
  res
    .status(problem.status)
    .type('application/problem+json')
    .send(
      JSON.stringify({
        type: `/problems/${problem.slug}`,
        title: problem.title,
        status: problem.status,
        detail: problem.detail,
        instance: req.originalUrl.split('?')[0],
        requestId: res.getHeader('X-Request-Id'),
        ...(problem.options.errors ? { errors: problem.options.errors } : {}),
      }),
    );
}
