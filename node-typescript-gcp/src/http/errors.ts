// Concept 27 · Error handling: unknown routes and unexpected exceptions also become problem+json.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiProblem, sendProblem } from './problem.js';
import type { LogSink } from './requestLog.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  sendProblem(req, res, new ApiProblem('not-found', `No route matches ${req.method} ${req.path}.`));
};

export function errorHandler(sink: LogSink): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ApiProblem) return sendProblem(req, res, err);

    // body-parser failures carry their own status; only the oversize case is reachable here.
    if ((err as { type?: string }).type === 'entity.too.large') {
      return sendProblem(req, res, new ApiProblem('validation-error', 'The request body is too large.'));
    }

    // Log the real error with the request id; never put its message or stack in the response.
    sink(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        requestId: res.getHeader('X-Request-Id'),
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
    sendProblem(req, res, new ApiProblem('internal-error', 'An unexpected error occurred.'));
  };
}
