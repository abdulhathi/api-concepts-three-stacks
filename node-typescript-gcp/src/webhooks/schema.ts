import { z } from 'zod';

export const WEBHOOK_EVENTS = ['order.created', 'order.paid'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export const createSubscriptionSchema = z
  .object({
    url: z.url({ protocol: /^https?$/, error: 'must be an http or https URL' }),
    events: z
      .array(z.enum(WEBHOOK_EVENTS, { error: `must be one of ${WEBHOOK_EVENTS.join(', ')}` }), {
        error: 'must be an array of event types',
      })
      .min(1, 'must list at least one event'),
  })
  .meta({ id: 'CreateWebhook' });

export const subscriptionSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    events: z.array(z.enum(WEBHOOK_EVENTS)),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Webhook' });

export const subscriptionWithSecretSchema = subscriptionSchema
  .extend({ secret: z.string().meta({ description: 'Shown once, at creation. Signs every delivery.' }) })
  .meta({ id: 'WebhookWithSecret' });

export const deliverySchema = z
  .object({
    id: z.string(),
    eventId: z.string(),
    eventType: z.enum(WEBHOOK_EVENTS),
    status: z.enum(['pending', 'succeeded', 'failed']),
    attempts: z.number().int(),
    lastStatusCode: z.number().int().nullable(),
    lastError: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'WebhookDelivery' });

export type Subscription = z.infer<typeof subscriptionWithSecretSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
