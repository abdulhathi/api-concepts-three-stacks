// Composition root: builds the Express app and wires every concept in the order a request meets them.
import express, { Router, type Express } from 'express';
import { authenticate, requireScope } from './auth/authenticate.js';
import { ClientRegistry } from './auth/clients.js';
import { TokenService } from './auth/jwt.js';
import { oauthRouter } from './auth/oauth.js';
import { demoRouter } from './demo/routes.js';
import { graphqlHandler } from './graphql/handler.js';
import { jsonBody } from './http/body.js';
import { cors } from './http/cors.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { requestId } from './http/requestContext.js';
import { requestLog, stdoutSink, type LogSink } from './http/requestLog.js';
import { noStoreByDefault, securityHeaders } from './http/securityHeaders.js';
import type { Config } from './config.js';
import { IdempotencyStore } from './idempotency.js';
import { rateLimit, TokenBucketLimiter } from './limits/rateLimit.js';
import { ordersRouter } from './orders/routes.js';
import { InMemoryOrderRepository, type OrderRepository } from './orders/repository.js';
import { OrderService } from './orders/service.js';
import { buildOpenApiDocument, docsPage } from './openapi/document.js';
import { InMemoryProductRepository, type ProductRepository } from './products/repository.js';
import { productsRouter } from './products/routes.js';
import { seedProducts } from './products/seed.js';
import { reportsRouter } from './reports/routes.js';
import type { Clock } from './util/time.js';
import { WebhookDispatcher } from './webhooks/dispatcher.js';
import { InMemoryWebhookRepository } from './webhooks/repository.js';
import { webhooksRouter } from './webhooks/routes.js';

/** Seams for tests and for swapping infrastructure; every field has an in-memory default. */
export interface AppOverrides {
  products?: ProductRepository;
  orders?: OrderRepository;
  clock?: Clock;
  logSink?: LogSink;
  webhookFetch?: typeof fetch;
}

export interface BookshopApp {
  app: Express;
  webhooks: WebhookDispatcher;
}

export function createApp(config: Config, overrides: AppOverrides = {}): BookshopApp {
  const logSink = overrides.logSink ?? stdoutSink;
  const products = overrides.products ?? new InMemoryProductRepository(seedProducts());
  const orderRepository = overrides.orders ?? new InMemoryOrderRepository();
  const webhookRepository = new InMemoryWebhookRepository();
  const webhooks = new WebhookDispatcher(webhookRepository, {
    retryBaseMs: config.webhookRetryBaseMs,
    maxAttempts: config.webhookMaxAttempts,
    fetch: overrides.webhookFetch,
  });
  const orders = new OrderService(orderRepository, products, webhooks);

  const tokens = new TokenService(config);
  const clients = new ClientRegistry();
  const limiter = new TokenBucketLimiter(overrides.clock);
  const idempotency = new IdempotencyStore(overrides.clock);
  const openApiDocument = buildOpenApiDocument();

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag'); // ETags are computed by hand (src/http/etag.ts) so the logic is visible

  // Cross-cutting middleware, in the order a request meets it.
  app.use(requestId, securityHeaders, requestLog(logSink), cors(config.corsOrigins));

  app.get('/', (_req, res) => {
    res.json({ name: 'Bookshop API', docs: '/docs', openapi: '/openapi.json' });
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.get('/docs', (_req, res) => {
    res.type('html').send(docsPage());
  });

  app.use('/oauth', noStoreByDefault, oauthRouter(tokens, clients));

  // Everything below needs a valid token, then spends one token from the caller's rate-limit bucket.
  const protectedRoutes = [noStoreByDefault, authenticate(tokens, clients), rateLimit(limiter)];

  const v1 = Router();
  v1.use('/products', productsRouter(products));
  v1.use('/orders', ordersRouter(orders, idempotency));
  v1.use('/reports', reportsRouter(orderRepository, config.requestTimeoutMs));
  v1.use('/webhooks', webhooksRouter(webhookRepository));
  v1.use(demoRouter());
  app.use('/v1', ...protectedRoutes, v1);

  app.post('/graphql', ...protectedRoutes, jsonBody, requireScope('products:read'), graphqlHandler(products, orders));

  app.use(notFoundHandler);
  app.use(errorHandler(logSink));
  return { app, webhooks };
}
