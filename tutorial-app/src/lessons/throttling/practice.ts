import type { Practice } from '../../practice/types';

const REPORT = '/v1/reports/sales?delayMs=600';

export const practice: Practice = {
  id: 'throttling',
  intro:
    'You will fill the sales report’s gate step by step: one report, two at once, four at once, then six, and watch the server run two, queue two and turn the rest away in milliseconds. Then you will read the gate in your stack and make its numbers configurable.',
  steps: [
    {
      kind: 'try',
      title: 'One report',
      goal: 'GET /v1/reports/sales is the slow, expensive endpoint. The delayMs parameter makes the demo report take that long, here 300 ms.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=300', as: 'reader' },
      expect: { status: 200, headers: { 'RateLimit-Limit': '1000' }, body: { orderCount: '*', revenueCents: '*', generatedAt: '*' } },
      notice: [
        'It took a little over 300 ms: the report ran at once, because the gate was empty.',
        'The RateLimit headers are here too. This request passed the rate limiter first (concept 20), then the throttle. Two limits, two different jobs.',
        'If something else is filling the gate right now (another tab, or the timeouts lab), you may see a 503 here. Wait a few seconds and send it again.',
      ],
    },
    {
      kind: 'try',
      title: 'Two at once: both run',
      goal: 'Send two reports at the same time. The gate lets two run at once, so neither waits.',
      request: { method: 'GET', path: REPORT, as: 'reader', times: 2, parallel: true },
      expect: { statuses: { 200: 2 } },
      notice: ['Both took about 600 ms: each got a slot of its own.'],
    },
    {
      kind: 'try',
      title: 'Four at once: two run, two wait',
      goal: 'Send four at once. Two get the slots, and two wait in the line, first in, first out.',
      request: { method: 'GET', path: REPORT, as: 'reader', times: 4, parallel: true },
      expect: { statuses: { 200: 4 } },
      notice: [
        'Look at the times: two finished in about 600 ms, and two in about 1200 ms. The second pair waited for a slot, then did its own 600 ms of work.',
        'Nobody was refused. A short line absorbs a small burst.',
      ],
    },
    {
      kind: 'try',
      title: 'Six at once: two are turned away',
      goal: 'Send six at once. Two run, two wait, and the last two find no room at all.',
      request: { method: 'GET', path: REPORT, as: 'reader', times: 6, parallel: true },
      expect: { statuses: { 200: 4, 503: 2 } },
      notice: [
        'The two 503s came back in a few milliseconds, not after a slow wait. Open one: Retry-After: 1, and the problem type /problems/throttled.',
        'Which two requests get the 503 depends on the order they reach the server, so it changes from run to run.',
        'If you see more than two 503s, something else is running reports on this server at the same time. Wait 15 seconds and try again.',
      ],
    },
    {
      kind: 'try',
      title: 'Eight at once: still four',
      goal: 'More pressure does not mean more work. Send eight at once.',
      request: { method: 'GET', path: REPORT, as: 'reader', times: 8, parallel: true },
      expect: { statuses: { 200: 4, 503: 4 } },
      notice: [
        'Still exactly four 200s. The gate never holds more than two running and two waiting, however many arrive.',
        'That is load shedding: the extra requests are refused on purpose, so the accepted ones finish on time.',
      ],
    },
    {
      kind: 'try',
      title: 'Cheap routes are not throttled',
      goal: 'Send six requests for the product list at once. Only the report route has a gate.',
      request: { method: 'GET', path: '/v1/products?limit=1', as: 'reader', times: 6, parallel: true },
      expect: { statuses: { 200: 6 } },
      notice: [
        'All six succeed. A cheap route should never wait behind slow reports.',
        'The same is true of GET /health, which is never throttled and never rate limited.',
      ],
    },
    {
      kind: 'try',
      title: 'The size of the work is bounded too',
      goal: 'Ask for a report that takes 20 seconds. The API accepts delayMs from 0 to 10000 only.',
      request: { method: 'GET', path: '/v1/reports/sales?delayMs=20000', as: 'reader' },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'delayMs' } },
      notice: [
        'A 400, before the request ever reaches the gate.',
        'Limiting how many run at once is only half of it. Each job must have a bounded size too, or one caller can hold a slot for as long as it likes.',
      ],
    },
    {
      kind: 'read',
      title: 'The gate',
      goal: 'Each stack has the same three outcomes: run now, wait in the line, or be refused at once. Find where each one happens.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/services/throttle.py',
          lines: [16, 39],
          note: 'asyncio.Semaphore(2) holds the slots and wakes waiters in order; the _waiting counter is what lets it refuse at once instead of queueing forever.',
        },
        node: {
          path: 'node-typescript-gcp/src/limits/throttle.ts',
          lines: [22, 41],
          note: 'A running count and an array of resolvers; release hands the slot straight to the oldest waiter with shift, so running never drops in between.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/RateLimiting/RateLimitSetup.cs',
          lines: [17, 47],
          note: 'No custom gate: AddConcurrencyLimiter with PermitLimit 2, QueueLimit 2 and OldestFirst, and OnRejected tells a throttled 503 apart from a rate-limited 429.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Where the gate wraps the report',
      goal: 'Only the report route is throttled. See how each stack puts the slow work inside the gate and turns a full gate into 503 throttled with Retry-After: 1.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/services/reports.py',
          lines: [28, 49],
          note: 'The work and its deadline run inside self._gate.run, so the report’s time limit starts only when it gets a slot.',
        },
        node: {
          path: 'node-typescript-gcp/src/reports/routes.ts',
          lines: [25, 58],
          note: 'throttle.run wraps the work, and a ThrottleFullError becomes the throttled problem with Retry-After: 1.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/ReportEndpoints.cs',
          lines: [11, 36],
          note: 'RequireRateLimiting opts this one endpoint into the reports policy; no other route has it.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Why 503 and not 429?',
      question: 'A full report gate answers 503. A client that sends too many requests answers 429. Why not use 429 for both?',
      answer:
        '429 means you, this client, sent too many, and slowing down will fix it. A full gate is not the caller’s fault: the server is busy for everyone, and a client that sent one request gets the same answer. That is what 503 means. Both carry Retry-After, and the problem type (rate-limited or throttled) tells them apart.',
    },
    {
      kind: 'think',
      title: 'Choosing the numbers',
      question:
        'Each report holds one database connection for about 3 seconds. The pool has 20 connections, shared with all other traffic, and callers give up after 10 seconds. How would you choose the running limit and the queue size?',
      answer:
        'Keep the running limit well below the pool, so cheap requests always find a connection: a few reports, not 20. Then size the queue from the wait you can accept: with 4 running and 3-second reports, each place in line adds about 0.75 seconds of waiting, so a queue of 4 means at most 3 seconds of waiting plus 3 of work: 6 seconds, safely under 10. Measure under real load and adjust.',
    },
    {
      kind: 'build',
      title: 'Make the gate’s numbers configurable',
      task: 'The 2 running and 2 waiting are written into the code. Read them from two new environment variables, REPORT_MAX_RUNNING and REPORT_MAX_WAITING, with today’s values as defaults. Then start your server with REPORT_MAX_WAITING=0 and watch the line disappear.',
      steps: [
        'Add the two settings next to REQUEST_TIMEOUT_MS: python-fastapi-aws/app/config.py, node-typescript-gcp/src/config.ts or dotnet-azure/src/ApiConcepts.Api/AppSettings.cs. Default both to 2.',
        'Use them where the gate is built: python-fastapi-aws/app/container.py (ConcurrencyGate), node-typescript-gcp/src/reports/routes.ts (new ConcurrencyThrottle(2, 2); pass the two numbers in from src/app.ts, the way requestTimeoutMs already is) or dotnet-azure/src/ApiConcepts.Api/RateLimiting/RateLimitSetup.cs (PermitLimit and QueueLimit).',
        'Restart your server with REPORT_MAX_WAITING=0 in its environment, for example REPORT_MAX_WAITING=0 followed by your usual start command.',
        'Press Check: it sends four reports at once. With no line, two run and two get 503 at once.',
      ],
      hints: [
        'Zero is a valid queue size: every request that finds the slots busy is refused. Make sure your parsing accepts 0.',
        'In C#, the limiter options are set in a Configure callback that already receives ClientRateLimiter. The overload Configure<TDep1, TDep2> can receive AppSettings too.',
        'The defaults must stay 2 and 2: the contract tests expect four 200s and two 503s from six reports at once.',
      ],
      check: {
        request: { method: 'GET', path: REPORT, as: 'reader', times: 4, parallel: true },
        expect: { statuses: { 200: 2, 503: 2 } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: with the variables unset, the contract tests must still pass',
      undo: 'Restart your server without REPORT_MAX_WAITING so the other labs see 2 and 2 again. To remove the change: git restore python-fastapi-aws node-typescript-gcp dotnet-azure (from APIConcepts/).',
    },
  ],
};
