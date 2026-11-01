import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'rate-limiting',
  intro:
    'You will read the RateLimit headers on a standard-plan client, see which requests are counted and which are not, then empty the free plan’s bucket of 5 and get a real 429 with Retry-After. Last, you will read the bucket in your stack and add a header of your own.',
  steps: [
    {
      kind: 'try',
      title: 'Your limit, on every response',
      goal: 'Call GET /v1/me as reader, a client on the standard plan. Every metered response says the plan limit, the tokens left and when the next token comes.',
      request: { method: 'GET', path: '/v1/me', as: 'reader' },
      expect: {
        status: 200,
        headers: { 'RateLimit-Limit': '1000', 'RateLimit-Remaining': true, 'RateLimit-Reset': '0' },
        body: { clientId: 'reader', plan: 'standard' },
      },
      notice: [
        'RateLimit-Limit is 1000: the standard plan’s requests per minute, from the server’s own client records.',
        'RateLimit-Remaining is the whole tokens left after this request. Other people may be using reader too, so yours may be lower than 999.',
        'RateLimit-Reset is 0 because tokens remain. It only counts seconds once the bucket is empty.',
      ],
    },
    {
      kind: 'try',
      title: 'A 401 is not counted',
      goal: 'Send the same request with no token. Authentication runs before the limiter, and an unknown caller cannot be charged to any client.',
      request: { method: 'GET', path: '/v1/me' },
      expect: { status: 401, headers: { 'RateLimit-Limit': false, 'RateLimit-Remaining': false }, body: { type: '/problems/unauthorized' } },
      notice: [
        'No RateLimit headers at all: the request never reached the limiter.',
        'The bucket is keyed by the client id inside a verified token. Without one, there is nobody to charge.',
      ],
    },
    {
      kind: 'try',
      title: 'A 403 is counted',
      goal: 'reader has no products:write scope, so creating a product is forbidden. The token is valid, though, so the request is counted before the scope check refuses it.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'reader',
        json: { title: 'Rate Limits in Practice', author: 'You', priceCents: 1999, tags: ['reliability'] },
      },
      expect: { status: 403, headers: { 'RateLimit-Limit': '1000', 'RateLimit-Remaining': true }, body: { type: '/problems/forbidden' } },
      notice: [
        'The 403 carries the RateLimit headers: this request spent a token.',
        'The order in every stack is authenticate, then rate limit, then check the scope. A known client pays for every request, even one it was not allowed to make.',
      ],
    },
    {
      kind: 'try',
      title: 'Health checks are never limited',
      goal: 'GET /health needs no token and is never rate limited, so a load balancer can always ask whether the server is alive.',
      request: { method: 'GET', path: '/health' },
      expect: { status: 200, headers: { 'RateLimit-Limit': false }, body: { status: 'ok' } },
      notice: ['No RateLimit headers: only authenticated /v1 and /graphql requests are metered.'],
    },
    {
      kind: 'try',
      title: 'Empty the free bucket',
      goal: 'Now the free client, whose plan allows 5 requests a minute. Send GET /v1/me six times in a row: five tokens, five 200s, then a 429.',
      request: { method: 'GET', path: '/v1/me', as: 'free', times: 6 },
      expect: {
        statuses: { 200: 5, 429: 1 },
        headers: { 'RateLimit-Limit': '5', 'RateLimit-Remaining': true, 'Retry-After': true },
        body: { type: '/problems/rate-limited', status: 429 },
      },
      notice: [
        'Open each response: RateLimit-Remaining counts down 4, 3, 2, 1, 0. On the fifth, RateLimit-Reset jumps from 0 to about 12.',
        'The sixth is 429 with Retry-After: the seconds until one more token, about 12 (one token comes back every 60 ÷ 5 = 12 seconds).',
        'The bucket refills in a minute. If you run this step again sooner, you will see fewer 200s.',
      ],
    },
    {
      kind: 'try',
      title: 'Other clients are not affected',
      goal: 'The free bucket is empty, but every client has its own. Call GET /v1/me as reader again.',
      request: { method: 'GET', path: '/v1/me', as: 'reader' },
      expect: { status: 200, headers: { 'RateLimit-Limit': '1000' }, body: { plan: 'standard' } },
      notice: [
        'A normal 200: one client running out never slows down another.',
        'The buckets live in this server’s memory, so each of the three servers keeps its own: the free client’s bucket on the other two is untouched.',
      ],
    },
    {
      kind: 'read',
      title: 'The token bucket',
      goal: 'The same algorithm three ways: add the tokens earned since the last call, capped at the plan limit, then take one if there is one.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/auth/ratelimit.py',
          lines: [44, 58],
          note: 'check refills a float token count from a clock you can fake in tests, then works out Remaining and Reset from what is left.',
        },
        node: {
          path: 'node-typescript-gcp/src/limits/rateLimit.ts',
          lines: [29, 44],
          note: 'take is the same algorithm on a Map, with the rate in tokens per millisecond.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/RateLimiting/ClientRateLimiter.cs',
          lines: [20, 43],
          note: 'No algorithm of its own: one built-in TokenBucketRateLimiter per client, adding one token every 60 ÷ limit seconds.',
        },
      },
    },
    {
      kind: 'read',
      title: 'Where the limiter runs, and the 429',
      goal: 'The limiter runs right after authentication and before the scope check, writes the three headers, and turns an empty bucket into a 429 problem with Retry-After.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/auth/dependencies.py',
          lines: [42, 70],
          note: 'One dependency verifies the token, spends a token from the bucket, then checks the scope, in exactly that order.',
        },
        node: {
          path: 'node-typescript-gcp/src/limits/rateLimit.ts',
          lines: [47, 61],
          note: 'The rateLimit middleware sets the headers on every response, then throws the rate-limited problem when the bucket was empty.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/RateLimiting/RateLimitSetup.cs',
          lines: [13, 38],
          note: 'The client limiter is the GlobalLimiter, and OnRejected writes the 429 problem with Retry-After from the recorded snapshot.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Three copies behind a load balancer',
      question:
        'In production you run three copies of this API behind a load balancer, each with this in-memory limiter. What limit does a free client really get, and how would you fix it?',
      answer:
        'Each copy has its own bucket, so the free client gets up to 15 requests a minute instead of 5, and more as you scale out. Keep the buckets in one shared store and take a token atomically there, for example a Redis script or a DynamoDB conditional update. Or put the limit in a gateway in front of every copy: API Gateway usage plans, Apigee, or API Management.',
    },
    {
      kind: 'think',
      title: 'A fixed window or a token bucket?',
      question:
        'A client may send 100 requests a minute. It sends 100 in the last second of one minute and 100 more in the first second of the next. What happens with a fixed window, and what happens with this API’s token bucket?',
      answer:
        'A fixed window accepts all 200, because the counter resets on the minute: twice the limit in two seconds. The token bucket accepts the first 100, then has earned only about 1.7 tokens in the next second (100 ÷ 60 a second), so it accepts one or two more and answers 429 to the rest.',
    },
    {
      kind: 'build',
      title: 'Publish the policy in a RateLimit-Policy header',
      task: 'The three headers say what is left, but not the rule itself. Add a RateLimit-Policy header to every metered response that states the plan, in the style that earlier versions of the IETF draft used: the limit, then w= the window in seconds, such as 1000;w=60. Expose it to browsers too.',
      steps: [
        'Find where your stack writes the RateLimit headers: python-fastapi-aws/app/auth/ratelimit.py (Decision.headers), node-typescript-gcp/src/limits/rateLimit.ts (the rateLimit middleware) or dotnet-azure/src/ApiConcepts.Api/RateLimiting/ClientRateLimiter.cs (WriteHeaders).',
        'Add RateLimit-Policy with the value limit;w=60, so 5;w=60 on the free plan and 1000;w=60 on standard. It belongs on 429 responses too.',
        'Add RateLimit-Policy to the CORS exposed headers, so a browser app can read it: CORS_EXPOSED_HEADERS in python-fastapi-aws/app/main.py, node-typescript-gcp/src/http/cors.ts, or WithExposedHeaders in dotnet-azure/src/ApiConcepts.Api/Composition/ServiceRegistration.cs.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it calls GET /v1/me as reader from an allowed origin.',
      ],
      hints: [
        'The window is always 60 seconds here, because both plans are per minute. Build the value from the same limit the other headers use.',
        'In C#, every header is written in one place from the snapshot, just before the response starts. The policy can be built from snapshot.Limit.',
        'An extra response header does not break the contract tests, but check that Access-Control-Expose-Headers still contains everything it had before.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/me', as: 'reader', headers: { Origin: 'http://localhost:5173' } },
        expect: { status: 200, headers: { 'RateLimit-Policy': '1000;w=60', 'Access-Control-Expose-Headers': '~RateLimit-Policy' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
