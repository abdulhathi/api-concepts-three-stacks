import type { VideoScript } from '../../video/types';

export const video: VideoScript = {
  id: 'throttling',
  scenes: [
    {
      kind: 'title',
      title: 'Throttling',
      subtitle: 'Protect an expensive endpoint: let a few requests run, queue a few, and turn the rest away fast.',
      say: [
        'This lesson is about throttling: limiting how much work the server does at the same time, so it stays alive under load.',
        'You will see how a concurrency limit and a short queue protect a slow endpoint, and why a fast 503 is kinder than a slow timeout.',
      ],
    },
    {
      kind: 'flow',
      title: 'Everyone wants the report',
      name: 'report-rush',
      nodes: [
        { id: 'team', kind: 'user', label: 'Finance team', col: 0, row: 0 },
        { id: 'shop', kind: 'phone', label: 'Shop app', col: 0, row: 2 },
        { id: 'api', kind: 'server', label: 'Bookshop API', col: 2, row: 1 },
        { id: 'db', kind: 'db', label: 'Database', sub: 'connection pool', col: 4, row: 1 },
      ],
      edges: [
        { from: 'team', to: 'api' },
        { from: 'shop', to: 'api' },
        { from: 'api', to: 'db' },
      ],
      say: [
        'Monday morning, the finance team opens the sales dashboard. Every open tab asks for the sales report, which is slow and heavy.',
        'Each report runs a big query. The database has a fixed pool of connections, and the reports take all of them.',
        'A customer in the shop app asks for a product page. It is a cheap request, but it waits for a connection like everyone else.',
        'The shop app gives up after a few seconds. The answer comes too late, and nobody reads it.',
        'The finance tabs time out too, so people press refresh. Now even more reports are running.',
        'Memory runs out, and the server falls over. Now nobody gets anything: not the reports, and not the shop.',
        'No client broke its rate limit. The problem is how much work runs at the same time.',
      ],
      beats: [
        {
          send: [
            { path: ['team', 'api'], label: 'GET report' },
            { path: ['team', 'api'], label: 'GET report' },
            { path: ['team', 'api'], label: 'GET report' },
          ],
        },
        {
          badge: { db: 'pool full' },
          send: [
            { path: ['api', 'db'], label: 'big query', tone: 'data' },
            { path: ['api', 'db'], label: 'big query', tone: 'data', sameTime: true },
          ],
        },
        { badge: { shop: 'waiting' }, send: [{ path: ['shop', 'api'], label: 'GET product' }] },
        { badge: { shop: 'timeout' }, send: [{ path: ['api', 'shop'], label: '200 OK', tone: 'reply', lost: true }] },
        {
          badge: { team: 'refresh', api: 'CPU 100%' },
          send: [
            { path: ['team', 'api'], label: 'GET report' },
            { path: ['team', 'api'], label: 'GET report' },
            { path: ['team', 'api'], label: 'GET report' },
          ],
        },
        {
          down: ['api'],
          badge: { api: 'no memory' },
          send: [
            { path: ['api', 'team'], label: 'connection lost', tone: 'fail' },
            { path: ['api', 'shop'], label: 'connection lost', tone: 'fail', sameTime: true },
          ],
        },
        { focus: ['api'], note: 'Too much work at once, not too many requests' },
      ],
    },
    {
      kind: 'flow',
      title: 'The idea: run, wait, or refuse',
      name: 'report-gate',
      nodes: [
        { id: 'callers', kind: 'user', label: 'Callers', sub: 'any client', col: 0, row: 1 },
        { id: 'gate', kind: 'gateway', label: 'Report gate', sub: '2 run, 2 wait', col: 2, row: 1 },
        { id: 'work', kind: 'worker', label: 'Report work', col: 4, row: 1 },
      ],
      edges: [
        { from: 'callers', to: 'gate' },
        { from: 'gate', to: 'work' },
      ],
      panels: [{ id: 'state', title: 'Inside the gate', col: 2, row: 2.55, width: 230, rows: ['running: none', 'waiting: none'] }],
      say: [
        'Here is the core idea, called throttling. Put a gate in front of the expensive work, and count how many requests are inside it right now.',
        'In this API, two sales reports may run at the same time. Requests one and two arrive, and both start at once.',
        'Requests three and four find both slots busy. They wait in a short line, in the order they came.',
        'Request five finds two running and two waiting. There is no room, so it is turned away at once, with 503 and Retry-After: 1.',
        'When report one finishes, its slot goes straight to request three, the oldest in line. The server never runs more than two.',
      ],
      beats: [
        { focus: ['gate', 'state'] },
        {
          send: [
            { path: ['callers', 'gate', 'work'], label: 'report 1' },
            { path: ['callers', 'gate', 'work'], label: 'report 2', sameTime: true },
          ],
          rows: { state: ['running: 1, 2', 'waiting: none'] },
        },
        {
          send: [
            { path: ['callers', 'gate'], label: 'report 3' },
            { path: ['callers', 'gate'], label: 'report 4' },
          ],
          rows: { state: ['running: 1, 2', 'waiting: 3, 4'] },
        },
        {
          send: [
            { path: ['callers', 'gate'], label: 'report 5' },
            { path: ['gate', 'callers'], label: '503, retry in 1 s', tone: 'fail' },
          ],
          focus: ['state'],
        },
        {
          send: [
            { path: ['work', 'gate', 'callers'], label: '200, report 1', tone: 'reply' },
            { path: ['gate', 'work'], label: 'report 3' },
          ],
          rows: { state: ['running: 2, 3', 'waiting: 4'] },
        },
      ],
    },
    {
      kind: 'pause',
      title: 'Pause and think',
      question: 'Every client of the report is on a plan of 1000 requests a minute. Does that rate limit protect the report endpoint?',
      answer: 'No. Fifty clients, each far inside their own limit, can still start fifty slow reports at once.',
      say: ['Every client that calls the report is on the standard plan: 1000 requests a minute. Does that rate limit protect the report endpoint?'],
      answerSay: [
        'No. Fifty clients, each far inside their own limit, can still start fifty slow reports at the same moment.',
        'A rate limit counts requests per client over time. A slow endpoint also needs a limit on work in progress, for everyone together.',
      ],
    },
    {
      kind: 'compare',
      title: 'Throttling versus rate limiting',
      left: {
        label: 'Rate limiting',
        points: ['Counts requests per client, over time', 'Protects fairness between clients', 'Answers 429: you sent too many'],
      },
      right: {
        label: 'Throttling',
        points: ['Counts work in progress, for everyone', 'Protects the server’s capacity', 'Answers 503: the server is busy'],
      },
      rightAt: 2,
      say: [
        'So there are two different limits, and they answer two different questions.',
        'Rate limiting asks: has this client sent too many requests this minute? It is per client, and it answers 429, which means you, specifically, sent too many.',
        'Throttling asks: is the server already doing too much? It counts work in progress for all clients together, and answers 503: the service cannot take this right now.',
        'The words are used loosely. AWS API Gateway calls its request rate limit throttling, and answers 429. In this course, throttling means a limit on work in progress.',
      ],
    },
    {
      kind: 'flow',
      title: 'A concurrency limit',
      name: 'in-flight',
      nodes: [
        { id: 'clients', kind: 'client', label: 'Clients', col: 0, row: 1 },
        { id: 'api', kind: 'server', label: 'Bookshop API', col: 2, row: 1 },
        { id: 'db', kind: 'db', label: 'Database', col: 4, row: 1 },
      ],
      edges: [
        { from: 'clients', to: 'api' },
        { from: 'api', to: 'db' },
      ],
      say: [
        'A concurrency limit counts requests in flight: started, and not finished yet. Why count those, and not requests per second?',
        'Because the number in flight is the arrival rate times the time each request takes. Twenty fast requests a second, at 50 ms each, means about one in flight.',
        'Now slow reports: only two a second, but each takes three seconds. That means six in flight. Few requests, a lot of work.',
        'So slow requests hit a concurrency limit even when the request rate is low. That is exactly what a rate limit misses.',
        'Pick the number from the scarce resource: database connections, CPU cores, or memory per job. This API allows two reports at a time.',
      ],
      beats: [
        { focus: ['api'] },
        {
          badge: { api: '1 in flight' },
          send: [
            { path: ['clients', 'api'], label: 'GET product' },
            { path: ['api', 'clients'], label: '200, 50 ms', tone: 'reply' },
          ],
        },
        {
          badge: { api: '6 in flight' },
          send: [
            { path: ['clients', 'api'], label: 'GET report' },
            { path: ['api', 'db'], label: 'big query', tone: 'data' },
            { path: ['clients', 'api'], label: 'GET report' },
            { path: ['api', 'db'], label: 'big query', tone: 'data' },
          ],
        },
        { focus: ['api'], note: 'In flight = arrival rate x time per request' },
        { badge: { api: 'limit: 2', db: 'connections' }, focus: ['db'] },
      ],
    },
    {
      kind: 'flow',
      title: 'A short line, first in, first out',
      name: 'fifo-queue',
      nodes: [
        { id: 'r3', kind: 'client', label: 'Request 3', col: 0, row: 0 },
        { id: 'r4', kind: 'client', label: 'Request 4', col: 0, row: 1 },
        { id: 'r5', kind: 'client', label: 'Request 5', col: 0, row: 2 },
        { id: 'line', kind: 'queue', label: 'Waiting line', sub: 'at most 2', col: 2, row: 1 },
        { id: 'slots', kind: 'worker', label: 'Running', sub: '2 slots, both busy', col: 4, row: 1 },
      ],
      edges: [
        { from: 'r3', to: 'line' },
        { from: 'r4', to: 'line' },
        { from: 'r5', to: 'line' },
        { from: 'line', to: 'slots' },
      ],
      panels: [{ id: 'order', title: 'Line, oldest first', col: 4, row: 2.4, width: 230, rows: ['(empty)'] }],
      say: [
        'Why have a line at all? Because work arrives in small bursts. A request that comes a moment too early should wait a little, not fail.',
        'Both slots are busy. Request three joins the line, then request four behind it. The line holds two, so now it is full.',
        'Request five arrives. The line is full, so it does not join. It is refused at once, with 503.',
        'First in, first out. When a slot frees up, request three, which has waited longest, goes next. That is fair, and it keeps every wait short.',
        'The line is short on purpose. With two slots and two places, nobody waits much longer than one report takes. A line of a thousand would make the last caller wait for 500 rounds of reports.',
      ],
      beats: [
        { focus: ['line'] },
        {
          send: [
            { path: ['r3', 'line'], label: 'report 3' },
            { path: ['r4', 'line'], label: 'report 4' },
          ],
          rows: { order: ['1. request 3', '2. request 4'] },
          badge: { line: 'full' },
        },
        {
          send: [
            { path: ['r5', 'line'], label: 'report 5' },
            { path: ['line', 'r5'], label: '503', tone: 'fail' },
          ],
          badge: { r5: 'refused' },
        },
        {
          send: [{ path: ['line', 'slots'], label: 'request 3' }],
          rows: { order: ['1. request 4'] },
          badge: { line: null, r3: 'running' },
        },
        { relabel: { line: { sub: 'bounded: 2 places' } }, focus: ['order'] },
      ],
    },
    {
      kind: 'http',
      title: 'Shedding load: 503 and Retry-After',
      request: ['GET /v1/reports/sales?delayMs=600 HTTP/1.1', 'Authorization: Bearer eyJhbGciOi…'],
      response: [
        'HTTP/1.1 503 Service Unavailable',
        'Content-Type: application/problem+json',
        'Retry-After: 1',
        'RateLimit-Limit: 1000',
        'RateLimit-Remaining: 996',
        '',
        '{"type":"/problems/throttled",',
        ' "status":503,',
        ' "detail":"Too many reports are',
        '   running. Try again shortly.", …}',
      ],
      responseAt: 1,
      marks: [{ req: [0] }, { res: [0] }, { res: [2] }, { res: [6, 7, 8, 9] }, { res: [3, 4] }],
      say: [
        'Here is that fifth request on the wire. It asks for the sales report, with a parameter that makes the demo report take 600 ms.',
        'It is refused within a few milliseconds, with 503 Service Unavailable. RFC 9110 defines 503 for a server that is overloaded for now, and will likely recover after a delay.',
        'Retry-After: 1 tells the client to try again in one second. By then a slot, or a place in line, is usually free.',
        'The body is problem details with the type throttled, so a client can tell it apart from other 503 answers, such as a failing dependency.',
        'Notice the RateLimit headers. This request passed the rate limiter and spent a token, and then the throttle refused it. Two limits, two different jobs.',
      ],
    },
    {
      kind: 'flow',
      title: 'Why a fast no is kinder',
      name: 'fail-fast',
      nodes: [
        { id: 'callers', kind: 'user', label: 'Fifty callers', col: 0, row: 1 },
        { id: 'api', kind: 'server', label: 'Report API', sub: 'no limit on the line', col: 2.5, row: 1 },
      ],
      edges: [{ from: 'callers', to: 'api' }],
      panels: [{ id: 'line', title: 'Report line', col: 5, row: 1, width: 230, rows: ['running: 0', 'waiting: 0'] }],
      say: [
        'Now imagine the same endpoint with no limit on its line. Fifty people ask for a report at once.',
        'Two run, and 48 wait. The last one waits for 24 rounds of reports. At one second each, that is 24 seconds, and most clients give up long before that.',
        'But the server does not know they left. It keeps running reports for people who are gone: work done for nobody.',
        'The people who gave up press retry, so the line grows faster than it drains. This is how a slow server becomes a dead one.',
        'Now put the bounded gate back. Four are accepted, and the other 46 get a 503 within milliseconds.',
        'The four finish within about two seconds. The others know right away, so they can show a clear message, or come back in a second. A fast no is kinder than a slow maybe.',
      ],
      beats: [
        { send: [{ path: ['callers', 'api'], label: '50 reports' }] },
        { rows: { line: ['running: 2', 'waiting: 48', 'last waits: 24 s'] }, badge: { callers: 'gave up' } },
        { send: [{ path: ['api', 'callers'], label: '200 OK', tone: 'reply', lost: true }], badge: { api: 'wasted work' } },
        {
          send: [
            { path: ['callers', 'api'], label: 'retry' },
            { path: ['callers', 'api'], label: 'retry' },
          ],
          rows: { line: ['running: 2', 'waiting: 90', 'last waits: 45 s'] },
          down: ['api'],
        },
        {
          up: ['api'],
          relabel: { api: { sub: '2 run, 2 wait' } },
          badge: { api: null, callers: null },
          rows: { line: ['running: 2', 'waiting: 2', 'refused: 46'] },
          send: [{ path: ['callers', 'api'], label: '50 reports' }, { path: ['api', 'callers'], label: '46 x 503', tone: 'fail' }],
        },
        { send: [{ path: ['api', 'callers'], label: '4 x 200', tone: 'reply' }], note: 'A fast no beats a slow timeout' },
      ],
    },
    {
      kind: 'flow',
      title: 'One gate for every route',
      name: 'shared-gate',
      nodes: [
        { id: 'lb', kind: 'lb', label: 'Load balancer', col: 0, row: 1 },
        { id: 'a', kind: 'server', label: 'API copy A', sub: 'one line for all', col: 2, row: 0 },
        { id: 'b', kind: 'server', label: 'API copy B', sub: 'one line for all', col: 2, row: 2 },
      ],
      edges: [
        { from: 'lb', to: 'a' },
        { from: 'lb', to: 'b' },
      ],
      say: [
        'One more mistake: putting every route behind the same gate. Copy A is busy with reports: both slots are taken, and more reports wait in its one shared line.',
        'The load balancer sends a health check to copy A. The check is cheap, but it waits in line behind the reports, and it times out.',
        'So the load balancer marks copy A as down, and sends all the traffic to copy B.',
        'Copy B now has twice the load, and soon fails its own health check. One slow route took down the whole service.',
        'The fix is to throttle only the expensive routes. In this API only the sales report has a gate. The health check is never throttled and never rate limited.',
      ],
      beats: [
        { badge: { a: 'slots full' }, focus: ['a'] },
        {
          send: [
            { path: ['lb', 'a'], label: 'health check' },
            { path: ['a', 'lb'], label: '200 OK', tone: 'reply', lost: true },
          ],
        },
        {
          down: ['a'],
          send: [
            { path: ['lb', 'b'], label: 'all traffic' },
            { path: ['lb', 'b'], label: 'all traffic' },
          ],
          badge: { b: '2x load' },
        },
        { down: ['b'], note: 'One slow route, and the whole service is down' },
        {
          up: ['a', 'b'],
          relabel: { a: { sub: 'gate on reports only' }, b: { sub: 'gate on reports only' } },
          badge: { a: null, b: null },
          send: [
            { path: ['lb', 'a'], label: 'health check' },
            { path: ['a', 'lb'], label: '200 OK', tone: 'reply' },
          ],
        },
      ],
    },
    {
      kind: 'table',
      title: 'The same gate in each stack',
      head: ['Stack', 'In the code', 'In its cloud'],
      rows: [
        ['Python', 'asyncio Semaphore and a count of waiters', 'Lambda reserved concurrency'],
        ['TypeScript', 'hand-written: a count and a list of waiters', 'Cloud Run concurrency: 80'],
        ['C#', 'built-in ConcurrencyLimiter policy', 'API Management limit-concurrency'],
      ],
      lead: 1,
      say: [
        'Each stack builds the same gate in its own way.',
        'Python uses an asyncio Semaphore, which wakes waiters in order, plus a count of waiters so it can refuse at once. On AWS, Lambda reserved concurrency caps how many copies of a function run at the same time.',
        'TypeScript has a small hand-written class: a running count and a list of waiters. A finished report passes its slot straight to the oldest waiter. Cloud Run caps requests per instance, at 80 in this repo.',
        'C# needs no custom code. The built-in ConcurrencyLimiter policy has two permits, a queue of two, oldest first. On Azure, API Management has a limit concurrency policy.',
      ],
    },
    {
      kind: 'signals',
      title: 'When to reach for throttling',
      lead: 1,
      rows: [
        { see: 'A slow report or export endpoint', think: 'A concurrency limit and a short queue' },
        { see: 'Everything slows down under load', think: 'Shed load early with 503' },
        { see: 'Clients time out while waiting in line', think: 'A shorter queue: fail fast' },
        { see: 'Health checks fail under load', think: 'Throttle only the expensive routes' },
        { see: 'One client takes more than its share', think: 'Rate limiting, not throttling' },
      ],
      say: [
        'Here is how to spot throttling questions in design reviews and interviews.',
        'A slow, expensive endpoint, such as a report or an export, needs a concurrency limit and a short queue.',
        'When everything slows down together under load, shed some of it early, with 503 and Retry-After.',
        'When clients time out while their request is still waiting in line, the queue is too long. Make it shorter, and fail fast.',
        'When health checks fail under load, the expensive routes are starving the cheap ones. Throttle only the expensive routes.',
        'And when one client takes more than its fair share, that is rate limiting, from the last lesson.',
      ],
    },
    {
      kind: 'points',
      title: 'Common mistakes',
      tone: 'warn',
      points: ['An unbounded queue', 'A 503 with no Retry-After', 'One gate for every route', 'A rate limit alone for slow work'],
      say: [
        'An unbounded queue. It hides overload until memory runs out, and its last callers wait longer than any client will. Bound it, and refuse the rest.',
        'A 503 with no Retry-After. Clients cannot tell when to come back, so they tend to hammer the server.',
        'One gate for every route. A cheap health check should never wait behind slow reports.',
        'Trusting a rate limit alone to protect slow work. Rate limits count requests; slow work needs a limit on requests in flight.',
      ],
    },
    {
      kind: 'pause',
      title: 'Pause and think',
      question: 'Each report takes 600 ms. Six requests arrive together. How many get a 200, how long does the slowest take, and what do the rest get?',
      answer: 'Four 200s: two after about 0.6 s, two after about 1.2 s. The other two get 503 with Retry-After: 1, at once.',
      say: ['Each report takes 600 ms. Six requests arrive at the same moment. How many get a 200, how long does the slowest one take, and what do the others get?'],
      answerSay: [
        'Four get a 200. Two run at once and finish after about 0.6 seconds. Two wait their turn and finish after about 1.2 seconds.',
        'The other two get 503 with Retry-After: 1, within a few milliseconds. You will see these exact numbers in the practice tab.',
      ],
    },
    {
      kind: 'recap',
      title: 'Recap',
      points: [
        'Throttling limits work in progress, for everyone',
        'A concurrency limit: two reports run at once',
        'A short FIFO queue: two more may wait',
        'Full: 503 with Retry-After, at once',
        'Throttle only the expensive routes',
      ],
      next: 'idempotency',
      say: [
        'Let us recap.',
        'Throttling limits how much work runs at once, for all clients together. Rate limiting counts each client’s requests over time.',
        'A concurrency limit fits slow work: in this API, two reports run at the same time.',
        'A short line, first in first out, absorbs small bursts: two more may wait.',
        'When both are full, refuse at once with 503 and Retry-After. A fast no is kinder than a slow timeout.',
        'And throttle only the expensive routes. Now open the practice tab and fill the gate yourself, then watch the next lesson: idempotency.',
      ],
    },
  ],
};
