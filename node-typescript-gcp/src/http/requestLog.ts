// Concept 1 · Requests and responses: one structured JSON log line per request.
import type { RequestHandler } from 'express';

export type LogSink = (line: string) => void;

export const stdoutSink: LogSink = (line) => process.stdout.write(`${line}\n`);

export function requestLog(sink: LogSink): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      sink(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          requestId: res.getHeader('X-Request-Id'),
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          clientId: req.principal?.clientId ?? null,
        }),
      );
    });
    next();
  };
}
