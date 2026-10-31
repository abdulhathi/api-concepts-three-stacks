// Concepts 4 and 6 · Content-Type check (415) and JSON request bodies (400 when malformed).
import express, { Router, type RequestHandler } from 'express';
import { ApiProblem } from './problem.js';

const JSON_TYPE = /^application\/(json|merge-patch\+json)\s*(;.*)?$/i;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function hasBody(headers: Record<string, string | string[] | undefined>): boolean {
  const length = headers['content-length'];
  return headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}

const requireJsonContentType: RequestHandler = (req, _res, next) => {
  if (BODY_METHODS.has(req.method) && hasBody(req.headers) && !JSON_TYPE.test(req.get('Content-Type') ?? '')) {
    throw new ApiProblem('unsupported-media-type', 'Send the body as Content-Type: application/json.');
  }
  next();
};

const readRaw = express.raw({ type: () => true, limit: '256kb' });

const parseJson: RequestHandler = (req, _res, next) => {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    req.rawBody = req.body;
    try {
      req.json = JSON.parse(req.body.toString('utf8'));
    } catch {
      throw new ApiProblem('malformed-json', 'The request body could not be parsed as JSON.');
    }
  }
  next();
};

/** Mount before any handler that reads `req.json`. */
export const jsonBody: RequestHandler = Router().use(requireJsonContentType, readRaw, parseJson);
