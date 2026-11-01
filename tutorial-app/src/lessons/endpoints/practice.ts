import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'endpoints',
  intro:
    'You will walk the Bookshop API’s endpoints: the public front door, a collection and one item in it, the same path with another method, an action under an order, and the two kinds of 404. Then you will read the route tables that wire it all up.',
  vars: { KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'The front door',
      goal: 'GET / needs no token. It names the API and links to the two discovery endpoints: the docs page and the OpenAPI document.',
      request: { method: 'GET', path: '/' },
      expect: { status: 200, body: { name: 'Bookshop API', docs: '/docs', openapi: '/openapi.json' } },
      notice: [
        'No token needed: this is one of only five public paths, with /health, /openapi.json, /docs and /oauth/token.',
        'Everything under /v1 needs a bearer token.',
      ],
    },
    {
      kind: 'try',
      title: 'A collection',
      goal: 'GET /v1/products is the products collection: /v1 is the version, and products is a plural noun.',
      request: { method: 'GET', path: '/v1/products?limit=2', as: 'reader' },
      expect: { status: 200, body: { 'data.length': 2, 'page.limit': 2 } },
      notice: [
        'A collection answers with a list in data, plus a page object.',
        'limit is a query option, not part of the endpoint: the same endpoint answers with or without it. Lesson 18 covers paging.',
      ],
    },
    {
      kind: 'try',
      title: 'One item in the collection',
      goal: 'Add an id to the collection path, and you have the path of one product.',
      request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader' },
      expect: { status: 200, body: { id: 'prd_01', priceCents: '*' } },
      notice: [
        'The item path is the collection path plus one segment: the id.',
        'The id in the path and the id in the body match. Collection and item share one prefix, so clients can guess the paths.',
      ],
    },
    {
      kind: 'try',
      title: 'Same path, another method: another endpoint',
      goal: 'POST to the same collection path, as reader. A POST here is a different endpoint, with its own handler and its own scope.',
      request: { method: 'POST', path: '/v1/products', as: 'reader', json: { title: 'Endpoints in Practice', author: 'You', priceCents: 1999 } },
      expect: { status: 403, headers: { 'WWW-Authenticate': '~insufficient_scope' }, body: { type: '/problems/forbidden' } },
      notice: [
        'GET on /v1/products needs products:read; POST on the same path needs products:write. Two endpoints, two rules.',
        'reader has only the read scopes, so the POST is refused before anything is created.',
        'WWW-Authenticate names the scope that is missing: products:write.',
      ],
    },
    {
      kind: 'try',
      title: 'There is no v2 yet',
      goal: 'Ask for the products collection under /v2. Only /v1 exists today.',
      request: { method: 'GET', path: '/v2/products', as: 'reader' },
      expect: { status: 404, body: { type: '/problems/not-found', instance: '/v2/products' } },
      notice: [
        'A future breaking change would ship as /v2 next to /v1, and clients on /v1 would not notice.',
        'The build step at the end of this lab adds one /v2 endpoint.',
      ],
    },
    {
      kind: 'try',
      title: 'Create an order to act on',
      goal: 'POST to the orders collection creates an order. The next step needs one to pay.',
      request: {
        method: 'POST',
        path: '/v1/orders',
        as: 'writer',
        headers: { 'Idempotency-Key': '{{KEY}}' },
        json: { items: [{ productId: 'prd_01', quantity: 1 }] },
      },
      expect: { status: 201, headers: { Location: '~/v1/orders/ord_' }, body: { status: 'pending' } },
      save: { ORDER_ID: 'body.id' },
      notice: [
        'POST goes on the collection: the order has no id until the server picks one and returns it in Location.',
        'The lab saved the new id for the next step. The Idempotency-Key header is required here; lesson 22 explains why.',
      ],
    },
    {
      kind: 'try',
      title: 'An action under its item: pay',
      goal: 'Paying is not create, read, update or delete. This API makes it a POST to pay, under the one order it changes.',
      request: { method: 'POST', path: '/v1/orders/{{ORDER_ID}}/pay', as: 'writer' },
      expect: { status: 200, body: { id: '{{ORDER_ID}}', status: 'paid' } },
      notice: [
        'The answer is the order itself, now paid. The action belongs to this one order, so its path sits under the order’s path.',
        'Send it again: still 200, still paid, and no second order.paid webhook event. Paying twice changes nothing.',
      ],
    },
    {
      kind: 'try',
      title: 'A route that does not exist',
      goal: 'Try the verb-style path many APIs use. Here it is not an endpoint at all.',
      request: { method: 'GET', path: '/v1/getProduct?id=prd_01', as: 'reader' },
      expect: {
        status: 404,
        headers: { 'Content-Type': '~application/problem+json' },
        body: { type: '/problems/not-found', status: 404, instance: '/v1/getProduct' },
      },
      notice: [
        'A 404 problem document in JSON, not an HTML error page. instance is the path, without the query string.',
        'The detail text differs between stacks; type, status and instance do not.',
        'Without a token, TypeScript answers 401 instead: it checks the token for all of /v1 before routing. Python and C# answer 404.',
      ],
    },
    {
      kind: 'try',
      title: 'An id that does not exist',
      goal: 'Now the route exists, but the product does not. Compare this answer with the last one.',
      request: { method: 'GET', path: '/v1/products/prd_nope', as: 'reader' },
      expect: { status: 404, headers: { 'Content-Type': '~application/problem+json' }, body: { type: '/problems/not-found', instance: '/v1/products/prd_nope' } },
      notice: [
        'The same not-found problem as for an unknown route. Only the detail text says which kind of miss it was.',
        'One error shape for every 404 means one piece of client code to handle it.',
      ],
    },
    {
      kind: 'try',
      title: 'Health: no token, no rate limit',
      goal: 'A load balancer calls GET /health on every copy of the API, over and over. It has no token, and it must never be throttled.',
      request: { method: 'GET', path: '/health' },
      expect: { status: 200, headers: { 'RateLimit-Limit': false }, body: { status: 'ok' } },
      notice: [
        'No RateLimit headers: health is never rate limited. The product and order responses you saw earlier all had RateLimit-Limit.',
        'It only says the process is alive. A readiness check that also tests the database would be a separate endpoint.',
      ],
    },
    {
      kind: 'try',
      title: 'Discovery: the OpenAPI document',
      goal: 'GET /openapi.json lists every endpoint in one machine-readable file. Tools and code generators read it, and the docs page renders it.',
      request: { method: 'GET', path: '/openapi.json' },
      expect: { status: 200, body: { openapi: '~3.', 'info.title': 'Bookshop API', 'paths./v1/products.get': '*', 'paths./v1/products.post': '*' } },
      notice: [
        'Under paths, /v1/products has a get and a post: one path, two endpoints.',
        'Python and TypeScript publish OpenAPI 3.1; C# publishes 3.0. Lesson 8 covers schemas.',
        'Open /docs in a browser to see the same document as a page: Swagger UI in Python and TypeScript, Scalar in C#.',
      ],
    },
    {
      kind: 'read',
      title: 'The route table: public paths, then /v1',
      goal: 'Each stack wires the public paths first, then everything under /v1 behind a token, then a catch-all for paths nobody serves.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/main.py',
          lines: [55, 88],
          note: 'Each router module carries its own /v1 prefix and checks the token with a dependency on each route; there is no /v1 group, so an unknown /v1 path is a plain 404.',
        },
        node: {
          path: 'node-typescript-gcp/src/app.ts',
          lines: [67, 100],
          note: 'app.use puts authentication and the rate limit in front of the whole /v1 router, so they run before routing; notFoundHandler is last.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs',
          lines: [30, 52],
          note: 'MapGroup("/v1").RequireAuthorization() covers every route in the group, and MapFallback turns any unmatched path into the not-found problem.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Collection, item and action',
      goal: 'The orders routes show all three shapes of path: the collection, one item, and an action under the item.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/orders.py',
          lines: [106, 135],
          note: 'The router prefix is /v1/orders, so "" is the collection, "/{order_id}" the item, and "/{order_id}/pay" the action.',
        },
        node: {
          path: 'node-typescript-gcp/src/orders/routes.ts',
          lines: [51, 69],
          note: 'Mounted at /v1/orders: "/" is the collection, "/:id" the item, "/:id/pay" the action, and each route names its own scope.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs',
          lines: [15, 32],
          note: 'The whole route table for orders in four calls: MapPost and MapGet on the collection, MapGet on the item, MapPost for pay.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Renaming a field',
      question:
        'Your team wants to rename priceCents to price in every product response. Many clients use the API, including a phone app that people update slowly. How do you ship it?',
      answer:
        'A rename is a breaking change, so it must not happen in place under /v1. Ship the new shape under /v2 next to it and keep /v1 running. Announce an end date for /v1 (a Sunset header is one way), watch the log lines for /v1 traffic by client id, and retire /v1 only when that traffic is gone.',
    },
    {
      kind: 'think',
      title: '401 or 404 for an unknown path?',
      question:
        'Without a token, TypeScript answers an unknown /v1 path with 401, while Python and C# answer 404. SPEC.md does not choose. Which would you pick, and why?',
      answer:
        'Both are defensible. Checking the token first, as TypeScript does, means an anonymous caller learns nothing about which paths exist. Routing first, as Python and C# do, gives a clearer answer to a typo. Pick one, write it in the contract, and make every implementation agree.',
    },
    {
      kind: 'build',
      title: 'Ship a v2 product endpoint next to v1',
      task: 'Ship a breaking change the safe way. Add GET /v2/products/{id}, which returns the price as an object, { "amountCents": 3499, "currency": "USD" }, instead of priceCents and currency. Nothing under /v1 may change.',
      steps: [
        'Find where your stack mounts /v1: python-fastapi-aws/app/main.py, node-typescript-gcp/src/app.ts or dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs.',
        'Write the /v2 route in a new file next to the v1 product routes: in python-fastapi-aws/app/routes/, node-typescript-gcp/src/products/ or dotnet-azure/src/ApiConcepts.Api/Endpoints/.',
        'Give it the same protection as v1: a valid bearer token, the products:read scope and the rate limit.',
        'Load the product with the same repository the v1 route uses, and answer the not-found problem for an unknown id.',
        'Map it to the v2 shape: id, title, author, price with amountCents and currency, tags, version, createdAt and updatedAt.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check. Then call GET /v1/products/prd_01 and make sure it did not change.',
      ],
      hints: [
        'In TypeScript, mount /v2 with the same protectedRoutes chain as /v1, and before notFoundHandler, or every /v2 request falls through to a 404.',
        'In C#, a new MapGroup("/v2") needs its own RequireAuthorization; the /v1 group’s does not reach it.',
        'Look for rules keyed on the string "/v1". Python’s Cache-Control no-store default in app/web/middleware.py, and in C# both CacheControlDefaultMiddleware and the MeteredPrefixes list in RateLimiting/ClientRateLimiter.cs, skip /v2 until you add it. Without the C# one, /v2 is not rate limited and Check fails.',
      ],
      check: {
        request: { method: 'GET', path: '/v2/products/prd_01', as: 'reader' },
        expect: { status: 200, headers: { 'RateLimit-Limit': '1000' }, body: { id: 'prd_01', 'price.currency': 'USD', 'price.amountCents': '*' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass, because /v1 did not change',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), delete the new file, or keep your change on a branch',
    },
  ],
};
