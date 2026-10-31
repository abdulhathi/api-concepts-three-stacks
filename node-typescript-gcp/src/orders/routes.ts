// Concepts 11, 22 and 26 · Orders: ownership, idempotent creation and webhook events.
import { Router } from 'express';
import { principalOf, requireScope } from '../auth/authenticate.js';
import { jsonBody } from '../http/body.js';
import { paginate } from '../http/pagination.js';
import { ApiProblem } from '../http/problem.js';
import { idParamsSchema } from '../http/schemas.js';
import { parse } from '../http/validate.js';
import { fingerprintOf, type IdempotencyStore } from '../idempotency.js';
import { createOrderSchema, listOrdersQuerySchema } from './schema.js';
import type { OrderService } from './service.js';

export function ordersRouter(service: OrderService, idempotency: IdempotencyStore): Router {
  const router = Router();

  router.post('/', requireScope('orders:write'), jsonBody, async (req, res) => {
    const { clientId } = principalOf(req);
    const key = req.get('Idempotency-Key');
    if (!key || key.length > 255) {
      throw new ApiProblem('idempotency-key-required', 'Send an Idempotency-Key header of 1 to 255 characters.');
    }
    const input = parse(createOrderSchema, req.json);

    const outcome = idempotency.begin(clientId, key, fingerprintOf(req.rawBody!));
    if (outcome.kind === 'replay') {
      const { status, body, location } = outcome.response;
      res.setHeader('Location', location);
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(status).type('application/json').send(body);
      return;
    }
    if (outcome.kind === 'reused') {
      throw new ApiProblem('idempotency-key-reused', 'This Idempotency-Key was already used with a different body.');
    }
    if (outcome.kind === 'in-progress') {
      throw new ApiProblem('idempotency-key-in-progress', 'The first request with this key is still running.');
    }

    try {
      const order = await service.create(clientId, input);
      const stored = { status: 201, body: JSON.stringify(order), location: `/v1/orders/${order.id}` };
      idempotency.complete(clientId, key, stored);
      res.setHeader('Location', stored.location);
      res.status(201).type('application/json').send(stored.body);
    } catch (error) {
      idempotency.abandon(clientId, key); // only successes are remembered
      throw error;
    }
  });

  router.get('/', requireScope('orders:read'), async (req, res) => {
    const { limit, cursor } = parse(listOrdersQuerySchema, req.query, 'query');
    const page = paginate(await service.listVisible(principalOf(req)), limit, cursor);
    if (page.hasMore) {
      const params = new URLSearchParams({ limit: String(limit), cursor: page.nextCursor! });
      res.setHeader('Link', `</v1/orders?${params}>; rel="next"`);
    }
    res.json({ data: page.items, page: { limit, nextCursor: page.nextCursor, hasMore: page.hasMore } });
  });

  router.get('/:id', requireScope('orders:read'), async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    res.json(await service.getVisible(principalOf(req), id));
  });

  router.post('/:id/pay', requireScope('orders:write'), async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    res.json(await service.pay(principalOf(req), id));
  });

  return router;
}
