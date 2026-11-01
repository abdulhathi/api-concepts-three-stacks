import type { Practice } from '../../practice/types';

const ORDER = { items: [{ productId: 'prd_01', quantity: 2 }] };

export const practice: Practice = {
  id: 'idempotency',
  intro:
    'You will create an order, retry it the way a client does after a lost response, and see the server return the first order instead of making a second one. Then you will break the rules on purpose and read the code that enforces them.',
  vars: { KEY: 'uuid', KEY_2: 'uuid', KEY_3: 'uuid', BUILD_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'Create an order without a key',
      goal: 'POST /v1/orders is not idempotent by itself, so this API refuses it unless the client sends an Idempotency-Key.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', json: ORDER },
      expect: { status: 400, body: { type: '/problems/idempotency-key-required', status: 400 } },
      notice: [
        'The answer is 400 with a problem details body: no order was created.',
        'Making the key required means no client can forget it and create duplicates on retry.',
      ],
    },
    {
      kind: 'try',
      title: 'Create an order with a key',
      goal: 'The client makes one key (a UUID) for this one order, and will send the same key on every retry of it.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY}}' }, json: ORDER },
      expect: { status: 201, headers: { Location: '~/v1/orders/ord_', 'Idempotent-Replayed': false }, body: { id: '*', status: 'pending' } },
      save: { ORDER_ID: 'body.id' },
      notice: [
        'The 201 has a Location header pointing at the new order. The lab saved its id for the next steps.',
        'There is no Idempotent-Replayed header: this is the first, real run.',
      ],
    },
    {
      kind: 'try',
      title: 'Retry: the same key and the same body',
      goal: 'Pretend the response to step 2 was lost on the network. The client cannot know whether the order exists, so it sends exactly the same request again.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY}}' }, json: ORDER },
      expect: { status: 201, headers: { 'Idempotent-Replayed': 'true', Location: '/v1/orders/{{ORDER_ID}}' }, body: { id: '{{ORDER_ID}}' } },
      notice: [
        'Same status, same body, same order id as step 2: the server replayed the stored response.',
        'Idempotent-Replayed: true tells the client this is a replay, so it can log it, but it does not have to act differently.',
        'No second order was created and no second order.created webhook was sent.',
      ],
    },
    {
      kind: 'try',
      title: 'A burst of retries at the same moment',
      goal: 'Retries can pile up: a client library, a proxy and an impatient user may all resend at once. Send the same request three times in parallel.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY}}' }, json: ORDER, times: 3, parallel: true },
      expect: { statuses: { 201: 3 }, headers: { 'Idempotent-Replayed': 'true' }, body: { id: '{{ORDER_ID}}' } },
      notice: [
        'All three are replays of the same order. The first request finished long ago, so every retry finds the stored response.',
        'If the first request were still running, a retry would get 409 idempotency-key-in-progress instead of starting a second order.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: the same key with a different body',
      goal: 'A bug in the client reuses a key for a different order. Replaying the old order would hide the bug, so the server refuses.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY}}' }, json: { items: [{ productId: 'prd_02', quantity: 1 }] } },
      expect: { status: 422, body: { type: '/problems/idempotency-key-reused' } },
      notice: [
        'The server compares a SHA-256 hash of the raw body with the hash it stored for this key.',
        '422 means the request is understood but cannot be processed as sent: the client must use a new key for a new order.',
      ],
    },
    {
      kind: 'try',
      title: 'Keys belong to one client',
      goal: 'Send the very same key and body as another client, partner. Keys are stored per client, so this is a new order for partner, not a replay of writer’s.',
      request: { method: 'POST', path: '/v1/orders', as: 'partner', headers: { 'Idempotency-Key': '{{KEY}}' }, json: ORDER },
      expect: { status: 201, headers: { 'Idempotent-Replayed': false }, body: { clientId: 'partner' } },
      notice: [
        'A fresh 201 with clientId partner and no replay header.',
        'If keys were global, one client could read another client’s order by guessing its key. The scope is the pair (client, key).',
      ],
    },
    {
      kind: 'try',
      title: 'A failed request does not use up its key',
      goal: 'Order a product that does not exist. The order fails with 422, and only successes are stored, so the key stays free.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY_3}}' }, json: { items: [{ productId: 'prd_99', quantity: 1 }] } },
      expect: { status: 422, body: { type: '/problems/unknown-product' } },
      notice: ['The server released the key when the order failed, so nothing was stored for it.'],
    },
    {
      kind: 'try',
      title: 'Fix the request and send the same key again',
      goal: 'The client fixes the product id and retries with the same key. Because the failure was not stored, this runs for real instead of answering 422 reused.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{KEY_3}}' }, json: ORDER },
      expect: { status: 201, headers: { 'Idempotent-Replayed': false } },
      notice: [
        'A real 201, not a replay and not a 422.',
        'Storing only successes is a choice. Some APIs, Stripe’s among them, store errors too. Either is fine if it is documented.',
      ],
    },
    {
      kind: 'read',
      title: 'The store: claim the key in one step',
      goal: 'Every stack has a small store with the same three outcomes: new, replay, or a refusal. The important part is that checking and claiming the key happen together.',
      files: {
        python: { path: 'python-fastapi-aws/app/repositories/idempotency.py', lines: [57, 70], note: 'begin has no await inside, so on one event loop nothing can run between the check and the claim.' },
        node: { path: 'node-typescript-gcp/src/idempotency.ts', lines: [32, 42], note: 'begin is synchronous, so no other request can run between the lookup and the set.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Orders/IdempotencyStore.cs', lines: [38, 58], note: 'Requests run on many threads, so Begin takes a lock around the check and the claim.' },
      },
    },
    {
      kind: 'read',
      title: 'The route: replay, refuse, or run and store',
      goal: 'The orders route asks the store first, then creates the order, then stores the 201. If creating fails, it releases the key.',
      files: {
        python: { path: 'python-fastapi-aws/app/routes/orders.py', lines: [59, 103], note: 'match on the outcome, then try/except that calls release on failure and complete on success.' },
        node: { path: 'node-typescript-gcp/src/orders/routes.ts', lines: [16, 49], note: 'The outcome is a tagged union checked with outcome.kind; abandon runs in the catch block.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/OrderEndpoints.cs', lines: [40, 86], note: 'A switch on the decision record; Abandon runs when creating the order throws.' },
      },
    },
    {
      kind: 'think',
      title: 'Two servers behind a load balancer',
      question:
        'In production you run three copies of this API behind a load balancer. The first request lands on copy A, and its retry lands on copy B. What happens with this code, and what would you change?',
      answer:
        'Copy B has its own memory and has never seen the key, so it creates a second order: the protection is gone. Move the store to something every copy shares, and claim the key atomically there: a DynamoDB conditional put on AWS, a Firestore transaction or Redis SET with NX on GCP, a Cosmos DB create or Redis SET with NX on Azure. Give each key an expiry, such as 24 hours.',
    },
    {
      kind: 'think',
      title: 'How long should a key live?',
      question: 'This API keeps keys for 24 hours. What goes wrong if you keep them for 5 seconds, and what goes wrong if you keep them forever?',
      answer:
        'Too short: a client that retries after a long outage, or a phone that comes back online after a minute, finds the key gone and creates a duplicate. Forever: the store grows without limit, and a client can never reuse a key for a new order. Keep keys longer than any client will keep retrying, and document it.',
    },
    {
      kind: 'build',
      title: 'Make creating a product idempotent too',
      task: 'POST /v1/products has the same problem as orders: a lost response and a retry make two products. Accept an optional Idempotency-Key there and reuse the same store, so a retry replays the first 201.',
      steps: [
        'Open the products route in your stack: python-fastapi-aws/app/routes/products.py, node-typescript-gcp/src/products/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs.',
        'Read the header. When it is missing, keep today’s behavior, so the contract tests still pass.',
        'Hash the raw body with SHA-256 and call the store’s begin with the client id, the key and the hash, exactly as the orders route does. Give the key a prefix, such as "product:", so product and order keys cannot collide.',
        'On replay, return the stored status, body and Location with Idempotent-Replayed: true. On reused or in progress, raise the same problems as orders.',
        'After creating the product, store the 201. If creating fails, release the key.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it sends the same create twice and expects the second to be a replay.',
      ],
      hints: [
        'The orders route already does every step. Copy its shape, not its words: the only differences are the path and the service you call.',
        'The store is already in the container or dependency injection: container.idempotency in Python, the idempotency argument of ordersRouter in TypeScript (pass it to productsRouter too), IIdempotencyStore in C#.',
        'Hash the raw bytes, not the parsed model. Two bodies that parse the same can differ in spacing, and the spec compares bytes.',
      ],
      check: {
        request: {
          method: 'POST',
          path: '/v1/products',
          as: 'writer',
          headers: { 'Idempotency-Key': '{{BUILD_KEY}}' },
          json: { title: 'Idempotency in Practice', author: 'You', priceCents: 1999, tags: ['reliability'] },
          times: 2,
        },
        expect: { statuses: { 201: 2 }, headers: { 'Idempotent-Replayed': 'true' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: all 58 contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
