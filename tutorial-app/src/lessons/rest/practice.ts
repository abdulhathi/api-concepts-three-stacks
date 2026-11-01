import type { Practice } from '../../practice/types';

const BOOK = { title: 'REST in Practice', author: 'A. Writer', priceCents: 1999, tags: ['rest'] };

export const practice: Practice = {
  id: 'rest',
  intro:
    'You will take one product through its whole life with the standard methods, follow the URLs the server hands you instead of building them, see that every request stands alone, and use the one action in this API that is not create, read, update or delete.',
  vars: { ORDER_KEY: 'uuid', BUILD_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'Create a product: 201 and a Location',
      goal: 'A POST to the products collection adds a new member to it. The server picks the id, so it must tell you where the new product lives.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: BOOK },
      expect: { status: 201, headers: { Location: '~/v1/products/prd_', ETag: true }, body: { id: '*', title: 'REST in Practice', version: 1 } },
      save: { PRODUCT_ID: 'body.id' },
      notice: [
        '201 Created, not 200: a new resource exists now.',
        'Location holds the new product’s URL. The lab saved the id for the next steps; a real client would keep the Location URL itself.',
        'The body is the new product, so the client does not need a second call to see what was stored.',
      ],
    },
    {
      kind: 'try',
      title: 'Follow the Location: one resource, one URL',
      goal: 'GET the URL the server gave you. What comes back is a representation of the resource: its current state, as JSON.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', headers: { Accept: 'application/json' } },
      expect: {
        status: 200,
        headers: { 'Content-Type': '~application/json', ETag: '"{{PRODUCT_ID}}-v1"', 'Cache-Control': 'private, max-age=60' },
        body: { id: '{{PRODUCT_ID}}', title: 'REST in Practice', priceCents: 1999, version: 1 },
      },
      notice: [
        'The same fields as the 201 body: one resource, one representation, whichever way you reach it.',
        'The ETag names this version of the representation, and Cache-Control says the client may reuse it for 60 seconds.',
      ],
    },
    {
      kind: 'try',
      title: 'PATCH: change part of it at the same URL',
      goal: 'The URL stays the same and the method changes. PATCH changes only the fields you send.',
      request: { method: 'PATCH', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { priceCents: 2499 } },
      expect: { status: 200, headers: { ETag: '"{{PRODUCT_ID}}-v2"' }, body: { priceCents: 2499, title: 'REST in Practice', version: 2 } },
      notice: [
        'Only the price changed; the title and author are as before.',
        'version went from 1 to 2, and so did the ETag. Every change makes a new version of the representation.',
      ],
    },
    {
      kind: 'try',
      title: 'PUT means replace the whole thing',
      goal: 'Send the same small body with PUT. PUT replaces the resource with what you send, so this API requires every field.',
      request: { method: 'PUT', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', json: { priceCents: 2999 } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.length': 3 } },
      notice: [
        'A 400 validation error that names the three missing fields: title, author and tags.',
        'The body was the same as in the PATCH step. The method alone decides what it means: that is the uniform interface.',
      ],
    },
    {
      kind: 'try',
      title: 'The collection, and a Link to the next page',
      goal: 'The product list is a resource too. Ask for two products and look for the URL of the next page in the Link header.',
      request: { method: 'GET', path: '/v1/products?limit=2', as: 'reader' },
      expect: { status: 200, headers: { Link: '~rel="next"' }, body: { 'data.length': 2, 'page.hasMore': true } },
      notice: [
        'Link holds the next page’s URL between angle brackets, followed by rel="next". This header comes from RFC 8288.',
        'A client follows that URL exactly as given. It never builds the cursor itself.',
        'There is no Link header on the last page: that is how the client knows to stop.',
      ],
    },
    {
      kind: 'try',
      title: 'Cacheable: ask again with the ETag',
      goal: 'A cacheable response can be checked cheaply. Send the ETag of the copy you hold in If-None-Match; if nothing changed, the server answers 304 with no body.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer', headers: { 'If-None-Match': '"{{PRODUCT_ID}}-v2"' } },
      expect: { status: 304, empty: true, headers: { ETag: '"{{PRODUCT_ID}}-v2"', 'Cache-Control': 'private, max-age=60' } },
      notice: [
        '304 Not Modified and an empty body: the client keeps using the copy it has.',
        'Private means only the client’s own cache may keep it, not a shared cache. The caching lesson goes deeper.',
      ],
    },
    {
      kind: 'try',
      title: 'Stateless: no token, no answer',
      goal: 'Send the same GET with no Authorization header. You just made several calls, but the server keeps no session: each request must carry its own token.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}' },
      expect: { status: 401, headers: { 'WWW-Authenticate': '~Bearer' }, body: { type: '/problems/unauthorized' } },
      notice: [
        '401 with WWW-Authenticate: Bearer. The server does not remember that you were allowed a moment ago.',
        'Because nothing is remembered between requests, any copy of the API behind a load balancer can answer any request.',
      ],
    },
    {
      kind: 'try',
      title: 'Order the product you created',
      goal: 'Orders are another collection with the same shape: POST creates one, and the answer is 201 with a Location. This API also requires an Idempotency-Key here.',
      request: {
        method: 'POST',
        path: '/v1/orders',
        as: 'writer',
        headers: { 'Idempotency-Key': '{{ORDER_KEY}}' },
        json: { items: [{ productId: '{{PRODUCT_ID}}', quantity: 1 }] },
      },
      expect: {
        status: 201,
        headers: { Location: '~/v1/orders/ord_', 'Cache-Control': 'no-store' },
        body: { status: 'pending', totalCents: 2499, 'items.0.productId': '{{PRODUCT_ID}}' },
      },
      save: { ORDER_ID: 'body.id' },
      notice: [
        'The same pattern as products: 201, a Location, and the new order in the body. Knowing one resource means knowing the next.',
        'The total uses the price after your PATCH: 2499 cents.',
        'Cache-Control: no-store. An order is private and changes, so no cache may keep it.',
      ],
    },
    {
      kind: 'try',
      title: 'An action that is not CRUD: pay, twice',
      goal: 'Paying is not create, read, update or delete. This API makes it a POST to a sub-resource of the order. Send it twice.',
      request: { method: 'POST', path: '/v1/orders/{{ORDER_ID}}/pay', as: 'writer', times: 2 },
      expect: { statuses: { 200: 2 }, body: { id: '{{ORDER_ID}}', status: 'paid' } },
      notice: [
        'Both answers are 200 with status paid. The second call found the order already paid and left it unchanged.',
        'POST, because paying has side effects: the first call emits an order.paid event (a webhook, if anyone subscribed), the second does not.',
        'It is a verb in the URL, but it lives under the order it acts on.',
      ],
    },
    {
      kind: 'try',
      title: 'DELETE the product',
      goal: 'Remove the product you created. Deleting needs the admin scope in this API, so this step sends the admin client’s token.',
      request: { method: 'DELETE', path: '/v1/products/{{PRODUCT_ID}}', as: 'admin' },
      expect: { status: 204, empty: true },
      notice: ['204 No Content: done, and there is nothing to send back.', 'The order you placed keeps its own copy of the title and price, so it is not affected.'],
    },
    {
      kind: 'try',
      title: 'GET it again: 404',
      goal: 'The resource is gone, so its URL now answers 404, with the same problem details shape as every other error in this API.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'writer' },
      expect: { status: 404, headers: { 'Content-Type': '~application/problem+json' }, body: { type: '/problems/not-found', status: 404 } },
      notice: [
        'A standard status code with a standard body. A client that handles 404 for products already handles it for orders.',
        'The detail text differs between the three stacks; the type and status are the contract.',
      ],
    },
    {
      kind: 'read',
      title: 'The create handler: 201 and Location',
      goal: 'Each stack sets the status to 201 and puts the new product’s URL in the Location header, next to its ETag.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/products.py',
          lines: [95, 107],
          note: 'The handler passes 201 and the Location header to _representation, which adds the ETag; status_code=201 in the decorator documents it for OpenAPI.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/routes.ts',
          lines: [71, 85],
          note: 'router.post on the collection: the handler sets Location, then sendProduct writes the ETag and the 201.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs',
          lines: [85, 95],
          note: 'The Create handler sets Location and ETag on the response, then returns Results.Json with statusCode 201.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The list handler: the Link header',
      goal: 'When there is another page, each stack adds a Link header with rel="next" and the next page’s URL, keeping the limit and the tag filter.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/routes/products.py',
          lines: [56, 80],
          note: 'next_link, from app/web/pagination.py, returns the Link header only when the page has a next cursor.',
        },
        node: {
          path: 'node-typescript-gcp/src/products/routes.ts',
          lines: [47, 62],
          note: 'URLSearchParams builds the query string, so the cursor is escaped before it goes into the Link URL.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs',
          lines: [44, 74],
          note: 'NextLink builds the header with Uri.EscapeDataString, and List sets it only when there is a next cursor.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Design a cancel',
      question:
        'Product asks for order cancellation: a pending order can be canceled, a paid one cannot. Design the request, the success answer and the error, in the style of this API.',
      answer:
        'Make it an action like pay: POST /v1/orders/{id}/cancel, POST because it has side effects such as an event. Success is 200 with the order, status canceled; canceling a canceled order again returns 200 unchanged, as pay does. Canceling a paid order is a state change the rules forbid, so 409 with the invalid-state problem. Do not use DELETE: the order stays in the history, only its state changes.',
    },
    {
      kind: 'think',
      title: 'Keep it in the session?',
      question:
        'A teammate wants to keep each user’s current filters and page position in server memory, so the app can send shorter requests. What does that cost?',
      answer:
        'It breaks statelessness. Requests must now reach the same server, so the load balancer needs sticky sessions, a restart or a deploy loses everyone’s place, and shared caches cannot reuse responses that depend on hidden state. Keep that state in the request instead: filters in the query string, the position in an opaque cursor. If it must live on the server, make it a real resource with its own URL.',
    },
    {
      kind: 'build',
      title: 'Add a pay link to pending orders',
      task: 'Hypermedia means the server tells the client what it can do next. Make a pending order’s responses carry Link: </v1/orders/{id}/pay>; rel="payment", so a client finds the pay action without building its URL. payment is a registered link relation, so clients can rely on its name.',
      steps: [
        'Open the orders route in your stack: python-fastapi-aws/app/routes/orders.py, node-typescript-gcp/src/orders/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs.',
        'When an order is created (201), add a Link header that points at its pay URL with rel="payment". A new order is always pending.',
        'Do the same for GET of one order, but only while its status is pending. A paid order has nothing left to pay, so it gets no pay link.',
        'Make sure an idempotent replay of the create sends the same Link header as the first answer.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it creates a new order and expects the pay link.',
      ],
      hints: [
        'The create already sets Location from the order id. The pay link is the same URL with /pay at the end.',
        'A replay builds its answer from the stored response. Either store the Link with it, or build it again from the stored Location.',
        'Link is already in the CORS exposed headers, so browser clients can read it without more changes.',
      ],
      check: {
        request: {
          method: 'POST',
          path: '/v1/orders',
          as: 'writer',
          headers: { 'Idempotency-Key': '{{BUILD_KEY}}' },
          json: { items: [{ productId: 'prd_01', quantity: 1 }] },
        },
        expect: { status: 201, headers: { Link: '~/pay>; rel="payment"' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: all contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
