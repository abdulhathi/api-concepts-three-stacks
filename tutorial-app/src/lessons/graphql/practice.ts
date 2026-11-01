import type { Practice } from '../../practice/types';

/** Every GraphQL step asks for plain JSON: this API then promises HTTP 200 with application/json. */
const GQL = { Accept: 'application/json' };

const ORDER_QUERY = 'query Order($id: ID!) { order(id: $id) { id status totalCents items { quantity unitPriceCents product { id title } } } }';

export const practice: Practice = {
  id: 'graphql',
  intro:
    'You will send queries to the one GraphQL endpoint, pick fields, walk from an order to its products in a single request, and see errors arrive inside a 200. Then you will narrow a token and watch one field refuse while the rest of the query works.',
  vars: { ORDER_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'One endpoint, one query',
      goal: 'Every GraphQL request is a POST to /graphql with a JSON body. The query asks for a page of two products, with only their id and title.',
      request: {
        method: 'POST',
        path: '/graphql',
        as: 'reader',
        headers: GQL,
        json: { query: '{ products(first: 2) { nodes { id title } pageInfo { hasNextPage } } }' },
      },
      expect: {
        status: 200,
        headers: { 'Content-Type': '~application/json' },
        body: { 'data.products.nodes.length': 2, 'data.products.nodes.0.title': '*', 'data.products.pageInfo.hasNextPage': true },
      },
      save: { BOOK_1: 'body.data.products.nodes.0.id', BOOK_2: 'body.data.products.nodes.1.id' },
      notice: [
        'The answer sits under data, in exactly the shape of the query: products, then nodes, then id and title.',
        'The ids are the same plain ids as REST uses. The lab saved the two ids for the next steps.',
      ],
    },
    {
      kind: 'try',
      title: 'Pick the fields, pass values as variables',
      goal: 'Ask for one product, but only its title and price. The id goes in variables, so the query text never changes.',
      request: {
        method: 'POST',
        path: '/graphql',
        as: 'reader',
        headers: GQL,
        json: { query: 'query Book($id: ID!) { product(id: $id) { title priceCents } }', variables: { id: '{{BOOK_1}}' } },
      },
      expect: {
        status: 200,
        body: { 'data.product.title': '*', 'data.product.priceCents': '*', 'data.product.author': undefined, 'data.product.tags': undefined },
      },
      notice: [
        'Two fields asked, two fields back. No author, no tags, no timestamps: no over-fetching.',
        '$id is declared with its type, ID!, and its value comes from variables. Never paste user input into the query text.',
      ],
    },
    {
      kind: 'try',
      title: 'Ask for a field the schema does not have',
      goal: 'The server checks every query against its typed schema before running it. Ask for an isbn, which Product does not have.',
      request: {
        method: 'POST',
        path: '/graphql',
        as: 'reader',
        headers: GQL,
        json: { query: 'query Book($id: ID!) { product(id: $id) { title isbn } }', variables: { id: '{{BOOK_1}}' } },
      },
      expect: { status: 200, body: { 'errors.0.message': '*', 'errors.0.locations': '*', data: undefined } },
      notice: [
        'HTTP 200, an errors list, and no data at all: the query never ran, so not even the title came back.',
        'The message differs by stack (Strawberry, graphql-js, Hot Chocolate). locations points at the bad field in the query text.',
        'With Accept: application/graphql-response+json instead, the TypeScript and C# servers answer this with 400. Python keeps 200.',
      ],
    },
    {
      kind: 'try',
      title: 'A missing product is null, not an error',
      goal: 'Ask for a product that does not exist. product is nullable in the schema, so “not found” is a normal answer.',
      request: { method: 'POST', path: '/graphql', as: 'reader', headers: GQL, json: { query: '{ product(id: "prd_nope") { id title } }' } },
      expect: { status: 200, body: { 'data.product': null, errors: undefined } },
      notice: ['data.product is null and there is no errors list. REST would answer 404; GraphQL answers 200 with null.'],
    },
    {
      kind: 'try',
      title: 'Create an order to query (with REST)',
      goal: 'This schema has only queries, no mutations: writes go through REST. Create an order with the two products from step 1.',
      request: {
        method: 'POST',
        path: '/v1/orders',
        as: 'writer',
        headers: { 'Idempotency-Key': '{{ORDER_KEY}}' },
        json: {
          items: [
            { productId: '{{BOOK_1}}', quantity: 2 },
            { productId: '{{BOOK_2}}', quantity: 1 },
          ],
        },
      },
      expect: { status: 201, body: { id: '*', status: 'pending', 'items.length': 2 } },
      save: { ORDER_ID: 'body.id' },
      notice: ['A REST 201 with a Location. The lab saved the order id for the GraphQL steps that follow.'],
    },
    {
      kind: 'try',
      title: 'One query, the whole tree',
      goal: 'Fetch the order, its items, and each item’s product title in one request. With REST this takes three calls.',
      request: { method: 'POST', path: '/graphql', as: 'writer', headers: GQL, json: { query: ORDER_QUERY, variables: { id: '{{ORDER_ID}}' } } },
      expect: {
        status: 200,
        body: {
          'data.order.id': '{{ORDER_ID}}',
          'data.order.status': 'pending',
          'data.order.items.length': 2,
          'data.order.items.0.quantity': 2,
          'data.order.items.0.product.id': '{{BOOK_1}}',
          'data.order.items.1.product.title': '*',
          errors: undefined,
        },
      },
      notice: [
        'One round trip: the order resolver loaded the order, then the product resolver ran once for each item.',
        'unitPriceCents is the price at order time; product is the product as it is now. Two different questions, two fields.',
      ],
    },
    {
      kind: 'try',
      title: 'A bad argument: an error inside a 200',
      goal: 'Ask for 100 products. This API allows 1 to 50 per page, so the products field fails while the query runs.',
      request: { method: 'POST', path: '/graphql', as: 'reader', headers: GQL, json: { query: '{ products(first: 100) { nodes { id } } }' } },
      expect: { status: 200, body: { 'errors.0.extensions.code': 'BAD_USER_INPUT', 'errors.0.path.0': 'products' } },
      notice: [
        'HTTP 200, yet nothing worked. A client that checks only the status would miss this.',
        'path names the field that failed, and extensions.code is the stable part a program should check.',
        'TypeScript and C# send "data": null; Python leaves data out. Either way there is nothing to show.',
      ],
    },
    {
      kind: 'try',
      title: 'Get a token with only products:read',
      goal: 'Ask the token endpoint for less than the reader client may have: just products:read. A narrow token is how you show a missing scope.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], form: { grant_type: 'client_credentials', scope: 'products:read' } },
      expect: { status: 200, body: { scope: 'products:read', token_type: 'Bearer' } },
      save: { NARROW_TOKEN: 'body.access_token' },
      notice: ['scope is products:read only, with no orders:read. The lab saved this token for the next step.'],
    },
    {
      kind: 'try',
      title: 'Authorization per field: partial data',
      goal: 'With the narrow token, ask for a product and the order in one query. The route lets you in, because you have products:read. The order resolver checks orders:read itself.',
      request: {
        method: 'POST',
        path: '/graphql',
        headers: { ...GQL, Authorization: 'Bearer {{NARROW_TOKEN}}' },
        json: {
          query: 'query Mixed($book: ID!, $id: ID!) { product(id: $book) { title } order(id: $id) { status } }',
          variables: { book: '{{BOOK_1}}', id: '{{ORDER_ID}}' },
        },
      },
      expect: {
        status: 200,
        body: { 'data.product.title': '*', 'data.order': null, 'errors.0.extensions.code': 'FORBIDDEN', 'errors.0.path.0': 'order' },
      },
      notice: [
        'The product came back, the order is null, and the error names the field: path order, code FORBIDDEN.',
        'One response, partly successful. That is why a GraphQL client must read the errors list even on a 200.',
      ],
    },
    {
      kind: 'try',
      title: 'Another client’s order is null',
      goal: 'partner has orders:read, but this order belongs to writer. Ask for it as partner.',
      request: { method: 'POST', path: '/graphql', as: 'partner', headers: GQL, json: { query: ORDER_QUERY, variables: { id: '{{ORDER_ID}}' } } },
      expect: { status: 200, body: { 'data.order': null, errors: undefined } },
      notice: [
        'null with no error: the same answer as an order that does not exist, just like the 404 in REST.',
        'If it said FORBIDDEN instead, anyone could learn which order ids exist by probing.',
      ],
    },
    {
      kind: 'try',
      title: 'No token: a plain HTTP 401',
      goal: 'Problems found before GraphQL runs are normal HTTP errors in this API. Send a query with no Authorization header.',
      request: { method: 'POST', path: '/graphql', headers: GQL, json: { query: '{ products(first: 1) { nodes { id } } }' } },
      expect: {
        status: 401,
        headers: { 'Content-Type': '~application/problem+json', 'WWW-Authenticate': '~Bearer' },
        body: { type: '/problems/unauthorized' },
      },
      notice: [
        'Not a GraphQL errors list: a 401 with problem details, the same as any REST route.',
        'A token without products:read would get a 403 the same way. Only errors inside the query come back as 200.',
      ],
    },
    {
      kind: 'read',
      title: 'One endpoint, guarded like any route',
      goal: 'The GraphQL endpoint goes through the same authentication and rate limiting as REST, and the route itself demands products:read.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/graphql.py',
          lines: [21, 49],
          note: 'require("products:read") guards the route; the handler hands the query and the principal to Strawberry and builds data and errors.',
        },
        node: {
          path: 'node-typescript-gcp/src/app.ts',
          lines: [85, 96],
          note: 'The /graphql route reuses protectedRoutes (authenticate, rate limit) and adds requireScope("products:read") before graphql-http.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs',
          lines: [24, 43],
          note: 'MapGraphQL sits behind the same authentication, rate limiter and authorization middleware, with RequireAuthorization("products:read").',
        },
      },
    },
    {
      kind: 'read',
      title: 'The order resolver checks its own scope',
      goal: 'The route only guarantees products:read. The order field checks orders:read itself, then hides other clients’ orders behind null.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/gql/schema.py',
          lines: [124, 141],
          note: 'A GraphQLError with extensions code FORBIDDEN, then None for an order the caller does not own.',
        },
        node: {
          path: 'node-typescript-gcp/src/graphql/schema.ts',
          lines: [77, 95],
          note: 'hasScope throws a GraphQLError with code FORBIDDEN; the not-found problem from getVisible becomes null.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/GraphQl/Query.cs',
          lines: [42, 64],
          note: 'ClaimsPrincipal is injected into the resolver; the Error helper sets the code with ErrorBuilder.',
        },
      },
    },
    {
      kind: 'think',
      title: 'The N plus 1 problem',
      question:
        'You add a field that returns 50 orders, each with 3 items, and a client asks for every item’s product title. With resolvers written like this API’s, how many product lookups does one query cause, and how would you fix it?',
      answer:
        'One lookup for the orders, then one product lookup per item: 150 product lookups for a single query. The fix is batching with a DataLoader: product resolvers ask the loader for an id, the loader collects every id requested in that step and fetches them in one call. Strawberry ships a DataLoader, Hot Chocolate has built-in data loaders, and in JavaScript the dataloader package does the same.',
    },
    {
      kind: 'think',
      title: 'Caching GraphQL',
      question: 'Your product page is popular. With REST, a CDN can cache GET /v1/products/prd_06. Why is that harder with GraphQL here, and what do teams do about it?',
      answer:
        'Every query here is a POST to the same URL, and HTTP caches key on the method and URL, so they do not store it. Teams cache in the client (a normalized cache keyed by type and id), in the server’s data layer, or use persisted queries: the client sends a hash of a known query with GET, so the URL is stable and a CDN can cache it.',
    },
    {
      kind: 'build',
      title: 'Add an orders list field',
      task: 'Add orders(first: Int = 10): [Order!]! to the schema: the caller’s own orders (all orders for admin). It needs the same per-field authorization as order, and the same page-size rule as products.',
      steps: [
        'Open the schema in your stack: python-fastapi-aws/app/gql/schema.py, node-typescript-gcp/src/graphql/schema.ts (both typeDefs and rootValue) or dotnet-azure/src/ApiConcepts.Api/GraphQl/Query.cs.',
        'Add the orders field with a first argument that defaults to 10.',
        'Check orders:read first and raise the same FORBIDDEN error as order. Then reject first outside 1 to 50 with BAD_USER_INPUT, as products does.',
        'Load only the caller’s orders, or every order for admin, with the same repository or service call that GET /v1/orders uses.',
        'Map each order to the Order type, so items and their nested product still resolve.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks writer’s orders for an id.',
      ],
      hints: [
        'The order resolver already has the scope check and the ownership rule. The list is the same rule applied to many orders.',
        'The REST list handler filters by client: container.orders.page with client_id in Python, service.listVisible in TypeScript, the visible predicate passed to orders.List in C#.',
        'In TypeScript, order builds items with a product function. Move that mapping into a helper and reuse it for each order in the list.',
      ],
      check: {
        request: { method: 'POST', path: '/graphql', as: 'writer', headers: GQL, json: { query: '{ orders(first: 5) { id status } }' } },
        expect: { status: 200, body: { 'data.orders.0.id': '*' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: all contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
