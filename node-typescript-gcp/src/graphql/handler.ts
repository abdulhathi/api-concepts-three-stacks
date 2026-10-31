// Concept 17 · GraphQL: graphql-http executes the schema behind a single POST endpoint.
import type { RequestHandler } from 'express';
import * as graphql from 'graphql';
import { createHandler } from 'graphql-http/lib/use/express';
import { z } from 'zod';
import { principalOf } from '../auth/authenticate.js';
import { parse } from '../http/validate.js';
import type { OrderService } from '../orders/service.js';
import type { ProductRepository } from '../products/repository.js';
import { rootValue, schema, type GraphQLContext } from './schema.js';

export const graphqlRequestSchema = z
  .object({
    query: z.string().min(1, 'must be a GraphQL document'),
    variables: z.record(z.string(), z.unknown()).optional(),
    operationName: z.string().optional(),
  })
  .meta({ id: 'GraphQLRequest' });

export function graphqlHandler(products: ProductRepository, orders: OrderService): RequestHandler {
  const handle = createHandler({
    schema,
    rootValue,
    // graphql-http is CommonJS and would load its own copy of graphql; two copies reject each other's schema
    // objects. Handing it this module's functions keeps the whole pipeline on one copy.
    execute: graphql.execute,
    parse: graphql.parse,
    validate: graphql.validate,
    getOperationAST: graphql.getOperationAST,
    validationRules: () => graphql.specifiedRules,
    context: (req): GraphQLContext => ({ principal: principalOf(req.raw), products, orders }),
  });

  return (req, res, next) => {
    // Bad envelopes become the same problem+json as every other endpoint; graphql-http only sees valid ones.
    req.body = parse(graphqlRequestSchema, req.json);
    return handle(req, res, next);
  };
}
