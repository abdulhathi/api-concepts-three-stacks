// Concept 8 · API schemas: the OpenAPI 3.1 document is generated from the same zod schemas that validate requests.
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { flakyQuerySchema, flakyResultSchema, echoSchema, meSchema } from '../demo/routes.js';
import { graphqlRequestSchema } from '../graphql/handler.js';
import { idParamsSchema } from '../http/schemas.js';
import {
  createOrderSchema,
  listOrdersQuerySchema,
  orderListSchema,
  orderSchema,
} from '../orders/schema.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  patchProductSchema,
  productListSchema,
  productSchema,
  replaceProductSchema,
} from '../products/schema.js';
import { reportQuerySchema, salesReportSchema } from '../reports/routes.js';
import {
  createSubscriptionSchema,
  deliverySchema,
  subscriptionSchema,
  subscriptionWithSecretSchema,
} from '../webhooks/schema.js';

const problemSchema = z
  .object({
    type: z.string().meta({ example: '/problems/validation-error' }),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string(),
    requestId: z.string(),
    errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  })
  .meta({ id: 'Problem', description: 'RFC 9457 problem details' });

const tokenRequestSchema = z.object({
  grant_type: z.literal('client_credentials'),
  scope: z.string().optional().meta({ description: 'Space-separated; omit to receive all of the client\'s scopes.' }),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});
const tokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int(),
    scope: z.string(),
  })
  .meta({ id: 'TokenResponse' });

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: problemSchema } },
});

