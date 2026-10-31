import { z } from 'zod';
import { intInRange } from '../http/schemas.js';

export const orderItemSchema = z
  .object({
    productId: z.string(),
    title: z.string(),
    quantity: z.number().int(),
    unitPriceCents: z.number().int(),
    lineTotalCents: z.number().int(),
  })
  .meta({ id: 'OrderItem' });

export const orderSchema = z
  .object({
    id: z.string().meta({ example: 'ord_3fa91c0b77de' }),
    clientId: z.string(),
    status: z.enum(['pending', 'paid']),
    items: z.array(orderItemSchema),
    totalCents: z.number().int(),
    currency: z.literal('USD'),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Order' });

export const createOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1, 'must not be empty'),
          quantity: z
            .number({ error: 'must be an integer between 1 and 100' })
            .int('must be an integer between 1 and 100')
            .min(1, 'must be an integer between 1 and 100')
            .max(100, 'must be an integer between 1 and 100'),
        }),
        { error: 'must be an array of 1 to 50 items' },
      )
      .min(1, 'must have between 1 and 50 items')
      .max(50, 'must have between 1 and 50 items'),
  })
  .meta({ id: 'CreateOrder' });

export const listOrdersQuerySchema = z.object({
  limit: intInRange('limit', 1, 50).default(10),
  cursor: z.string().min(1).optional(),
});

export const orderListSchema = z
  .object({
    data: z.array(orderSchema),
    page: z.object({ limit: z.number().int(), nextCursor: z.string().nullable(), hasMore: z.boolean() }),
  })
  .meta({ id: 'OrderList' });

export type Order = z.infer<typeof orderSchema>;
export type CreateOrder = z.infer<typeof createOrderSchema>;
