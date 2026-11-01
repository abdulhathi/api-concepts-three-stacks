import type { Practice } from '../../practice/types';

// Inbox names, new each time the lab loads, so deliveries from an earlier visit never mix in.
// (An inbox `box` also accepts {{NAME}} placeholders; a module-level random name works just as well.)
const RUN = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const BOX = `wh-${RUN}`;
const RETRY_BOX = `wh-${RUN}-retry`;

const ORDER = { items: [{ productId: 'prd_10', quantity: 1 }] };

// The build step's check: a payment-provider event signed with the dev secret whsec_dev_payments,
// but with a timestamp from 2026-01-01, far outside the 300-second window.
const PAYMENT_EVENT = '{"id":"evt_0123456789ab","type":"payment.succeeded","data":{"orderId":"ord_0123456789ab"}}';
const PAYMENT_SIGNATURE = 'v1=2229b6519e207aad0fd78aade7889d13875c6bd71671ceb795e2d5a4936927df';

export const practice: Practice = {
  id: 'webhooks',
  intro:
    'You will subscribe this lab’s own inbox to order events, create and pay an order, and watch signed deliveries arrive. Then you will make the receiver fail on purpose, watch the API retry with backoff, and read the delivery log.',
  vars: { ORDER_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'Subscribe the lab’s inbox to order.created',
      goal: 'A subscription is a resource: a URL plus the events it wants. The URL here is this lab’s inbox, which records every delivery it receives.',
      request: { method: 'POST', path: '/v1/webhooks', as: 'admin', json: { url: `{{LAB}}/lab/inbox/${BOX}`, events: ['order.created'] } },
      expect: {
        status: 201,
        headers: { Location: '~/v1/webhooks/whk_' },
        body: { id: '~whk_', secret: '~whsec_', 'events.0': 'order.created', url: `{{LAB}}/lab/inbox/${BOX}` },
      },
      save: { HOOK_ID: 'body.id', SECRET: 'body.secret' },
      notice: [
        'The secret starts with whsec_. It is shown once, in this response only: listing subscriptions never shows it. The lab saved it to check signatures.',
        'Only the admin scope may subscribe, because a subscription sends order data to any URL it names.',
      ],
    },
    {
      kind: 'try',
      title: 'Create an order to fire the event',
      goal: 'Creating an order publishes order.created. The API answers you at once, and delivers the event in the background to every subscription that wants it.',
      request: { method: 'POST', path: '/v1/orders', as: 'writer', headers: { 'Idempotency-Key': '{{ORDER_KEY}}' }, json: ORDER },
      expect: { status: 201, body: { id: '*', status: 'pending' } },
      save: { ORDER_ID: 'body.id' },
      notice: [
        'The 201 came back at once. It did not wait for the inbox: delivery happens after the response.',
        'The lab saved the order id. You will pay this order later, to fire order.paid.',
      ],
    },
    {
      kind: 'inbox',
      title: 'Watch the delivery arrive, and check its signature',
      goal: 'The API POSTed the event to the inbox. The lab recomputes HMAC-SHA256 of "<timestamp>.<raw body>" with the secret from step 1 and compares it with the Webhook-Signature header.',
      box: BOX,
      secret: '{{SECRET}}',
      notice: [
        'Webhook-Id is the event id (evt_…), the same as the id in the body. Retries of one event keep the same Webhook-Id.',
        'Webhook-Signature is v1= and 64 hex characters, made from Webhook-Timestamp, a dot and the raw body.',
        'If other people create orders on this server, their events arrive here too: a subscription gets every matching event.',
      ],
    },
    {
      kind: 'try',
      title: 'Read the delivery log',
      goal: 'The API keeps a log of every delivery per subscription. It is the first place to look when a receiver says it never got an event.',
      request: { method: 'GET', path: '/v1/webhooks/{{HOOK_ID}}/deliveries', as: 'admin' },
      expect: { status: 200, body: { 'data.0.eventType': 'order.created', 'data.0.status': 'succeeded', 'data.0.attempts': 1, 'data.0.lastStatusCode': 200, 'data.0.lastError': null } },
      notice: [
        'status is pending, succeeded or failed. attempts counts every try, including the first.',
        'lastStatusCode is what the receiver answered last time; lastError is null because that answer was a success.',
      ],
    },
    {
      kind: 'try',
      title: 'Subscribe a receiver that fails',
      goal: 'The ?fail=2 at the end of this URL makes the inbox answer 500 to the first two attempts of each event. This subscription listens for order.paid only.',
      request: { method: 'POST', path: '/v1/webhooks', as: 'admin', json: { url: `{{LAB}}/lab/inbox/${RETRY_BOX}?fail=2`, events: ['order.paid'] } },
      expect: { status: 201, body: { id: '~whk_', secret: '~whsec_', 'events.0': 'order.paid' } },
      save: { RETRY_ID: 'body.id', RETRY_SECRET: 'body.secret' },
      notice: ['Every subscription has its own secret. The lab saved this one too.'],
    },
    {
      kind: 'try',
      title: 'Pay the order to fire order.paid',
      goal: 'Paying moves the order from pending to paid and publishes order.paid. Only the failing receiver listens for it.',
      request: { method: 'POST', path: '/v1/orders/{{ORDER_ID}}/pay', as: 'writer' },
      expect: { status: 200, body: { id: '{{ORDER_ID}}', status: 'paid' } },
      notice: [
        'Again the answer did not wait for the receiver, even though this receiver is going to fail.',
        'Paying an order that is already paid answers 200 and sends no event, so the event means: this just happened.',
      ],
    },
    {
      kind: 'inbox',
      title: 'Watch the retries arrive',
      goal: 'The first two attempts get 500. The API waits and tries again, with a longer wait each time, until the third attempt gets 200. It takes about one or two seconds.',
      box: RETRY_BOX,
      secret: '{{RETRY_SECRET}}',
      notice: [
        'Three deliveries with the same Webhook-Id: answered 500, 500, then 200. One event, three attempts.',
        'Compare the times: the wait before retry 1 is 250 to 500 ms, and before retry 2 it is 500 to 1000 ms. Exponential backoff with jitter, from WEBHOOK_RETRY_BASE_MS = 500.',
        'Each attempt has a fresh Webhook-Timestamp and so a new signature, and every one is valid.',
      ],
    },
    {
      kind: 'try',
      title: 'Read the log of the retried delivery',
      goal: 'The log shows the whole story of that event in one entry: how many attempts it took and how it ended.',
      request: { method: 'GET', path: '/v1/webhooks/{{RETRY_ID}}/deliveries', as: 'admin' },
      expect: { status: 200, body: { 'data.0.eventType': 'order.paid', 'data.0.status': 'succeeded', 'data.0.attempts': 3, 'data.0.lastStatusCode': 200 } },
      notice: [
        'attempts is 3: two failures and one success. Had all 5 attempts (WEBHOOK_MAX_ATTEMPTS) failed, status would be failed.',
        'The log tells you what the API saw. It cannot tell you whether the receiver processed the event, only that it answered.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: a writer tries to subscribe',
      goal: 'Subscriptions need the admin scope. A writer token can create orders, but it cannot point the API’s order events at a URL of its choice.',
      request: { method: 'POST', path: '/v1/webhooks', as: 'writer', json: { url: `{{LAB}}/lab/inbox/${BOX}`, events: ['order.created'] } },
      expect: { status: 403, body: { type: '/problems/forbidden' } },
      notice: ['403 forbidden, as a problem details body: the token is valid, but it lacks the admin scope.'],
    },
    {
      kind: 'try',
      title: 'Misuse: an event the API does not send',
      goal: 'The API sends two events, order.created and order.paid. Subscribing to anything else is a validation error, not a subscription that never fires.',
      request: { method: 'POST', path: '/v1/webhooks', as: 'admin', json: { url: `{{LAB}}/lab/inbox/${BOX}`, events: ['order.shipped'] } },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': '~events' } },
      notice: [
        'The field name differs a little between stacks (events, events.0 or events[0]), but every stack points at events.',
        'Failing loudly is kinder than accepting a subscription that would silently never receive anything.',
      ],
    },
    {
      kind: 'try',
      title: 'Clean up: delete the first subscription',
      goal: 'Delete your subscriptions when you are done, so the server stops sending to the inbox.',
      request: { method: 'DELETE', path: '/v1/webhooks/{{HOOK_ID}}', as: 'admin' },
      expect: { status: 204, empty: true },
      notice: ['204 No Content: the subscription is gone, and so is its delivery log. Asking for the log now would be a 404.'],
    },
    {
      kind: 'try',
      title: 'Clean up: delete the failing subscription',
      goal: 'The same for the second one.',
      request: { method: 'DELETE', path: '/v1/webhooks/{{RETRY_ID}}', as: 'admin' },
      expect: { status: 204, empty: true },
      notice: ['Deleting it again would answer 404 not-found: DELETE is idempotent in its effect, not in its status code.'],
    },
    {
      kind: 'read',
      title: 'Delivering in the background, with retries',
      goal: 'Each stack hands deliveries to background work that the request never waits for, then loops: attempt, record the result, wait with backoff, try again.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/services/webhooks.py',
          lines: [68, 99],
          note: 'publish records a pending delivery and starts an asyncio task it never awaits; _deliver retries with retry_delay_ms until a 2xx or the last attempt.',
        },
        node: {
          path: 'node-typescript-gcp/src/webhooks/dispatcher.ts',
          lines: [54, 92],
          note: 'deliver saves a pending record, then loops: attempt, persist the outcome, sleep webhookRetryDelay; publish (line 35) starts it without awaiting it.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Webhooks/WebhookWorker.cs',
          lines: [20, 56],
          note: 'A BackgroundService reads jobs from the Channel that WebhookService.Publish writes to, and retries each one with Backoff.Delay.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Signing, and the receiver’s verify helper',
      goal: 'The signature is HMAC-SHA256 over "<timestamp>.<raw body>". The verify helper checks the timestamp window first, then compares signatures in constant time.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/signature.py',
          lines: [15, 45],
          note: 'sign builds the message from bytes; verify_signature rejects a timestamp more than 300 s away, then uses hmac.compare_digest.',
        },
        node: {
          path: 'node-typescript-gcp/src/webhooks/signature.ts',
          lines: [7, 35],
          note: 'timingSafeEqual needs equal lengths, so the length is checked first; several space-separated signatures are accepted, for secret rotation.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Client/WebhookSignature.cs',
          lines: [9, 34],
          note: 'The receiver helper lives in the client library; CryptographicOperations.FixedTimeEquals compares the raw HMAC bytes, and it accepts one signature only.',
        },
      },
    },
    {
      kind: 'think',
      title: 'The same event, twice',
      question:
        'Your receiver handled an order.created event and answered 200, but the answer was lost on the network. What happens next, and what must your receiver do about it?',
      answer:
        'The API saw a failure, so it retries, and the same event arrives again with the same Webhook-Id. Delivery is at least once, never exactly once. The receiver must remember the Webhook-Id values it has handled (in a table with a unique key, for example) and answer 200 to a repeat without doing the work again.',
    },
    {
      kind: 'think',
      title: 'A receiver that is down for an hour',
      question:
        'With the defaults here (5 attempts, a 500 ms base), how long does the API keep trying a dead receiver, and what would you change for production?',
      answer:
        'The four waits are at most 0.5, 1, 2 and 4 seconds, so even if every attempt waits its full 5 seconds, the API gives up in well under a minute and marks the delivery failed: an hour-long outage loses every event. In production, retry for hours or days with a capped, growing delay, move delivery to a durable queue with a dead-letter queue, alert on failed deliveries, and offer a way to redeliver or a list endpoint the receiver can use to catch up.',
    },
    {
      kind: 'build',
      title: 'Receive a signed webhook yourself',
      task: 'Add a receiver to your stack: POST /hooks/payments, for events from a payment provider. It verifies the signature with your stack’s verify helper, answers 204 when it is genuine, and answers 400 with a problem whose type is /problems/invalid-signature when it is not.',
      steps: [
        'Add the route outside /v1, so it needs no Bearer token: the signature is its authentication. Python: a new router in python-fastapi-aws/app/routes/, included in app/main.py. TypeScript: app.post in node-typescript-gcp/src/app.ts, before notFoundHandler. C#: app.MapPost in dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs, before MapFallback.',
        'Use the secret whsec_dev_payments (dev only, like the demo clients; in production it would come from a secret store).',
        'Read the raw body bytes and the Webhook-Timestamp and Webhook-Signature headers, and call the verify helper: verify_signature in python-fastapi-aws/app/web/signature.py, verifyWebhookSignature in node-typescript-gcp/src/webhooks/signature.ts, or a Verify in C# (the one in dotnet-azure/src/ApiConcepts.Client/WebhookSignature.cs shows how).',
        'Add invalid-signature (400) to the problem types: the slug table in python-fastapi-aws/app/web/problems.py, CATALOG and ProblemSlug in node-typescript-gcp/src/http/problem.ts, ProblemType in dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs. Raise it when verification fails.',
        'Remember each Webhook-Id you accept (a set is enough here). A repeat answers 204 again without doing the work twice.',
        'Restart your server (TypeScript reloads by itself under npm run dev), then press Check: it sends a correctly signed event whose timestamp is from 2026-01-01, which must be rejected. To test the happy path, sign a fresh one in your terminal: TS=$(date +%s); BODY=\'{"id":"evt_1","type":"payment.succeeded"}\'; SIG=$(printf \'%s.%s\' "$TS" "$BODY" | openssl dgst -sha256 -hmac whsec_dev_payments | sed \'s/^.* //\'), then POST $BODY with Webhook-Id: evt_1, Webhook-Timestamp: $TS and Webhook-Signature: v1=$SIG.',
      ],
      hints: [
        'Verify the bytes exactly as they arrived. In TypeScript, the jsonBody middleware keeps them in req.rawBody; in Python, await request.body(); in C#, JsonBody.ReadRawAsync.',
        'The check sends a signature that is correct for its body. If your route answers 204, it skipped the timestamp check: anything more than 300 seconds from now must fail.',
        'In C#, the API project does not reference the client library. Copy Verify next to Sign in dotnet-azure/src/ApiConcepts.Api/Webhooks/WebhookSignature.cs, or add a project reference.',
      ],
      check: {
        request: {
          method: 'POST',
          path: '/hooks/payments',
          headers: {
            'Content-Type': 'application/json',
            'Webhook-Id': 'evt_0123456789ab',
            'Webhook-Timestamp': '1767225600',
            'Webhook-Signature': PAYMENT_SIGNATURE,
          },
          raw: PAYMENT_EVENT,
        },
        expect: { status: 400, body: { type: '/problems/invalid-signature' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
