import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'headers',
  intro:
    'You will send requests with chosen headers and read the headers that come back: the content type rules and their 415, a request id that follows one call, the Location of something you create, and the security headers on every response.',
  steps: [
    {
      kind: 'try',
      title: 'Headers travel next to the body',
      goal: 'The echo endpoint sends back what the server received. Send a small JSON body with Content-Type and Accept, and see the headers and the body arrive apart.',
      request: { method: 'POST', path: '/v1/echo', as: 'reader', headers: { Accept: 'application/json' }, json: { title: 'Desk Lamp' } },
      expect: {
        status: 200,
        headers: { 'Content-Type': '~application/json' },
        body: {
          'headers.content-type': '~application/json',
          'headers.accept': 'application/json',
          'headers.authorization': 'Bearer ***',
          'body.title': 'Desk Lamp',
        },
      },
      notice: [
        'The echoed headers have lower case names: header names are not case sensitive, so the echo lower-cases every name.',
        'The body is a separate field. Headers describe the message; the body is the data.',
        'Authorization is masked as Bearer ***. A server should never send a token back or write it to a log.',
      ],
    },
    {
      kind: 'try',
      title: 'A charset parameter is still JSON',
      goal: 'Many clients send Content-Type: application/json; charset=utf-8. The media type is still JSON, so the server must accept it.',
      request: {
        method: 'POST',
        path: '/v1/echo',
        as: 'reader',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        json: { title: 'Desk Lamp' },
      },
      expect: { status: 200, body: { 'headers.content-type': 'application/json; charset=utf-8', 'body.title': 'Desk Lamp' } },
      notice: [
        'Accepted: the server compares the media type and ignores parameters such as charset.',
        'A check that compares the whole string would reject this by mistake.',
      ],
    },
    {
      kind: 'try',
      title: 'A form body gets 415',
      goal: 'Post the same data the way an HTML form does, as application/x-www-form-urlencoded. Bodies under /v1 must be JSON.',
      request: { method: 'POST', path: '/v1/echo', as: 'reader', form: { title: 'Desk Lamp' } },
      expect: { status: 415, headers: { 'Content-Type': '~application/problem+json' }, body: { type: '/problems/unsupported-media-type' } },
      notice: [
        '415 Unsupported Media Type: the server refused to parse a body that is not labeled JSON.',
        'The error is problem details, and its own Content-Type says so: application/problem+json.',
      ],
    },
    {
      kind: 'try',
      title: 'The same rule on a real write',
      goal: 'The rule is not only on echo. Try to create a product with a plain text body.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', headers: { 'Content-Type': 'text/plain' }, raw: 'Desk Lamp' },
      expect: { status: 415, body: { type: '/problems/unsupported-media-type', instance: '/v1/products' } },
      notice: [
        'Every POST, PUT and PATCH under /v1 runs the same check, before the route parses anything.',
        'No product was created. A browser page on another site may send text/plain without a CORS preflight, so refusing it is also a defense.',
      ],
    },
    {
      kind: 'try',
      title: 'Accept asks for a format',
      goal: 'Ask for a product as CSV with Accept: text/csv. This API can only make JSON. What does it do?',
      request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader', headers: { Accept: 'text/csv' } },
      expect: { status: 200, headers: { 'Content-Type': '~application/json' }, body: { id: 'prd_01' } },
      notice: [
        'It ignores Accept and answers JSON, with Content-Type saying so.',
        'RFC 9110 allows that, or a 406 Not Acceptable. The build step at the end adds the 406.',
      ],
    },
    {
      kind: 'try',
      title: 'Your own request id comes back',
      goal: 'Name this request with X-Request-Id. The value matches the safe pattern, so the server keeps it.',
      request: { method: 'GET', path: '/health', headers: { 'X-Request-Id': 'lab-trace-42' } },
      expect: { status: 200, headers: { 'X-Request-Id': 'lab-trace-42' } },
      notice: [
        'The same id is echoed, and the server wrote it on its log line for this request.',
        'Allowed: letters, digits, dot, underscore and hyphen, 1 to 128 characters.',
      ],
    },
    {
      kind: 'try',
      title: 'A bad request id is replaced',
      goal: 'Send an id with a space and a symbol in it. The server must not trust it.',
      request: { method: 'GET', path: '/health', headers: { 'X-Request-Id': 'bad id!' } },
      expect: { status: 200, headers: { 'X-Request-Id': '~-' } },
      notice: [
        'The answer carries a fresh UUID instead, such as 3f0c9a1e-7b2d-4c55-9a41-…, not bad id!. (The check looks for the hyphens a UUID has.)',
        'A request id ends up in logs and responses, so the server checks its shape before it uses it.',
      ],
    },
    {
      kind: 'try',
      title: 'Errors carry the id too',
      goal: 'Ask for a product that does not exist, with your own id. Errors are when you need the id most.',
      request: { method: 'GET', path: '/v1/products/prd_nope', as: 'reader', headers: { 'X-Request-Id': 'lab-trace-404' } },
      expect: { status: 404, headers: { 'X-Request-Id': 'lab-trace-404' }, body: { type: '/problems/not-found', requestId: 'lab-trace-404' } },
      notice: [
        'The header and the problem body’s requestId are the same value.',
        'An app can show that id to the user, and support can search every log for it.',
      ],
    },
    {
      kind: 'try',
      title: 'Location points at what you created',
      goal: 'Create a product. The 201 says where the new product lives, in the Location header.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        json: { title: 'Headers in Practice', author: 'You', priceCents: 1200, tags: ['headers-lab'] },
      },
      expect: { status: 201, headers: { Location: '~/v1/products/prd_', ETag: '~-v1' }, body: { id: '*' } },
      save: { NEW_ID: 'body.id' },
      notice: [
        'Location is /v1/products/ followed by the new id. The client follows it instead of building the path itself.',
        'The ETag names the first version of the new product. The lab saved the id for the next step.',
      ],
    },
    {
      kind: 'try',
      title: 'Follow the Location',
      goal: 'Read the product at the path the 201 gave you.',
      request: { method: 'GET', path: '/v1/products/{{NEW_ID}}', as: 'reader' },
      expect: {
        status: 200,
        headers: { ETag: '"{{NEW_ID}}-v1"', 'Cache-Control': 'private, max-age=60' },
        body: { id: '{{NEW_ID}}', title: 'Headers in Practice' },
      },
      notice: [
        'The same product, and the same ETag the 201 sent.',
        'Cache-Control is another response header: it tells caches how long they may keep this answer (lesson 19).',
      ],
    },
    {
      kind: 'try',
      title: 'Security headers, even on a 404',
      goal: 'Ask for a route that does not exist, with no token. Even this error must carry the security headers.',
      request: { method: 'GET', path: '/no/such/route' },
      expect: {
        status: 404,
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Request-Id': true,
          'Strict-Transport-Security': false,
        },
        body: { type: '/problems/not-found' },
      },
      notice: [
        'nosniff tells a browser to trust Content-Type and not guess a type from the bytes. no-referrer keeps the page address out of the Referer header.',
        'They are on a 404 because one outer layer adds them to every response, not each route.',
        'No Strict-Transport-Security: this request came over plain HTTP, and HSTS is sent only over HTTPS (lesson 14).',
      ],
    },
    {
      kind: 'read',
      title: 'The layer that stamps every response',
      goal: 'Each stack sets the request id first, before any route, and makes sure it lands on every response, errors included.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/middleware.py',
          lines: [53, 80],
          note: 'RequestContext picks the id with _request_id, then wraps send, so every response start, errors included, gets X-Request-Id, nosniff and Referrer-Policy.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/requestContext.ts',
          lines: [19, 25],
          note: 'requestId is the first middleware in app.ts, so the header is set before any route or error handler runs; securityHeaders.ts sets the other two the same way.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Http/RequestIdMiddleware.cs',
          lines: [13, 26],
          note: 'The header is set in OnStarting, just before the response goes out, because the exception handler clears headers before it writes an error.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The 415 check',
      goal: 'Each stack reads Content-Type before it parses the body, compares only the media type, and allows merge patch for PATCH.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/body.py',
          lines: [21, 38],
          note: 'read_json drops everything after the semicolon, lower-cases the media type, and allows merge patch only for PATCH, all before json.loads runs.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/body.ts',
          lines: [5, 20],
          note: 'One regular expression allows JSON or merge patch JSON with any parameters, and merge patch only on PATCH; it runs before the raw body is read.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Http/JsonBodyFilter.cs',
          lines: [11, 37],
          note: 'An endpoint filter on the v1 group parses Content-Type with MediaTypeHeaderValue, so a charset parameter never causes a 415.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Why check a request id at all?',
      question:
        'This API echoes a client’s X-Request-Id only if it matches ^[A-Za-z0-9._-]{1,128}$. Why not echo whatever the client sends?',
      answer:
        'The id is written into log lines and sent back in a header and in problem bodies. An unchecked value can be huge, can break the log format so one request looks like several, or can carry script that runs in a careless web log viewer. A short allowlist of safe characters keeps the convenience of client ids without trusting the client.',
    },
    {
      kind: 'think',
      title: 'A partner wants text/plain',
      question:
        'A partner asks you to accept product bodies sent as text/plain, because their tool does not set headers. Why does this API say no, and what would you offer instead?',
      answer:
        'Without a reliable Content-Type the server has to guess how to parse the body, and guessing is where parser bugs and confusion attacks start. It is also a browser defense: a page on another site can send text/plain without a CORS preflight, but not a body labeled application/json. Offer a short example in curl and in their language that sets Content-Type: application/json, which every HTTP tool can do.',
    },
    {
      kind: 'build',
      title: 'Answer 406 when Accept rules out JSON',
      task: 'Today the API ignores Accept. Make every /v1 route answer 406 Not Acceptable, as a not-acceptable problem, when the Accept header allows no form of JSON. A missing Accept, */*, application/* and application/json (with any parameters) must keep working.',
      steps: [
        'Add a not-acceptable problem with status 406 to the catalog: python-fastapi-aws/app/web/problems.py, node-typescript-gcp/src/http/problem.ts, or dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs.',
        'Write a small function that reads Accept and says whether JSON is acceptable: split on commas, drop parameters, read q, and match application/json, application/* or */*.',
        'Run it for every /v1 request before the route. Python: a check registered in app/main.py inside RequestContext, so the 406 still gets a request id. TypeScript: a middleware in front of the /v1 router in src/app.ts. C#: an endpoint filter like Http/JsonBodyFilter.cs, added to the v1 group in Composition/PipelineSetup.cs.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it asks for a product as text/csv.',
      ],
      hints: [
        'A request with no Accept header accepts anything. So does */*.',
        'q=0 means "not this one": application/json;q=0, text/csv is a request that rules JSON out.',
        'Leave /docs, /openapi.json and /graphql alone: the docs page serves HTML, and GraphQL has its own Accept rule in SPEC.md.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/products/prd_01', as: 'reader', headers: { Accept: 'text/csv' } },
        expect: { status: 406 },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
