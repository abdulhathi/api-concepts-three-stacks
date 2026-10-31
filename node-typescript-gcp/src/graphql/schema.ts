// Concept 17 · GraphQL: schema-first SDL, resolved against the same repositories as the REST routes.
import { GraphQLError, buildSchema } from 'graphql';
import type { Principal } from '../auth/principal.js';
import { hasScope } from '../auth/principal.js';
import { decodeCursor, encodeCursor, paginate } from '../http/pagination.js';
import { ApiProblem } from '../http/problem.js';
import type { OrderService } from '../orders/service.js';
import type { ProductRepository } from '../products/repository.js';
import type { Product } from '../products/schema.js';

export const typeDefs = /* GraphQL */ `
  type Query {
    products(first: Int = 10, after: String, tag: String): ProductConnection!
    product(id: ID!): Product
    order(id: ID!): Order
  }
  type ProductConnection {
    nodes: [Product!]!
    pageInfo: PageInfo!
  }
  type PageInfo {
    endCursor: String
    hasNextPage: Boolean!
  }
  type Product {
    id: ID!
    title: String!
    author: String!
    priceCents: Int!
    currency: String!
    tags: [String!]!
  }
  type Order {
    id: ID!
    status: String!
    totalCents: Int!
    items: [OrderItem!]!
  }
  type OrderItem {
    quantity: Int!
    unitPriceCents: Int!
    product: Product
  }
`;

export const schema = buildSchema(typeDefs);

export interface GraphQLContext extends Record<PropertyKey, unknown> {
  principal: Principal;
  products: ProductRepository;
  orders: OrderService;
}

const badInput = (message: string) => new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });

/** Root resolvers. Nested fields use graphql-js's default resolver, which calls function-valued properties. */
export const rootValue = {
  async products(args: { first: number; after?: string | null; tag?: string | null }, ctx: GraphQLContext) {
    if (args.first < 1 || args.first > 50) throw badInput('first must be between 1 and 50');
    if (args.after != null && decodeCursor(args.after) === undefined) throw badInput('after is not a valid cursor');

    const all = await ctx.products.findAll();
    const matching = args.tag ? all.filter((product) => product.tags.includes(args.tag!)) : all;
    try {
      const page = paginate(matching, args.first, args.after ?? undefined);
      const last = page.items[page.items.length - 1];
      return {
        nodes: page.items,
        pageInfo: { endCursor: last ? encodeCursor(last) : null, hasNextPage: page.hasMore },
      };
    } catch (error) {
      if (error instanceof ApiProblem) throw badInput(error.detail);
      throw error;
    }
  },

  product: (args: { id: string }, ctx: GraphQLContext) => ctx.products.findById(args.id) ?? null,

  async order(args: { id: string }, ctx: GraphQLContext) {
    if (!hasScope(ctx.principal, 'orders:read')) {
      throw new GraphQLError('This field needs the orders:read scope', { extensions: { code: 'FORBIDDEN' } });
    }
    const order = await ctx.orders.getVisible(ctx.principal, args.id).catch((error: unknown) => {
      if (error instanceof ApiProblem && error.slug === 'not-found') return null; // other clients' orders look absent
      throw error;
    });
    if (!order) return null;
    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        product: (): Promise<Product | null> => ctx.products.findById(item.productId).then((found) => found ?? null),
      })),
    };
  },
};
