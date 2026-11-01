import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'exponential-backoff',
  intro:
    'You will play the part of a retrying client against the flaky demo endpoint: succeed, fail, retry, run out of retries, and fail as a herd. The lab cannot wait between requests, so each step says how long a real backoff loop would have waited. Then you will read the backoff code and make the server send Retry-After.',
  vars: { HEALTHY: 'uuid', KEY: 'uuid', LONG: 'uuid', HERD: 'uuid', BUILD_KEY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'A healthy call never waits',
      goal: 'Call the flaky endpoint with failTimes=0, so it does not fail at all. Backoff only matters after a failure.',
      request: { method: 'GET', path: '/v1/demo/flaky?key=eb-{{HEALTHY}}&failTimes=0', as: 'reader' },
      expect: { status: 200, body: { key: 'eb-{{HEALTHY}}', attempts: 1 } },
      notice: [
        '200 on the first attempt, so attempts is 1.',
        'A client with backoff costs nothing on the happy path: it only starts to wait after a failure.',
      ],
    },
    {
      kind: 'try',
      title: 'The first attempt fails',
      goal: 'A fresh key with failTimes=2: the server fails the first two calls with this key on purpose, like a service that is down for a moment.',
      request: { method: 'GET', path: '/v1/demo/flaky?key=eb-{{KEY}}&failTimes=2', as: 'reader' },
      expect: {
        status: 503,
        headers: { 'Retry-After': false, 'RateLimit-Remaining': true },
        body: { type: '/problems/service-unavailable', status: 503 },
      },
      notice: [
        '503 with the problem type service-unavailable: a failure that can heal, so a client may retry it.',
        'No Retry-After header: the server gives no advice, so the client uses its own formula. Before retry 1, the typed client waits 100 to 200 ms.',
        'RateLimit-Remaining counts this request too. Every retry is a real request that spends a token.',
      ],
    },
    {
      kind: 'try',
      title: 'Retry at once, and fail again',
      goal: 'Send the same request again, right away, the way a client with no backoff would.',
      request: { method: 'GET', path: '/v1/demo/flaky?key=eb-{{KEY}}&failTimes=2', as: 'reader' },
      expect: { status: 503, body: { type: '/problems/service-unavailable', detail: '~2 of 2' } },
      notice: [
        'Another 503, and the detail now says 2 of 2. The wording differs between the stacks, but each one counts the calls per key.',
        'This demo fails by count, not by time, so here waiting would not change the answer. A real outage heals with time, which is why a real client waits.',
        'A typed client would have waited 100 to 200 ms before this call, and would now wait 200 to 400 ms before the next one.',
      ],
    },
    {
      kind: 'try',
      title: 'The third attempt succeeds',
      goal: 'Send it once more. This is retry 2, the call a backoff loop sends after its second wait.',
      request: { method: 'GET', path: '/v1/demo/flaky?key=eb-{{KEY}}&failTimes=2', as: 'reader' },
      expect: { status: 200, body: { key: 'eb-{{KEY}}', attempts: 3 } },
      notice: [
        'attempts is 3: two failures, then a success. This is the same run the example scripts print.',
        'The typed client waited twice, 100 to 200 ms and then 200 to 400 ms: 300 to 600 ms in total before this answer.',
      ],
    },
    {
      kind: 'try',
      title: 'A longer outage uses up every retry',
      goal: 'With failTimes=5, send four calls in a row: the first attempt and the 3 retries the typed client allows.',
      request: { method: 'GET', path: '/v1/demo/flaky?key=eb-{{LONG}}&failTimes=5', as: 'reader', times: 4 },
      expect: { statuses: { 503: 4 }, body: { type: '/problems/service-unavailable' } },
      notice: [
        'Four 503s: the typed client’s whole budget. After the fourth it stops and throws a typed error with the problem details.',
        'Its waits had ceilings of 200, 400 and 800 ms, so it waited between 0.7 and 1.4 seconds in total before giving up.',
        'The 5-second cap never came into play: with base 200 ms, the ceiling only reaches it at retry 6.',
      ],
    },
    {
      kind: 'try',
      title: 'A herd: six clients fail at the same moment',
      goal: 'Send six calls at the same instant with one key and failTimes=6, like six clients that hit the same hiccup together.',
      request: { method: 'GET', path: '/v1/demo/flaky?key=eb-{{HERD}}&failTimes=6', as: 'reader', times: 6, parallel: true },
      expect: { statuses: { 503: 6 } },
      notice: [
        'Six requests in the same instant, six 503s.',
        'Without jitter, all six would wait exactly 200 ms and come back together: a new spike. That is the thundering herd.',
        'With this API’s equal jitter, each waits its own random time between 100 and 200 ms, so their retries arrive spread out.',
      ],
    },
    {
      kind: 'read',
      title: 'The typed client: Retry-After first, then the formula',
      goal: 'Every stack computes the delay before retry n the same way: the Retry-After header when the response has one, otherwise random(0.5, 1.0) × min(cap, base × 2^(n−1)).',
      files: {
        python: {
          path: 'python-fastapi-aws/bookshop_client/client.py',
          lines: [116, 154],
          note: 'delay_ms takes Retry-After seconds when present, else backoff_ms (line 30) with the attempt number; jitter and sleep are constructor arguments, so tests run without waiting.',
        },
        node: {
          path: 'node-typescript-gcp/src/client/client.ts',
          lines: [113, 152],
          note: 'serverDelay ?? backoffDelay(...) is the whole rule; both helpers live in src/client/retry.ts, and retryAfterMs also reads the HTTP-date form.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Client/RetryPolicy.cs',
          lines: [50, 66],
          note: 'Polly runs the loop and calls DelayFor through DelayGenerator (line 21): the Retry-After delta or date first, else the capped exponential times a random 0.5 to 1.0.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Webhooks: the same formula, a 60-second cap',
      goal: 'The webhook sender retries a failing receiver with the same formula: base WEBHOOK_RETRY_BASE_MS (default 500), cap 60 seconds, and WEBHOOK_MAX_ATTEMPTS (default 5) attempts in total.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/services/webhooks.py',
          lines: [90, 99],
          note: 'It sleeps only while attempt < max_attempts; retry_delay_ms (line 28) caps the ceiling at MAX_DELAY_MS, 60 seconds.',
        },
        node: {
          path: 'node-typescript-gcp/src/webhooks/dispatcher.ts',
          lines: [77, 91],
          note: 'After a failed attempt it saves the delivery, then sleeps webhookRetryDelay (line 19) unless that was the last attempt.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Webhooks/WebhookWorker.cs',
          lines: [29, 46],
          note: 'Task.Delay waits Backoff.Delay(attempt, WebhookRetryBase, RetryCap) from Webhooks/Backoff.cs, with RetryCap set to 60 seconds on line 18.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Full jitter or equal jitter?',
      question:
        'This API waits random(0.5, 1.0) × the ceiling (equal jitter). Full jitter waits random(0, 1.0) × the ceiling. Ten thousand phones lose the connection at the same moment. Which spreads their retries better, and what does each one cost?',
      answer:
        'Full jitter spreads the phones over the whole window, from zero to the ceiling, so the server sees the lowest peak; the cost is that some phones retry almost at once. Equal jitter makes every phone wait at least half the ceiling, but packs them into half the window, so the peak is about twice as high. Both are far better than no jitter; pick full jitter when the size of the herd matters most.',
    },
    {
      kind: 'think',
      title: 'Retry-After: 120, with a user waiting',
      question:
        'Your mobile app gets a 503 with Retry-After: 120. Its backoff formula says to wait 200 ms, and the user is looking at a spinner. What should the app do?',
      answer:
        'Never retry sooner than 120 seconds: the server said when it will be ready, and an early retry only adds load and probably fails again. But do not hold the user on a spinner for two minutes either. Stop and show a clear message, offer a retry button, or retry in the background and update the screen when it works. The header sets the earliest retry; the app still decides whether to wait at all.',
    },
    {
      kind: 'build',
      title: 'Make the flaky endpoint send Retry-After',
      task: 'Add an optional retryAfter query parameter (seconds, 1 to 60) to GET /v1/demo/flaky. When it is set, each planned 503 carries Retry-After with that value. Then point the retry example at it and watch the client wait exactly that long instead of using its formula.',
      steps: [
        'Open the flaky route in your stack: python-fastapi-aws/app/routes/demo.py, node-typescript-gcp/src/demo/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/DemoEndpoints.cs.',
        'Read an optional retryAfter query parameter and validate it the way failTimes is validated: a whole number from 1 to 60, or 400 validation-error.',
        'On a planned failure, when retryAfter is set, add the header Retry-After with that number of seconds to the 503. Without retryAfter, change nothing: the contract tests check that the plain 503 has no Retry-After.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks for a 503 with retryAfter=2 and expects Retry-After: 2.',
        'Now open the retry example: python-fastapi-aws/examples/retry_demo.py, node-typescript-gcp/examples/retry-flaky.ts or dotnet-azure/examples/RetryDemo/Program.cs. Call the flaky path with retryAfter=1 and run it as its README says (.venv/bin/python -m examples.retry_demo, npm run example:retry, or dotnet run --project examples/RetryDemo). Each wait should print 1000 ms instead of 100 to 400 ms.',
        'Run the contract suite for your stack to make sure nothing else changed.',
      ],
      hints: [
        'The problem exception in every stack already takes headers: Problem(..., headers=...) in Python, new ApiProblem(slug, detail, { headers }) in TypeScript, and new ProblemException(type, detail, headers: ...) in C#. The throttled report sends its Retry-After: 1 exactly this way.',
        'For validation, copy how failTimes is declared: a FastAPI Query with alias, ge and le; a field in the zod schema built with intInRange; or the int.TryParse check in C#. Make the new one optional.',
        'The client’s flaky method has no retryAfter argument. Use the general request method instead: request in Python and TypeScript, GetAsync in C#. The TypeScript example prints [retry-after] next to a delay that came from the header.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/demo/flaky?key=eb-build-{{BUILD_KEY}}&failTimes=10&retryAfter=2', as: 'reader' },
        expect: { status: 503, headers: { 'Retry-After': '2' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet; it builds and starts its own server on port 18001 to 18003, so yours can keep running',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
