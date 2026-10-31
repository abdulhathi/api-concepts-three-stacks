// Concept 26 · Webhooks: subscription management (admin only) and the delivery log.
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { requireScope } from '../auth/authenticate.js';
import { jsonBody } from '../http/body.js';
import { ApiProblem } from '../http/problem.js';
import { idParamsSchema } from '../http/schemas.js';
import { parse } from '../http/validate.js';
import { newId } from '../util/ids.js';
import { isoTimestamp } from '../util/time.js';
import type { WebhookRepository } from './repository.js';
import { createSubscriptionSchema, type Subscription } from './schema.js';

const publicView = ({ secret: _secret, ...rest }: Subscription) => rest;

export function webhooksRouter(repository: WebhookRepository): Router {
  const router = Router();
  router.use(requireScope('admin'));

  router.post('/', jsonBody, async (req, res) => {
    const input = parse(createSubscriptionSchema, req.json);
    const subscription: Subscription = {
      id: newId('whk'),
      url: input.url,
      events: [...new Set(input.events)],
      secret: `whsec_${randomBytes(32).toString('hex')}`,
      createdAt: isoTimestamp(Date.now()),
    };
    await repository.saveSubscription(subscription);
    res.setHeader('Location', `/v1/webhooks/${subscription.id}`);
    res.status(201).json(subscription);
  });

  router.get('/', async (_req, res) => {
    res.json({ data: (await repository.listSubscriptions()).map(publicView) });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    if (!(await repository.removeSubscription(id))) {
      throw new ApiProblem('not-found', `Webhook ${id} does not exist.`);
    }
    res.status(204).end();
  });

  router.get('/:id/deliveries', async (req, res) => {
    const { id } = parse(idParamsSchema, req.params, 'id');
    if (!(await repository.findSubscription(id))) throw new ApiProblem('not-found', `Webhook ${id} does not exist.`);
    res.json({ data: await repository.listDeliveries(id) });
  });

  return router;
}
