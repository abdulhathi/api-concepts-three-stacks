import type { Practice } from '../../practice/types';

const BOOK = { title: 'Authorization Lab Notes', author: 'You', priceCents: 1500, tags: ['security'] };
const ORDER = { items: [{ productId: 'prd_01', quantity: 1 }] };
const REALM = 'Bearer realm="api-concepts"';
const needs = (scope: string) => `${REALM}, error="insufficient_scope", scope="${scope}"`;

export const practice: Practice = {
  id: 'authorization',
  intro:
    'You will see which scopes a token carries, get a 403 for each one that is missing, and then test ownership: writer creates an order, partner cannot see or pay it, and admin can. You will finish with a token that has fewer scopes than its client.',
  vars: { KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'See what your token allows',
      goal: 'The scopes are written into the token when it is issued. GET /v1/me shows the ones this token carries.',
      request: { method: 'GET', path: '/v1/me', as: 'reader' },
      expect: { status: 200, body: { clientId: 'reader', 'scopes.length': 2, 'scopes.0': 'products:read', 'scopes.1': 'orders:read' } },
      notice: [
        'Reader may read products and read orders, and nothing else.',
        'Writer and partner also have products:write and orders:write; admin adds the admin scope.',
      ],
    },
    {
      kind: 'try',
      title: 'Reader tries to create a product',
      goal: 'Creating a product needs products:write. The token is valid, so this is not a 401. It is a 403.',
      request: { method: 'POST', path: '/v1/products', as: 'reader', json: BOOK },
      expect: {
        status: 403,
        headers: { 'WWW-Authenticate': needs('products:write'), 'RateLimit-Limit': '1000' },
        body: { type: '/problems/forbidden', status: 403 },
      },
      notice: [
        'The challenge names the problem and the fix: error="insufficient_scope" and scope="products:write", both from RFC 6750.',
        'A fresh reader token would not help. Only a token with products:write would.',
        'RateLimit headers are present: the scope check runs after the rate limiter, so a 403 still uses one token from the bucket.',
      ],
    },
    {
      kind: 'try',
      title: 'Writer sends the same request',
      goal: 'The same method, path and body, with writer’s token. Writer has products:write.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: BOOK },
      expect: { status: 201, headers: { Location: '~/v1/products/prd_' }, body: { id: '*', title: BOOK.title } },
      save: { PRODUCT_ID: 'body.id' },
      notice: [
        'Same request, different token, different answer. Authorization depends on what the token carries.',
        'The lab saved the product id. The build step at the end uses it.',
      ],
    },
    {
      kind: 'try',
      title: 'Only admin may delete a product',
      goal: 'Writer may create and change products, but deleting one needs the admin scope. Try to delete the product writer just made.',
      request: { method: 'DELETE', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer' },
      expect: { status: 403, headers: { 'WWW-Authenticate': needs('admin') }, body: { type: '/problems/forbidden' } },
      notice: [
        'Even its creator cannot delete it: in this API, ownership applies to orders, not products. The route needs admin, and that is all it checks.',
        'Each route names the scope it needs, and the challenge names the one that was missing.',
      ],
    },
    {
      kind: 'try',
      title: 'The scope check runs before the handler',
      goal: 'Reader sends a create request whose body is broken JSON. Which check answers first: the body parser (400) or the scope check (403)?',
      request: { method: 'POST', path: '/v1/products', as: 'reader', headers: { 'Content-Type': 'application/json' }, raw: '{"title":' },
      expect: { status: 403, body: { type: '/problems/forbidden' } },
      notice: [
        'A writer would get 400 malformed-json for this body. Reader gets 403, because the scope check ran first and the body was never parsed.',
        'All three stacks attach the scope to the route itself, so it runs before any handler code: a dependency, a middleware, a policy.',
      ],
    },
    {
      kind: 'try',
      title: 'Writer creates an order',
      goal: 'Every order records its owner: the client id from the token, never from the body.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY}}' }, json: ORDER },
      expect: { status: 201, body: { id: '*', clientId: 'writer', status: 'pending' } },
      save: { ORDER_ID: 'body.id' },
      notice: ['clientId is writer: the owner. The lab saved the order id for the next steps.'],
    },
    {
      kind: 'try',
      title: 'Partner asks for writer’s order',
      goal: 'Partner has orders:read, so the scope check passes. The ownership check comes next.',
      request: { method: 'GET', path: '/v1/orders/{{ORDER_ID}}', as: 'partner' },
      expect: { status: 404, headers: { 'WWW-Authenticate': false }, body: { type: '/problems/not-found', status: 404 } },
      notice: [
        'The order exists, and partner gets 404 Not Found.',
        'No WWW-Authenticate, no scope: nothing in the answer says that the order exists.',
      ],
    },
    {
      kind: 'try',
      title: 'A missing order looks the same',
      goal: 'Now ask for an order id that does not exist at all, and compare the answer with the last step.',
      request: { method: 'GET', path: '/v1/orders/ord_000000000000', as: 'partner' },
      expect: { status: 404, headers: { 'WWW-Authenticate': false }, body: { type: '/problems/not-found', status: 404 } },
      notice: [
        'Same status, same problem type. A caller cannot tell "not yours" from "does not exist", so guessing ids teaches it nothing.',
        'The detail and instance only repeat the id you sent. In the C# stack the detail is even the same sentence for both.',
      ],
    },
    {
      kind: 'try',
      title: 'Ownership guards writes too',
      goal: 'Partner has orders:write, so the scope allows paying orders. Try to pay writer’s order.',
      request: { method: 'POST', path: '/v1/orders/{{ORDER_ID}}/pay', as: 'partner' },
      expect: { status: 404, body: { type: '/problems/not-found' } },
      notice: [
        'The pay route calls the same ownership function as the read route, so it answers the same 404.',
        'The order is still pending. The next step proves it.',
      ],
    },
    {
      kind: 'try',
      title: 'Admin sees every order',
      goal: 'A token with the admin scope may see any client’s orders.',
      request: { method: 'GET', path: '/v1/orders/{{ORDER_ID}}', as: 'admin' },
      expect: { status: 200, body: { id: '{{ORDER_ID}}', clientId: 'writer', status: 'pending' } },
      notice: [
        'Admin gets the order, and it is still pending: partner’s pay request changed nothing.',
        'An admin scope is powerful. In production, give it to few clients and log what they do with it.',
      ],
    },
    {
      kind: 'try',
      title: 'Ask for a token with fewer scopes',
      goal: 'A client may ask for less than it is allowed. Get an admin token that carries only orders:read.',
      request: {
        method: 'POST',
        path: '/oauth/token',
        basic: ['admin', 'admin-secret'],
        form: { grant_type: 'client_credentials', scope: 'orders:read' },
      },
      expect: { status: 200, body: { scope: 'orders:read', access_token: '*' } },
      save: { SMALL_TOKEN: 'body.access_token' },
      notice: [
        'The granted scope is only orders:read. This is least privilege: a token that leaks can do only what it carries.',
        'Lesson 13 covers the token endpoint and its scope parameter.',
      ],
    },
    {
      kind: 'try',
      title: 'Admin, without the admin scope',
      goal: 'Ask for writer’s order again as admin, but with the small token. Does the API trust the client, or the token?',
      request: { method: 'GET', path: '/v1/orders/{{ORDER_ID}}', headers: { Authorization: 'Bearer {{SMALL_TOKEN}}' } },
      expect: { status: 404, body: { type: '/problems/not-found' } },
      notice: [
        'The caller is still the admin client, but this token does not carry the admin scope, so the API treats it like any other client: not yours, 404.',
        'Scopes live on the token, not on the client. Every check reads the token.',
      ],
    },
    {
      kind: 'read',
      title: 'The scope guard',
      goal: 'One small piece of code per stack turns "this route needs scope X" into a 403 with the right challenge.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/auth/dependencies.py',
          lines: [52, 70],
          note: 'After the token check and the rate limiter, the same dependency compares the needed scope with principal.scopes and raises forbidden.',
        },
        node: {
          path: 'node-typescript-gcp/src/auth/authenticate.ts',
          lines: [37, 47],
          note: 'requireScope is a middleware factory; each route lists it before the handler, as in requireScope(\'orders:read\').',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs',
          lines: [76, 100],
          note: 'AddAuthorization (line 28) makes one policy per scope; this result handler writes the 403 and reads the needed scope from the route’s policy name.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The ownership rule',
      goal: 'One function decides whether an order is visible to the caller. Missing and not yours end in the same problem.',
      files: {
        python: { path: 'python-fastapi-aws/app/routes/orders.py', lines: [22, 46], note: 'Reader and Writer bind the scopes to the routes; _visible_order raises not-found for both cases.' },
        node: { path: 'node-typescript-gcp/src/orders/service.ts', lines: [51, 63], note: 'getVisible guards one order; listVisible applies the same rule to the list.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs', lines: [115, 140], note: 'Get and Pay both go through Visible, which throws the same NotFound problem for missing and not yours.' },
      },
    },
    {
      kind: 'think',
      title: 'Ownership in a real database',
      question:
        'This API loads an order, then compares owners in code. With a real database and millions of orders, where would you put the ownership rule, and why?',
      answer:
        'Put it in the query itself: select the order by its id and the caller’s client id together, or make the client id the partition key in DynamoDB. A handler that forgets the check still cannot read another client’s row, and "no row" maps straight to 404. Postgres row-level security can enforce the same rule inside the database.',
    },
    {
      kind: 'think',
      title: 'A client id in the request body',
      question:
        'A teammate adds an optional clientId field to the create-order body, "so admin tools can create orders for a customer". What can go wrong, and how would you build it safely?',
      answer:
        'Any caller could set clientId to another client and create orders in its name. The owner must come from the verified token, never from data the caller controls. If admin tools really need to act for a customer, accept the field only when the token carries the admin scope, and log both identities.',
    },
    {
      kind: 'build',
      title: 'Only the creator may change a product',
      task: 'Today any token with products:write can change any product. Record who created each product, and let only that client, or admin, change it with PUT or PATCH.',
      steps: [
        'Open the products routes: python-fastapi-aws/app/routes/products.py, node-typescript-gcp/src/products/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs (Create and Change).',
        'On create, remember the owner: the client id from the token. Keep it out of the product JSON, because SPEC.md fixes that shape. A map from product id to client id is enough.',
        'In PUT and PATCH, after loading the product: if it has an owner, and the caller is neither that owner nor admin, answer 403 with the forbidden problem.',
        'Seed products have no owner. Leave them open to any products:write token, so the contract tests still pass.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: partner tries to change the product that writer created in step 3.',
      ],
      hints: [
        'Why 403 here, when orders use 404? Every client can already read every product, so a 404 would hide nothing. Hide what the caller may not see; refuse what it can see but may not change.',
        'The principal is already there: rename _ to principal in the Python route, use principalOf(req) in TypeScript, and http.User.ClientId() and IsAdmin() in C#.',
        'Do not send a WWW-Authenticate header with this 403. The token has every scope it needs; this is an ownership refusal, not a scope problem.',
      ],
      check: {
        request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'partner', json: { priceCents: 999 } },
        expect: { status: 403, body: { type: '/problems/forbidden' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: all contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), if another lab needs any client to change any product',
    },
  ],
};
