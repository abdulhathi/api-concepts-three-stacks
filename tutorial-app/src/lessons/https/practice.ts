import type { Practice } from '../../practice/types';

const HSTS = 'max-age=31536000; includeSubDomains';

export const practice: Practice = {
  id: 'https',
  intro:
    'Your local servers speak plain HTTP, exactly like an app behind a cloud edge. You will send the header the edge adds, X-Forwarded-Proto, watch HSTS appear and disappear, then read the code and the deployment files that put TLS at the edge.',
  steps: [
    {
      kind: 'try',
      title: 'Plain HTTP: no HSTS',
      goal: 'Call the health endpoint the way your laptop does: plain HTTP, no proxy in front. This is what the app sees when nothing says the client used HTTPS.',
      request: { method: 'GET', path: '/health' },
      expect: {
        status: 200,
        headers: { 'Strict-Transport-Security': false, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
      },
      notice: [
        'No Strict-Transport-Security header: the request did not arrive over HTTPS, so the API leaves it out.',
        'X-Content-Type-Options and Referrer-Policy are on every response, plain HTTP included.',
      ],
    },
    {
      kind: 'try',
      title: 'As if it came through the cloud edge',
      goal: 'There is no TLS locally, so send the header a cloud edge adds after it decrypts a request: X-Forwarded-Proto: https. The lab’s proxy adds no X-Forwarded headers of its own.',
      request: { method: 'GET', path: '/health', headers: { 'X-Forwarded-Proto': 'https' } },
      expect: { status: 200, headers: { 'Strict-Transport-Security': HSTS } },
      notice: [
        'Now the answer has Strict-Transport-Security: max-age is 31536000 seconds (one year), and includeSubDomains covers every subdomain.',
        'Same server, same code. Only the header changed, and that is all the app gets behind API Gateway, Cloud Run or App Service.',
      ],
    },
    {
      kind: 'try',
      title: 'The edge says the client used plain HTTP',
      goal: 'An edge that accepts plain HTTP says so with X-Forwarded-Proto: http. The app must not answer with HSTS.',
      request: { method: 'GET', path: '/health', headers: { 'X-Forwarded-Proto': 'http' } },
      expect: { status: 200, headers: { 'Strict-Transport-Security': false } },
      notice: [
        'No HSTS. RFC 6797 tells browsers to ignore it on plain HTTP, and sending it would claim a secure connection that never happened.',
        'The request still succeeds: refusing plain HTTP is a separate decision, and it is the build step at the end of this lab.',
      ],
    },
    {
      kind: 'try',
      title: 'Two proxies in a row: https, then http',
      goal: 'Behind several proxies, each hop may append the scheme it saw. Here the edge saw https from the client, and the next hop saw plain http from the edge.',
      request: { method: 'GET', path: '/health', headers: { 'X-Forwarded-Proto': 'https, http' } },
      expect: { status: 200, headers: { 'Strict-Transport-Security': HSTS } },
      notice: [
        'HSTS is sent. The API reads only the first value: the scheme the client used to reach the first proxy, as long as that proxy replaced any value the client sent.',
        'The plain http of the private hop behind the edge does not matter to the browser.',
      ],
    },
    {
      kind: 'try',
      title: 'The other order: http, then https',
      goal: 'Swap the values. Now the client reached the first proxy over plain HTTP, even though a later hop used TLS.',
      request: { method: 'GET', path: '/health', headers: { 'X-Forwarded-Proto': 'http, https' } },
      expect: { status: 200, headers: { 'Strict-Transport-Security': false } },
      notice: [
        'No HSTS: the first value is http, and that is the hop the browser was on.',
        'All three stacks split on commas, take the first value, trim it and compare it with https, ignoring case.',
      ],
    },
    {
      kind: 'try',
      title: 'Errors get HSTS too',
      goal: 'Call a protected endpoint with no token, as if through the edge. Security headers belong on every response, not only on successes.',
      request: { method: 'GET', path: '/v1/products?limit=1', headers: { 'X-Forwarded-Proto': 'https' } },
      expect: { status: 401, headers: { 'Strict-Transport-Security': HSTS, 'WWW-Authenticate': '~Bearer' } },
      notice: [
        'A 401 still carries Strict-Transport-Security. A browser learns the rule from whatever HTTPS response it gets.',
        'Each stack adds the header in a middleware that wraps every route, so even errors from the framework itself get it.',
      ],
    },
    {
      kind: 'try',
      title: 'What TLS is protecting: a token',
      goal: 'Ask the token endpoint for a reader token, as if through the edge. The body of this response is a bearer token: anyone who copies it can use it until it expires.',
      request: {
        method: 'POST',
        path: '/oauth/token',
        basic: ['reader', 'reader-secret'],
        form: { grant_type: 'client_credentials' },
        headers: { 'X-Forwarded-Proto': 'https' },
      },
      expect: {
        status: 200,
        headers: { 'Strict-Transport-Security': HSTS, 'Cache-Control': 'no-store' },
        body: { access_token: '*', token_type: 'Bearer' },
      },
      notice: [
        'The request carried the client secret in its Authorization header, and the answer carries a token. On plain HTTP, both would cross the network in readable text.',
        'Over real HTTPS, all of it is encrypted: the path, every header and the body.',
        'Cache-Control: no-store keeps the token out of every cache on the way.',
      ],
    },
    {
      kind: 'read',
      title: 'Did the request arrive over HTTPS?',
      goal: 'Each stack has one small check: a real TLS connection, or a first X-Forwarded-Proto value of https. Only then does it add HSTS.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/middleware.py',
          lines: [37, 75],
          note: '_is_https checks the ASGI scheme and the first forwarded value; send_with_context adds HSTS as the response starts, so errors get it too.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/securityHeaders.ts',
          lines: [1, 16],
          note: 'arrivedOverHttps reads the first X-Forwarded-Proto value, then checks whether the socket is encrypted; securityHeaders sets HSTS only when it is true.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Http/SecurityHeadersMiddleware.cs',
          lines: [1, 30],
          note: 'OnStarting sets the headers just before the response is sent; Request.IsHttps covers a direct TLS connection, the header covers App Service.',
        },
      },
    },
    {
      kind: 'read',
      title: 'TLS ends at the edge: the deployment',
      goal: 'None of the apps holds a certificate. The deployment puts each one behind an edge that ends TLS and tells the app with X-Forwarded-Proto.',
      files: {
        python: {
          path: 'python-fastapi-aws/infra/aws/README.md',
          lines: [1, 11],
          note: 'The HttpApi row: API Gateway is the public HTTPS endpoint, ends TLS, and sends X-Forwarded-Proto: https to the function.',
        },
        node: {
          path: 'node-typescript-gcp/README.md',
          lines: [109, 113],
          note: 'The app listens for plain HTTP on PORT; Cloud Run ends TLS and forwards X-Forwarded-Proto: https.',
        },
        dotnet: {
          path: 'dotnet-azure/infra/azure/main.bicep',
          lines: [77, 94],
          note: 'httpsOnly: true and minTlsVersion 1.2 on the Web App: the App Service front end redirects plain HTTP and refuses older TLS versions.',
        },
      },
    },
    {
      kind: 'think',
      title: 'HSTS on every response, to be safe?',
      question:
        'A teammate wants the API to send Strict-Transport-Security on every response, plain HTTP included, because more security headers must be better. What do you tell them?',
      answer:
        'It protects nobody: RFC 6797 tells browsers to ignore HSTS that arrives over plain HTTP, because anyone on the path could add or strip it there. It also misleads anyone reading the response into thinking the connection was secure. Fix plain HTTP itself, by redirecting or refusing it at the edge, and send HSTS only on HTTPS responses.',
    },
    {
      kind: 'think',
      title: 'When can you believe X-Forwarded-Proto?',
      question:
        'In this lab you faked X-Forwarded-Proto from your own browser. In production, when is it safe to believe that header, and what changes if the app makes a security decision based on it?',
      answer:
        'Believe it only when your own edge sets it and clients cannot reach the app any other way, as with API Gateway, Cloud Run and App Service. In this API a fake value only adds HSTS to the faker’s own response, so it is harmless. If the header decides something that matters, such as refusing plain HTTP, make sure the edge overwrites any value the client sent, and keep the app reachable only from the edge.',
    },
    {
      kind: 'build',
      title: 'Refuse plain HTTP with a 403',
      task: 'A website redirects plain HTTP to HTTPS. An API should refuse it instead: by the time a redirect arrives, the token has already crossed the network in plain text, and a client that follows redirects never learns it has a bug. When the edge says the client used plain HTTP, answer 403 with a new problem type, https-required.',
      steps: [
        'Add the slug https-required, with status 403 and a title such as "HTTPS is required", to the problem list in your stack: python-fastapi-aws/app/web/problems.py, node-typescript-gcp/src/http/problem.ts or dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs.',
        'Next to the HSTS check, read the first X-Forwarded-Proto value the same way: python-fastapi-aws/app/web/middleware.py, node-typescript-gcp/src/http/securityHeaders.ts or dotnet-azure/src/ApiConcepts.Api/Http/SecurityHeadersMiddleware.cs.',
        'When that value is http, stop the request and answer with the 403 problem. When the header is missing, change nothing: that is local development, and it is how the contract tests call the API.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it sends a reader request with X-Forwarded-Proto: http and expects 403 https-required.',
      ],
      hints: [
        'Reuse the parsing from the HSTS helper: split on commas, take the first value, trim it and lowercase it.',
        'Answer from the middleware, before any route runs. In Python, the ASGI middleware can send problem_response itself; in TypeScript, call next with an ApiProblem; in C#, use ProblemWriter instead of calling next.',
        'Do not reach for ASP.NET Core’s UseHttpsRedirection here. It redirects instead of refusing, and it looks at the connection, which is plain HTTP for every local request.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/products?limit=1', as: 'reader', headers: { 'X-Forwarded-Proto': 'http' } },
        expect: { status: 403, body: { type: '/problems/https-required' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: requests without X-Forwarded-Proto must behave as before',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
