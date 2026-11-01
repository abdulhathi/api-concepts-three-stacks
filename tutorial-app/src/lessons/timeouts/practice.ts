import type { Practice } from '../../practice/types';

const BUSY = 'If you get 503 throttled instead, other people are running reports on this server right now. Wait about 15 seconds and send it again.';

export const practice: Practice = {
  id: 'timeouts',
  intro:
    'You will ask the report endpoint for slow work and time each answer: inside the 2 second deadline you get a 200, past it a 504 at about 2 seconds. Then you will read the code that cancels the work in each stack, and let a caller shorten the deadline.',
  steps: [
    {
      kind: 'try',
      title: 'A report inside the deadline',
      goal: 'The sales report simulates slow work with delayMs (300 ms by default). Send it with no delay set and look at the time the lab shows next to the status.',
      request: { method: 'GET', path: '/v1/reports/sales', as: 'reader' },
      expect: { status: 200, body: { orderCount: '*', revenueCents: '*', generatedAt: '*' } },
      notice: [
        'About 300 ms: the lab shows how long each request took, next to its status.',
        'The numbers count every order on this server, so they change as other people use it. Only the time matters here.',
      ],
    },
    {
      kind: 'try',
      title: 'Slow, but in time',
      goal: 'Ask for 1500 ms of work. The server’s deadline, REQUEST_TIMEOUT_MS, is 2000 ms, so this still finishes.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=1500', as: 'reader' },
      expect: { status: 200, body: { generatedAt: '*' } },
      notice: [
        'About 1500 ms and a normal 200. Slow work that finishes before the deadline is fine.',
        'A deadline is for work that would take too long, not for all slow work.',
      ],
    },
    {
      kind: 'try',
      title: 'Just past the deadline',
      goal: 'Ask for 2500 ms of work. The server stops it at 2000 ms and answers right then.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=2500', as: 'reader' },
      expect: {
        status: 504,
        headers: { 'Content-Type': '~application/problem+json' },
        body: { type: '/problems/timeout', status: 504, detail: '~2000 ms' },
      },
      notice: [
        '504 Gateway Timeout at about 2000 ms, not 2500: the server answered at its deadline, not when the work would have ended.',
        'The detail names the limit. The work was canceled, so it no longer holds one of the 2 report slots.',
        BUSY,
      ],
    },
    {
      kind: 'try',
      title: 'Far past it: the wait is still capped',
      goal: 'Ask for 10 seconds of work, the most the endpoint accepts.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=10000', as: 'reader' },
      expect: { status: 504, body: { type: '/problems/timeout' } },
      notice: [
        'Still about 2000 ms. However slow the work, the caller waits at most the deadline.',
        'With no deadline this caller would wait 10 seconds, and with a hung dependency, forever.',
        BUSY,
      ],
    },
    {
      kind: 'try',
      title: 'Too slow to even start',
      goal: 'The endpoint accepts a delay from 0 to 10000 ms. Ask for one millisecond more.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=10001', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'delayMs' } },
      notice: [
        'A 400 in a few milliseconds: no slot, no work, no deadline needed.',
        'A limit on what a request may ask for is the first defense. The deadline is the second, for work that turns out slow anyway.',
      ],
    },
    {
      kind: 'try',
      title: 'Retrying slow work does not help',
      goal: 'A 504 is on the typed client’s retry list. But this report always needs 3 seconds. Send it three times, the way a retrying client would.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=3000', as: 'reader', times: 3 },
      expect: { statuses: { 504: 3 }, body: { type: '/problems/timeout' } },
      notice: [
        'Three 504s, each at about 2000 ms: 6 seconds spent, and still no report.',
        'The typed client would try 4 times, about 9 seconds with its waits. Retries help with blips, not with work that is always too slow.',
        'Fix it on the other side: make the work faster, ask for less, or run it in the background and let the client check back for the result.',
      ],
    },
    {
      kind: 'read',
      title: 'The server: a deadline that cancels the work',
      goal: 'Each stack starts the clock when the report gets a slot, and cancels the work (not just the response) when the clock runs out.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/services/reports.py',
          lines: [28, 49],
          note: 'asyncio.wait_for cancels the work() task at the deadline and the except turns it into the timeout problem; the gate around it starts the clock only once a slot is free.',
        },
        node: {
          path: 'node-typescript-gcp/src/reports/routes.ts',
          lines: [30, 58],
          note: 'AbortSignal.timeout is created inside throttle.run, so queue time does not count, and sleep rejects the moment the signal aborts.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ReportEndpoints.cs',
          lines: [13, 45],
          note: 'WithRequestTimeout attaches the report policy (its 504 and problem body are set in Composition/ServiceRegistration.cs); Task.Delay listens to RequestAborted, which the middleware cancels at the deadline.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The client: a timeout on every attempt',
      goal: 'The typed client puts one deadline on each attempt, and treats a timed-out attempt like a dropped connection, so it can be retried.',
      files: {
        python: {
          path: 'python-fastapi-aws/bookshop_client/client.py',
          lines: [156, 173],
          note: 'asyncio.timeout bounds the whole attempt, token fetch included; the TimeoutError it raises is caught in request() above (line 122) and retried like a network error.',
        },
        node: {
          path: 'node-typescript-gcp/src/client/client.ts',
          lines: [118, 156],
          note: 'attempt() gives each fetch its own AbortSignal.timeout; the catch in withRetries turns the abort into a network failure that can be retried.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Client/RetryPolicy.cs',
          lines: [15, 43],
          note: 'AddTimeout comes after AddRetry, so the timeout sits inside the retry and each attempt gets its own 5 seconds; ShouldRetry treats TimeoutRejectedException as retryable.',
        },
      },
    },
    {
      kind: 'think',
      title: 'A 504 that leaves work behind',
      question:
        'Your report endpoint answers 504 at 2 seconds, but the database query behind it keeps running for 30 seconds. During a traffic spike, what happens, and how do you fix it?',
      answer:
        'Every timed-out request leaves a query running, so the database and the report slots fill with work whose result nobody will read. New requests then queue or get 503, even though their callers already gave up. Cancel at the deadline: pass the cancellation token or abort signal down to the query, and also set a limit in the database itself, such as statement_timeout in PostgreSQL.',
    },
    {
      kind: 'think',
      title: 'Choose the numbers',
      question:
        'A mobile app calls your API through a gateway that stops at 30 seconds. Your API calls a payment provider whose healthy p99 is 800 ms. People give up after about 10 seconds. Propose a timeout for each hop and a retry policy.',
      answer:
        'Payment call: a little above its p99, say 1 second per attempt, with 1 retry that reuses an Idempotency-Key, so about 2 seconds at worst. The API’s own deadline sits above that and far below the gateway’s 30 seconds, say 3 seconds. The app gives each attempt a little more, say 4 seconds, with a total budget of about 9 seconds, so it can try twice. Each deadline is shorter than the one around it, and every retry fits inside what a person will wait.',
    },
    {
      kind: 'build',
      title: 'Let the caller shorten the deadline',
      task: 'A caller with only 500 ms left should not make the server work for 2 seconds. Accept an optional X-Timeout-Ms header on GET /v1/reports/sales, and use the smaller of it and REQUEST_TIMEOUT_MS as the deadline.',
      steps: [
        'Open the report code: python-fastapi-aws/app/routes/reports.py and app/services/reports.py, node-typescript-gcp/src/reports/routes.ts, or dotnet-azure/src/ApiConcepts.Api/Endpoints/ReportEndpoints.cs.',
        'Read X-Timeout-Ms. If it is missing, or not a whole number from 1 to 10000, ignore it, so today’s behavior and the contract tests stay the same.',
        'Use the smaller of the header and REQUEST_TIMEOUT_MS as the deadline. A caller may shorten the deadline, never lengthen it.',
        'When the shorter deadline passes, cancel the work and answer the same 504 timeout problem, with the real limit in the detail.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks for 1 second of work with X-Timeout-Ms: 500 and expects a 504.',
      ],
      hints: [
        'Python and TypeScript: the deadline is one number passed to asyncio.wait_for or AbortSignal.timeout. Pass the smaller value in from the route instead of reading the setting directly.',
        'C#: the middleware’s token fires only at the policy time. Link a CancellationTokenSource to RequestAborted, call CancelAfter with the header value, and turn its cancellation into the timeout problem yourself.',
        'X-Timeout-Ms is a name made up for this exercise. gRPC does the same thing for real: a call with a deadline carries its remaining time in the grpc-timeout header.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/reports/sales?delayMs=1000', as: 'reader', headers: { 'X-Timeout-Ms': '500' } },
        expect: { status: 504, body: { type: '/problems/timeout' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'Without the header nothing changes, so the contract tests pass with the change. To remove it: git restore python-fastapi-aws node-typescript-gcp dotnet-azure (from APIConcepts/).',
    },
  ],
};
