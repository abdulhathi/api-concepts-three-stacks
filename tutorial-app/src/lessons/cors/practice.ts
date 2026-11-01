import type { Practice } from '../../practice/types';

const APP = 'http://localhost:5173';
const EVIL = 'https://evil.example';

export const practice: Practice = {
  id: 'cors',
  intro:
    'This lab page calls the servers through its own proxy, so it is same-origin and your browser enforces no CORS here. Instead, each step sends the headers a browser would send (Origin and the preflight headers) and shows you the server’s side of CORS: who it allows, what it allows, and what it still answers.',
  steps: [
    {
      kind: 'try',
      title: 'A simple request from the allowed origin',
      goal: 'The health check needs no token and no special header, so a browser would send it as a simple request, adding Origin itself. http://localhost:5173 is the default in CORS_ORIGINS.',
      request: { method: 'GET', path: '/health', headers: { Origin: APP } },
      expect: {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': APP, Vary: '~Origin', 'Access-Control-Allow-Credentials': false },
      },
      notice: [
        'Access-Control-Allow-Origin echoes the exact origin, never a wildcard.',
        'Vary: Origin tells caches that this answer depends on the Origin header.',
        'No Access-Control-Allow-Credentials: this API uses bearer tokens, not cookies.',
      ],
    },
    {
      kind: 'try',
      title: 'A different port is a different origin',
      goal: 'Same host, port 5174. An origin is the scheme, the host and the port, and all three must match an entry in the allowlist.',
      request: { method: 'GET', path: '/health', headers: { Origin: 'http://localhost:5174' } },
      expect: { status: 200, headers: { 'Access-Control-Allow-Origin': false } },
      notice: [
        'The server still answered 200 with the body. It only left out Access-Control-Allow-Origin, and a browser would hide the response from the page.',
        'Try http://127.0.0.1:5173 or https://localhost:5173 in your terminal: different host name, different scheme, same result.',
        'Python still sends Access-Control-Expose-Headers here. Without Allow-Origin, it means nothing to a browser.',
      ],
    },
    {
      kind: 'try',
      title: 'The preflight',
      goal: 'A real API call carries a bearer token, so a browser first asks permission with OPTIONS: the origin, the method it wants and the headers it wants to send. No token.',
      request: {
        method: 'OPTIONS',
        path: '/v1/products',
        headers: { Origin: APP, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
      },
      expect: {
        headers: {
          'Access-Control-Allow-Origin': APP,
          'Access-Control-Allow-Methods': '~GET',
          'Access-Control-Allow-Headers': '~authorization',
          'Access-Control-Max-Age': '600',
          'Access-Control-Allow-Credentials': false,
        },
      },
      notice: [
        'No token, yet no 401: the preflight is answered before authentication and rate limiting.',
        'Python’s Starlette answers 200 with a short text body; TypeScript and C# answer 204 with none. SPEC.md allows both.',
        'The lists differ in order and spacing between stacks, and Python also lists a few basic headers such as Accept. What counts is that GET and Authorization are in them.',
      ],
    },
    {
      kind: 'try',
      title: 'A preflight for an order',
      goal: 'Creating an order needs POST, a JSON body and two more headers: Authorization and Idempotency-Key. The browser asks for all of them at once.',
      request: {
        method: 'OPTIONS',
        path: '/v1/orders',
        headers: {
          Origin: APP,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type, idempotency-key',
        },
      },
      expect: {
        headers: { 'Access-Control-Allow-Origin': APP, 'Access-Control-Allow-Methods': '~POST', 'Access-Control-Allow-Headers': '~idempotency-key' },
      },
      notice: [
        'Idempotency-Key is a custom header. If it were missing from Access-Control-Allow-Headers, a browser app could not send safe retries at all.',
        'The browser caches this answer for Access-Control-Max-Age, 600 seconds, per origin and URL.',
      ],
    },
    {
      kind: 'try',
      title: 'A preflight for a conditional update',
      goal: 'A browser app that updates a product safely sends PUT with If-Match, the concurrency check you will meet in the caching lesson. That method and that header must both be allowed.',
      request: {
        method: 'OPTIONS',
        path: '/v1/products/prd_01',
        headers: {
          Origin: APP,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'authorization, content-type, if-match',
        },
      },
      expect: { headers: { 'Access-Control-Allow-Methods': '~PUT', 'Access-Control-Allow-Headers': '~if-match' } },
      notice: [
        'Every method the API uses is in the list: GET, POST, PUT, PATCH and DELETE. TypeScript also lists OPTIONS, which does no harm.',
        'Six request headers are allowed, each for a feature: Authorization, Content-Type, Idempotency-Key, If-Match, If-None-Match and X-Request-Id.',
      ],
    },
    {
      kind: 'try',
      title: 'The real request, and the headers code may read',
      goal: 'After the preflight, the browser sends the real GET with the token. The answer must carry Allow-Origin again, plus the list of headers a script may read.',
      request: { method: 'GET', path: '/v1/products?limit=2', as: 'reader', headers: { Origin: APP } },
      expect: {
        status: 200,
        headers: { 'Access-Control-Allow-Origin': APP, Vary: '~Origin', 'Access-Control-Expose-Headers': '~ETag', ETag: true },
      },
      notice: [
        'The response has an ETag, but a page’s script can read it only because ETag is listed in Access-Control-Expose-Headers.',
        'The list has nine names: ETag, Link, Location, Retry-After, the three RateLimit headers, X-Request-Id and Idempotent-Replayed.',
        'Without the list, the script would see only a few basic headers, such as Content-Type and Cache-Control.',
      ],
    },
    {
      kind: 'try',
      title: 'Errors need CORS headers too',
      goal: 'Send the same call with no token. The 401 must also carry Allow-Origin, or the page could not read it.',
      request: { method: 'GET', path: '/v1/products?limit=1', headers: { Origin: APP } },
      expect: { status: 401, headers: { 'Access-Control-Allow-Origin': APP, 'WWW-Authenticate': '~Bearer' } },
      notice: [
        'Without Allow-Origin on the 401, the page would see only a CORS error, never the 401, and could not send the user to sign in again.',
        'In every stack, CORS runs outside authentication, so it adds its headers to error responses as well.',
      ],
    },
    {
      kind: 'try',
      title: 'A stranger’s preflight',
      goal: 'A page on another site asks for permission to call the API. evil.example is not in CORS_ORIGINS.',
      request: { method: 'OPTIONS', path: '/v1/products', headers: { Origin: EVIL, 'Access-Control-Request-Method': 'GET' } },
      expect: { headers: { 'Access-Control-Allow-Origin': false } },
      notice: [
        'No Access-Control-Allow-Origin, so a browser stops here and never sends the real request.',
        'The status differs by stack, and SPEC.md leaves it open: Python’s Starlette answers 400, TypeScript lets the request fall through to authentication and answers 401, and C# answers 204 with no CORS headers.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: treating CORS as a lock',
      goal: 'Now send a real request with a valid token from the stranger’s origin, the way curl or any script can.',
      request: { method: 'GET', path: '/v1/products?limit=1', as: 'reader', headers: { Origin: EVIL } },
      expect: { status: 200, headers: { 'Access-Control-Allow-Origin': false }, body: { 'data.0.id': '*' } },
      notice: [
        'The server ran the request and sent the data. Only a browser would hide it from a page on evil.example.',
        'curl, scripts and other servers ignore CORS completely. The token and its scopes are what protect this data.',
      ],
    },
    {
      kind: 'read',
      title: 'The CORS policy in each stack',
      goal: 'The same policy three ways: an origin allowlist, the methods and request headers allowed, the headers exposed, no credentials, and a 600-second max age.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/main.py',
          lines: [76, 87],
          note: 'Starlette’s CORSMiddleware gets the allowlist, the methods, the two header lists from the top of the file, allow_credentials=False and max_age=600.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/cors.ts',
          lines: [1, 29],
          note: 'Hand-written: Vary on every response, nothing for an unknown origin, a 204 for a preflight, and Expose-Headers for everything else.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Composition/ServiceRegistration.cs',
          lines: [69, 83],
          note: 'The built-in default policy: WithOrigins, WithMethods, WithHeaders, WithExposedHeaders and a 10-minute SetPreflightMaxAge.',
        },
      },
    },
    {
      kind: 'read',
      title: 'CORS runs before authentication',
      goal: 'A preflight carries no token, so it must be answered before authentication and rate limiting run. Find where each stack makes sure of that.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/auth/dependencies.py',
          lines: [28, 60],
          note: 'Authentication and rate limiting are a route dependency, so they run only inside a route, after the CORS middleware has already answered any preflight.',
        },
        node: {
          path: 'node-typescript-gcp/src/app.ts',
          lines: [66, 94],
          note: 'cors is in the first app.use with the other cross-cutting middleware; authenticate and rateLimit only run later, under /v1.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Composition/PipelineSetup.cs',
          lines: [13, 28],
          note: 'VaryOriginMiddleware and UseCors come before UseAuthentication and UseRateLimiter. The built-in CORS middleware does not add Vary: Origin for a list of origins, hence the extra one.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Why not just send the wildcard?',
      question:
        'This API uses bearer tokens, not cookies. A teammate asks: why keep an allowlist at all, instead of sending Access-Control-Allow-Origin: * to everyone?',
      answer:
        'For a truly public API with no credentials, the wildcard is fine. Browsers refuse it as soon as credentials such as cookies are involved, and for a private API an allowlist is safer, because only the sites you list can use the API from a visitor’s browser. With an allowlist, echo the matching origin and always send Vary: Origin.',
    },
    {
      kind: 'think',
      title: 'An OPTIONS before every call',
      question:
        'Your React app sends PATCH requests to /v1/products/<id> for many different products, and the network tab shows an OPTIONS before almost every one, even with Max-Age at 600. Why, and what can you do?',
      answer:
        'Every call is preflighted because it has a token and a JSON body, and the browser caches a preflight per origin and URL, so each new product id needs its own. Browsers also cap Max-Age. You can raise Max-Age for repeated URLs, or serve the app and the API from one origin, for example the API under /api on the same domain behind a reverse proxy, so there is no CORS at all.',
    },
    {
      kind: 'build',
      title: 'Allow preview deployments with an origin pattern',
      task: 'Preview deployments get a new origin for every pull request, such as https://pr-42.preview.bookshop.example, so you cannot list them one by one. Let CORS_ORIGINS hold a pattern, https://*.preview.bookshop.example, and allow every origin that matches it, and nothing else.',
      steps: [
        'Find where your stack builds the allowlist from CORS_ORIGINS: python-fastapi-aws/app/main.py, node-typescript-gcp/src/http/cors.ts or dotnet-azure/src/ApiConcepts.Api/Composition/ServiceRegistration.cs.',
        'Keep exact origins as they are. For an entry with a star, allow an origin only when it matches the whole pattern: the same scheme, a subdomain where the star is, and the rest of the host exactly.',
        'Echo the matching origin in Access-Control-Allow-Origin, exactly as you do for a listed origin. Never echo the pattern itself.',
        'Restart your server with both values, for example CORS_ORIGINS="http://localhost:5173,https://*.preview.bookshop.example" before npm run dev, dotnet run or the Python command, then press Check.',
      ],
      hints: [
        'Python: Starlette’s CORSMiddleware also takes allow_origin_regex. Build one regular expression from the patterns, escape the dots, and make it match the whole origin.',
        'C#: the policy builder has SetIsOriginAllowedToAllowWildcardSubdomains(), which lets a "*." entry in WithOrigins match subdomains.',
        'TypeScript: keep the Set for exact origins and add a small match function for patterns. Make sure https://pr-42.preview.bookshop.example.evil.com and https://evilpreview.bookshop.example do not pass.',
      ],
      check: {
        request: {
          method: 'OPTIONS',
          path: '/v1/products',
          headers: { Origin: 'https://pr-42.preview.bookshop.example', 'Access-Control-Request-Method': 'GET' },
        },
        expect: { headers: { 'Access-Control-Allow-Origin': 'https://pr-42.preview.bookshop.example' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the CORS contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure (from APIConcepts/), then restart the server without the extra CORS_ORIGINS value',
    },
  ],
};
