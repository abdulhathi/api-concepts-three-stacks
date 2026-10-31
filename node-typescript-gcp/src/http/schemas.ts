// Shared zod building blocks with the exact messages the problem details show.
import { z } from 'zod';

/** An integer in [min, max], accepted from query strings ("5") as well as JSON numbers. */
export function intInRange(name: string, min: number, max: number) {
  const message = `must be between ${min} and ${max}`;
  return z.coerce
    .number({ error: message })
    .int({ error: message })
    .min(min, { error: message })
    .max(max, { error: message })
    .meta({ description: `${name}, ${min} to ${max}` });
}

/** `{id}` path parameter shared by every resource route. */
export const idParamsSchema = z.object({ id: z.string().min(1) });
