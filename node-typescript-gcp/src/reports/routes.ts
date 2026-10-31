// Concepts 21 and 24 · Throttling and timeouts on the slow report endpoint.
import { Router } from 'express';
import { z } from 'zod';
import { requireScope } from '../auth/authenticate.js';
import { ApiProblem } from '../http/problem.js';
import { parse } from '../http/validate.js';
import { ConcurrencyThrottle, ThrottleFullError } from '../limits/throttle.js';
import type { OrderRepository } from '../orders/repository.js';
import { isoTimestamp, sleep } from '../util/time.js';
import { intInRange } from '../http/schemas.js';

export const reportQuerySchema = z.object({
  delayMs: intInRange('delayMs', 0, 10_000).default(300),
});

export const salesReportSchema = z
  .object({
    orderCount: z.number().int(),
    paidCount: z.number().int(),
    revenueCents: z.number().int(),
    generatedAt: z.iso.datetime(),
  })
  .meta({ id: 'SalesReport' });

export function reportsRouter(orders: OrderRepository, requestTimeoutMs: number): Router {
  const router = Router();
  // Two reports at a time, two more may wait; anything beyond that is refused immediately.
  const throttle = new ConcurrencyThrottle(2, 2);

  router.get('/sales', requireScope('orders:read'), async (req, res) => {
    const { delayMs } = parse(reportQuerySchema, req.query, 'query');

    try {
      const report = await throttle.run(async () => {
        // The deadline starts when the work starts, and aborting it frees the slot straight away.
        const deadline = AbortSignal.timeout(requestTimeoutMs);
        await sleep(delayMs, deadline).catch(() => {
          throw new ApiProblem('timeout', `The report took longer than ${requestTimeoutMs} ms.`);
        });
        const all = await orders.findAll();
        const paid = all.filter((order) => order.status === 'paid');
        return {
          orderCount: all.length,
          paidCount: paid.length,
          revenueCents: paid.reduce((sum, order) => sum + order.totalCents, 0),
          generatedAt: isoTimestamp(Date.now()),
        };
      });
      res.json(report);
    } catch (error) {
      if (error instanceof ThrottleFullError) {
        throw new ApiProblem('throttled', 'Too many reports are running. Retry in a second.', {
          headers: { 'Retry-After': '1' },
        });
      }
      throw error;
    }
  });

  return router;
}