type Method = RouteConfig['method'];

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  /** Registers one operation; `scope` adds the bearer requirement plus the shared 401/403/429 responses. */
  function operation(
    method: Method,
    path: string,
    summary: string,
    tag: string,
    options: {
      scope?: string;
      request?: RouteConfig['request'];
      responses: RouteConfig['responses'];
    },
  ) {
    const secured = options.scope !== undefined;
    registry.registerPath({
      method,
      path,
      summary,
      tags: [tag],
      description: options.scope ? `Requires the \`${options.scope}\` scope.` : undefined,
      security: secured ? [{ bearerAuth: [] }] : undefined,
      request: options.request,
      responses: {
        ...options.responses,
        ...(secured
          ? {
              401: problem('Missing, expired or invalid access token'),
              403: problem('The token lacks the required scope'),
              429: problem('Rate limit exceeded; see Retry-After'),
            }
          : {}),
      },
    });
  }

  const bodyOf = (schema: z.ZodType, contentType = 'application/json') => ({
    body: { required: true, content: { [contentType]: { schema } } },
  });

  operation('get', '/health', 'Liveness check', 'Meta', {
    responses: { 200: { description: 'Healthy', ...json(z.object({ status: z.literal('ok') })) } },
  });
  operation('post', '/oauth/token', 'Get an access token (client credentials)', 'Auth', {
    request: bodyOf(tokenRequestSchema, 'application/x-www-form-urlencoded'),
    responses: {
      200: { description: 'Access token', ...json(tokenResponseSchema) },
      400: { description: 'invalid_request, unsupported_grant_type or invalid_scope (RFC 6749 JSON)' },
      401: { description: 'invalid_client (RFC 6749 JSON)' },
    },
  });
  operation('get', '/v1/me', 'Who am I', 'Auth', {
    scope: 'any valid token',
    responses: { 200: { description: 'The calling client', ...json(meSchema) } },
  });
  operation('get', '/v1/echo', 'Echo the request (GET)', 'Demo', {
    scope: 'any valid token',
    responses: { 200: { description: 'The request as the server saw it', ...json(echoSchema) } },
  });
  operation('post', '/v1/echo', 'Echo the request (POST)', 'Demo', {
    scope: 'any valid token',
    request: bodyOf(z.unknown()),
    responses: {
      200: { description: 'The request as the server saw it', ...json(echoSchema) },
      415: problem('Body is not application/json'),
    },
  });

  operation('get', '/v1/products', 'List products (cursor pagination)', 'Products', {
    scope: 'products:read',
    request: { query: listProductsQuerySchema },
    responses: {
      200: { description: 'A page of products. Weak ETag; Link rel="next" when more exist.', ...json(productListSchema) },
      304: { description: 'Not modified (If-None-Match matched)' },
      400: problem('Invalid limit, tag or cursor'),
    },
  });
  operation('get', '/v1/products/{id}', 'Get a product', 'Products', {
    scope: 'products:read',
    request: { params: idParamsSchema },
    responses: {
      200: { description: 'The product, with a strong ETag', ...json(productSchema) },
      304: { description: 'Not modified (If-None-Match matched)' },
      404: problem('Unknown product'),
    },
  });
  operation('post', '/v1/products', 'Create a product', 'Products', {
    scope: 'products:write',
    request: bodyOf(createProductSchema),
    responses: {
      201: { description: 'Created; Location points at the new product', ...json(productSchema) },
      400: problem('Invalid body'),
      415: problem('Body is not application/json'),
    },
  });
  operation('put', '/v1/products/{id}', 'Replace a product', 'Products', {
    scope: 'products:write',
    request: { params: idParamsSchema, ...bodyOf(replaceProductSchema) },
    responses: {
      200: { description: 'The replaced product', ...json(productSchema) },
      404: problem('Unknown product'),
      412: problem('If-Match does not match the current ETag'),
    },
  });
  operation('patch', '/v1/products/{id}', 'Update part of a product', 'Products', {
    scope: 'products:write',
    request: { params: idParamsSchema, ...bodyOf(patchProductSchema) },
    responses: {
      200: { description: 'The updated product', ...json(productSchema) },
      404: problem('Unknown product'),
      412: problem('If-Match does not match the current ETag'),
    },
  });
  operation('delete', '/v1/products/{id}', 'Delete a product', 'Products', {
    scope: 'admin',
    request: { params: idParamsSchema },
    responses: {
      204: { description: 'Deleted' },
      404: problem('Unknown product'),
      412: problem('If-Match does not match the current ETag'),
    },
  });

  operation('post', '/v1/orders', 'Create an order (idempotent)', 'Orders', {
    scope: 'orders:write',
    request: {
      ...bodyOf(createOrderSchema),
      headers: z.object({ 'Idempotency-Key': z.string().min(1).max(255) }),
    },
    responses: {
      201: { description: 'Created, or the stored response replayed (Idempotent-Replayed: true)', ...json(orderSchema) },
      400: problem('Missing Idempotency-Key or invalid body'),
      409: problem('Same key still being processed'),
      422: problem('Unknown product, or key reused with a different body'),
    },
  });
  operation('get', '/v1/orders', "List the caller's orders", 'Orders', {
    scope: 'orders:read',
    request: { query: listOrdersQuerySchema },
    responses: { 200: { description: 'A page of orders', ...json(orderListSchema) } },
  });
  operation('get', '/v1/orders/{id}', 'Get an order', 'Orders', {
    scope: 'orders:read',
    request: { params: idParamsSchema },
    responses: { 200: { description: 'The order', ...json(orderSchema) }, 404: problem('Unknown or not yours') },
  });
  operation('post', '/v1/orders/{id}/pay', 'Pay an order', 'Orders', {
    scope: 'orders:write',
    request: { params: idParamsSchema },
    responses: { 200: { description: 'The paid order', ...json(orderSchema) }, 404: problem('Unknown or not yours') },
  });

  operation('get', '/v1/reports/sales', 'Sales report (throttled, time-limited)', 'Reports', {
    scope: 'orders:read',
    request: { query: reportQuerySchema },
    responses: {
      200: { description: 'The report', ...json(salesReportSchema) },
      503: problem('Concurrency limit and queue are full; Retry-After: 1'),
      504: problem('The report exceeded the server timeout'),
    },
  });
  operation('get', '/v1/demo/flaky', 'Fails the first N calls per key', 'Demo', {
    scope: 'any valid token',
    request: { query: flakyQuerySchema },
    responses: { 200: { description: 'Success after the planned failures', ...json(flakyResultSchema) }, 503: problem('Planned failure') },
  });
  operation('get', '/v1/demo/crash', 'Always fails with 500', 'Demo', {
    scope: 'any valid token',
    responses: { 500: problem('Unexpected error (no internals leaked)') },
  });

  operation('post', '/v1/webhooks', 'Subscribe to events', 'Webhooks', {
    scope: 'admin',
    request: bodyOf(createSubscriptionSchema),
    responses: { 201: { description: 'Subscription, including its signing secret', ...json(subscriptionWithSecretSchema) } },
  });
  operation('get', '/v1/webhooks', 'List subscriptions', 'Webhooks', {
    scope: 'admin',
    responses: { 200: { description: 'Subscriptions without secrets', ...json(z.object({ data: z.array(subscriptionSchema) })) } },
  });
  operation('delete', '/v1/webhooks/{id}', 'Delete a subscription', 'Webhooks', {
    scope: 'admin',
    request: { params: idParamsSchema },
    responses: { 204: { description: 'Deleted' }, 404: problem('Unknown webhook') },
  });
  operation('get', '/v1/webhooks/{id}/deliveries', 'Delivery log', 'Webhooks', {
    scope: 'admin',
    request: { params: idParamsSchema },
    responses: { 200: { description: 'Deliveries in creation order', ...json(z.object({ data: z.array(deliverySchema) })) } },
  });

  operation('post', '/graphql', 'GraphQL endpoint', 'GraphQL', {
    scope: 'products:read',
    request: bodyOf(graphqlRequestSchema),
    responses: { 200: { description: 'GraphQL response (errors, if any, are in the body)' } },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Bookshop API',
      version: '1.0.0',
      description: 'One contract, three implementations. This is the Node.js, TypeScript and Express edition.',
    },
    servers: [{ url: '/' }],
  });
}

export function docsPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bookshop API docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true });
    </script>
  </body>
</html>`;
}
