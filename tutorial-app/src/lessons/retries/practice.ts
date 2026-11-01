import type { Practice } from '../../practice/types';

const ORDER = { items: [{ productId: 'prd_01', quantity: 2 }] };

export const practice: Practice = {
  id: 'retries',
  intro:
    'You will play the typed client’s retry loop by hand against the flaky demo endpoint, spend a whole retry budget, and prove that some failures never heal. Then you will read the retry rules in each stack and make the endpoint fail in a way your client must not retry.',
  vars: { PEEK: 'uuid', KEY: 'uuid', LONG: 'uuid', BAD: 'uuid', ORDER_KEY: 'uuid', BUILD_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'One call, one 503',
      goal: 'The flaky demo endpoint fails the first failTimes calls for each key, on purpose. Send one call with a new key and look at a transient failure.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{PEEK}}&failTimes=2', as: 'reader' },
      expect: {
        status: 503,
        headers: { 'Content-Type': '~application/problem+json', 'Retry-After': false },
        body: { type: '/problems/service-unavailable', status: 503 },
      },
      notice: [
        '503 Service Unavailable means “not now”. It is on the retry list of every typed client here: 408, 429, 502, 503, 504.',
        'The body is problem details with the type service-unavailable. The detail counts the call, 1 of 2; its wording differs by stack.',
        'There is no Retry-After header, so the client chooses its own wait (exponential backoff, concept 25).',
      ],
    },
    {
      kind: 'try',
      title: 'Play the retry loop by hand',
      goal: 'This is what the typed client does for you. Send the same GET three times in a row with one new key: two failures, then a success.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{KEY}}&failTimes=2', as: 'reader', times: 3 },
      expect: { statuses: { 503: 2, 200: 1 }, body: { key: '{{KEY}}', attempts: 3 } },
      notice: [
        '503, 503, 200: the failure healed by itself. That is a transient failure.',
        'attempts is the server’s own count of calls for this key: 3.',
        'The typed client hides the first two answers. Your code sees only the 200, a little later.',
      ],
    },
    {
      kind: 'try',
      title: 'Spend the whole budget',
      goal: 'The typed client stops after 3 retries, so 4 attempts in all. Make an outage that lasts 5 calls, and send the 4 attempts the client would send.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{LONG}}&failTimes=5', as: 'reader', times: 4 },
      expect: { statuses: { 503: 4 }, body: { type: '/problems/service-unavailable' } },
      notice: [
        'Four 503s. Here the client stops and throws a typed error that carries this last problem details body.',
        'A cap limits how long one call waits and how much extra load it adds. It does not shorten the outage.',
      ],
    },
    {
      kind: 'try',
      title: 'The server recovers later',
      goal: 'A later request, from a new user action or a background job, finds the server healthy again. Send the same key twice more.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{LONG}}&failTimes=5', as: 'reader', times: 2 },
      expect: { statuses: { 503: 1, 200: 1 }, body: { key: '{{LONG}}', attempts: 6 } },
      notice: [
        'Call 5 still fails, and call 6 succeeds: attempts is 6.',
        'Giving up after 4 attempts was right for that one request. Recovering from a long outage belongs to a higher level: the user, a queue or a scheduled job.',
      ],
    },
    {
      kind: 'try',
      title: 'A 400 never heals',
      goal: 'Ask the endpoint for 11 failures. The limit is 10, so the request itself is wrong. Send it three times and see whether waiting helps.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{BAD}}&failTimes=11', as: 'reader', times: 3 },
      expect: { statuses: { 400: 3 }, body: { type: '/problems/validation-error', 'errors.0.field': 'failTimes' } },
      notice: [
        'The same 400 three times: a permanent failure. Only a changed request can succeed.',
        'The typed client throws a 400 after the first attempt, because 400 is not on its retry list.',
      ],
    },
    {
      kind: 'try',
      title: 'A 404 never heals either',
      goal: 'Ask twice for a product that does not exist.',
      request: { method: 'GET', path: '/v1/products/prd_000000000000', as: 'reader', times: 2 },
      expect: { statuses: { 404: 2 }, body: { type: '/problems/not-found', status: 404 } },
      notice: [
        'Two identical 404s. The product does not appear because you asked again.',
        '401, 403 and 422 are the same story: something in the request must change before it is sent again.',
      ],
    },
    {
      kind: 'try',
      title: 'A 500 is not retried in this repo',
      goal: 'The crash demo raises an unhandled exception on purpose. The answer is a 500, and the typed client does not retry it.',
      request: { method: 'GET', path: '/v1/demo/crash', as: 'reader' },
      expect: { status: 500, body: { type: '/problems/internal-error', detail: 'An unexpected error occurred.' } },
      notice: [
        'A 500 usually means a bug, and a bug fails the same way on the next try. So 500 is not on the retry list here.',
        'Policies differ: some clients retry a 500 once. A server that knows a failure is temporary should say so with a 503, which every client here retries.',
      ],
    },
    {
      kind: 'try',
      title: 'A POST with a key is safe to retry',
      goal: 'createOrder in every typed client makes one Idempotency-Key and sends it on every attempt. Send the same order twice with one key, the way a retry does.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{ORDER_KEY}}' }, json: ORDER, times: 2 },
      expect: { statuses: { 201: 2 }, headers: { 'Idempotent-Replayed': 'true', Location: '~/v1/orders/ord_' }, body: { id: '*', status: 'pending' } },
      notice: [
        'The second 201 is a replay: the same order id, with Idempotent-Replayed: true. One order, even with a retry.',
        'This is why the typed client may retry a POST that carries an Idempotency-Key (concept 22).',
      ],
    },
    {
      kind: 'try',
      title: 'A POST with no key is not',
      goal: 'Creating a product is a POST with no Idempotency-Key (create_product in Python, CreateProductAsync in C#). Send the same create twice, as if a lost response had been retried.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: 'Retried Without a Key', author: 'Practice Lab', priceCents: 100 }, times: 2 },
      expect: { statuses: { 201: 2 }, headers: { 'Idempotent-Replayed': false, Location: '~/v1/products/prd_' } },
      notice: [
        'Two 201s, so two products with two different ids. The server cannot tell a retry from a new request.',
        'That is why the typed client never retries a POST without a key, even on a 503. It throws, and your code decides what to do.',
      ],
    },
    {
      kind: 'read',
      title: 'The retry rules in one place',
      goal: 'Every client asks the same three questions after a failure: is the status on the list, is the request safe to repeat, and is any budget left? Find each one.',
      files: {
        python: {
          path: 'python-fastapi-aws/bookshop_client/client.py',
          lines: [113, 145],
          note: 'retryable_method is decided once, before the loop; the if block throws ApiError for a status off the list, an unsafe request or a spent budget.',
        },
        node: {
          path: 'node-typescript-gcp/src/client/client.ts',
          lines: [113, 152],
          note: 'withRetries throws at once for a status not in RETRYABLE_STATUSES, then gives up when isSafeToRetry (in retry.ts) says no or the budget is spent.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Client/RetryPolicy.cs',
          lines: [12, 48],
          note: 'Polly’s retry strategy calls ShouldRetry: a network error, a timeout or a listed status, and only for a request that IsReplayable says can be sent twice.',
        },
      },
    },
    {
      kind: 'read',
      title: 'One key for every attempt',
      goal: 'The typed operations decide which calls can be retried. createOrder makes its key once, before the loop; other POSTs, such as paying an order, send none.',
      files: {
        python: {
          path: 'python-fastapi-aws/bookshop_client/client.py',
          lines: [80, 98],
          note: 'create_order makes one UUID per call and passes it as a header, so every attempt in request() sends the same key.',
        },
        node: {
          path: 'node-typescript-gcp/src/client/client.ts',
          lines: [78, 93],
          note: 'createOrder puts randomUUID() in the headers once; withRetries reuses the same Headers object on every attempt.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Client/ApiClient.cs',
          lines: [39, 56],
          note: 'CreateOrderAsync passes Guid.NewGuid() as the key; CreateProductAsync and PayOrderAsync pass null, so Polly never retries them.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Retries in every layer',
      question:
        'A web page calls a gateway, the gateway calls the orders API, and the orders API calls a payment service. Every layer retries 3 times. The payment service goes down. How many calls can one click make to it, and what would you change?',
      answer:
        'Each layer makes up to 4 attempts, so one click can make 4 × 4 × 4 = 64 calls to a service that is already down: a retry storm built into the design. Retry in one layer only, and make the others fail fast and pass the error up. Add backoff with jitter, and honor Retry-After.',
    },
    {
      kind: 'think',
      title: 'Should a 500 be retried?',
      question:
        'This client never retries a 500. A colleague says your 500s are often a database blip and wants to add 500 to the retry list. What do you ask, and what do you decide?',
      answer:
        'Ask whether the request is safe to repeat, and whether a 500 can come after part of the work was done. Most 500s are bugs that fail the same way again, so retrying them only multiplies load and noise in the logs. If the cause really is a temporary database problem, change the server to answer 503 for it, which every client already retries, and keep 500 for bugs.',
    },
    {
      kind: 'build',
      title: 'Choose how the flaky endpoint fails',
      task: 'Add an optional status query parameter to GET /v1/demo/flaky: 503 (today’s behavior) or 500. Then watch your typed client retry one and give up at once on the other.',
      steps: [
        'Open the flaky route: python-fastapi-aws/app/routes/demo.py, node-typescript-gcp/src/demo/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/DemoEndpoints.cs.',
        'Read an optional status parameter. Accept 500 or 503, default 503, and answer 400 validation-error for anything else.',
        'For the planned failures, raise service-unavailable when it is 503, as today, and internal-error when it is 500. Keep counting calls per key exactly as now.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it sends status=500 with failTimes=1 and expects one 500, then a 200.',
        'Give the typed client’s flaky method a status argument (python-fastapi-aws/bookshop_client/client.py, node-typescript-gcp/src/client/client.ts or dotnet-azure/src/ApiConcepts.Client/ApiClient.cs) and call it with 500 from the example script (python-fastapi-aws/examples/retry_demo.py, node-typescript-gcp/examples/retry-flaky.ts or dotnet-azure/examples/RetryDemo/Program.cs). Run it: it gives up after 1 attempt, while 503 still succeeds on attempt 3.',
      ],
      hints: [
        'SPEC.md says every 500 has exactly the detail “An unexpected error occurred.”, so keep that detail for the planned 500s too.',
        'Validate status the same way the route already validates failTimes, so a bad value gets the same 400 shape.',
        'You change nothing in the retry policy. The client decides from the status alone, which is the point of the exercise.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/demo/flaky?key={{BUILD_KEY}}&failTimes=1&status=500', as: 'reader', times: 2 },
        expect: { statuses: { 500: 1, 200: 1 }, body: { attempts: 2 } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'The default stays 503, so the contract tests pass with the change. To remove it: git restore python-fastapi-aws node-typescript-gcp dotnet-azure (from APIConcepts/).',
    },
  ],
};
