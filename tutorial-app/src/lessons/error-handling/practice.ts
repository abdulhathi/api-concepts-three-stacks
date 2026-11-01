import type { Practice } from '../../practice/types';

const PROBLEM_JSON = '~application/problem+json';

export const practice: Practice = {
  id: 'error-handling',
  intro:
    'You will cause errors on purpose: bad input, broken JSON, the wrong content type, an unknown route, a missing token and a crash. Each one should come back in the same problem details shape, carrying a request id that you chose.',
  vars: { RID_1: 'uuid', RID_2: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'A validation error, with your own request id',
      goal: 'Ask for a page of zero products, and send an X-Request-Id of your own. The answer is a problem details body, and your id comes back in two places.',
      request: { method: 'GET', path: '/v1/products?limit=0', as: 'reader', headers: { 'X-Request-Id': '{{RID_1}}' } },
      expect: {
        status: 400,
        headers: { 'Content-Type': PROBLEM_JSON, 'X-Request-Id': '{{RID_1}}' },
        body: {
          type: '/problems/validation-error',
          title: '*',
          status: 400,
          detail: '*',
          instance: '/v1/products',
          requestId: '{{RID_1}}',
          'errors.0.field': 'limit',
        },
      },
      notice: [
        'The five standard members: type, title, status, detail and instance. type is the one a client branches on.',
        'instance is /v1/products, without ?limit=0: query strings can carry data that should not be echoed back.',
        'requestId in the body equals the X-Request-Id header, and both are the id you sent. The wording of detail differs between the stacks; type, title and status do not.',
      ],
    },
    {
      kind: 'try',
      title: 'Field errors: every bad field at once',
      goal: 'Create a product with an empty title and a negative price. A form needs to know about both mistakes, not just the first.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', json: { title: '', author: 'You', priceCents: -5 } },
      expect: {
        status: 400,
        body: { type: '/problems/validation-error', 'errors.length': 2, 'errors.0.field': 'title', 'errors.1.field': 'priceCents' },
      },
      notice: [
        'errors is an extension member: RFC 9457 lets an API add its own members. Each entry has a field and a message.',
        'A form can put each message next to its own input box. Only validation-error carries errors; every other problem leaves it out.',
      ],
    },
    {
      kind: 'try',
      title: 'Same status, different type: broken JSON',
      goal: 'Send a body that is not JSON at all: it stops in the middle. The status is 400 again, but the type tells the client what kind of 400 it is.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', headers: { 'Content-Type': 'application/json' }, raw: '{"title": "Errors Worth Reading",' },
      expect: { status: 400, headers: { 'Content-Type': PROBLEM_JSON }, body: { type: '/problems/malformed-json', status: 400 } },
      notice: [
        'validation-error means the JSON parsed but broke a rule. malformed-json means it could not be parsed at all. Same status, different fix.',
        'That is why clients branch on type, not only on status.',
      ],
    },
    {
      kind: 'try',
      title: 'The wrong content type',
      goal: 'Send the body as plain text. The API only reads JSON, and says so with a 415 in the same shape.',
      request: { method: 'POST', path: '/v1/products', as: 'writer', headers: { 'Content-Type': 'text/plain' }, raw: 'title=Errors Worth Reading' },
      expect: { status: 415, headers: { 'Content-Type': PROBLEM_JSON }, body: { type: '/problems/unsupported-media-type', status: 415 } },
      notice: ['415 Unsupported Media Type is checked before the body is parsed, so the server never tries to read text as JSON.'],
    },
    {
      kind: 'try',
      title: 'An unknown route',
      goal: 'No handler exists for this path. The framework itself answers, and the API makes sure that answer has the same shape as every other error.',
      request: { method: 'GET', path: '/v1/no-such-thing', as: 'reader' },
      expect: { status: 404, headers: { 'Content-Type': PROBLEM_JSON }, body: { type: '/problems/not-found', status: 404, instance: '/v1/no-such-thing' } },
      notice: [
        'Without care, a framework answers an unknown route with an HTML page or an empty body. Here it is problem+json like everything else.',
        'not-found is also what an unknown product id or another client’s order gets: one type for "there is nothing here for you".',
      ],
    },
    {
      kind: 'try',
      title: 'No token: a 401 in the same shape',
      goal: 'Call a protected endpoint without a token. Authentication fails before any handler runs, and the answer is still problem details.',
      request: { method: 'GET', path: '/v1/products' },
      expect: {
        status: 401,
        headers: { 'Content-Type': PROBLEM_JSON, 'WWW-Authenticate': '~Bearer realm="api-concepts"' },
        body: { type: '/problems/unauthorized', status: 401 },
      },
      notice: [
        'Errors from the auth layer, from validation, from the router and from handlers all share one shape.',
        'A 401 also sends WWW-Authenticate, which tells the client how to authenticate: with a Bearer token.',
      ],
    },
    {
      kind: 'try',
      title: 'A crash: a 500 that leaks nothing',
      goal: 'This demo endpoint throws an unhandled exception on purpose, with a message that must never reach the client. Send your own request id again, then find it in your server’s terminal.',
      request: { method: 'GET', path: '/v1/demo/crash', as: 'reader', headers: { 'X-Request-Id': '{{RID_2}}' } },
      expect: {
        status: 500,
        headers: { 'Content-Type': PROBLEM_JSON, 'X-Request-Id': '{{RID_2}}' },
        body: { type: '/problems/internal-error', status: 500, detail: 'An unexpected error occurred.', instance: '/v1/demo/crash', requestId: '{{RID_2}}' },
      },
      notice: [
        'detail is exactly "An unexpected error occurred.": no exception message, no stack trace, no file names.',
        'Search your server’s output for this request id. The access log line for the 500 has it, and next to it is the full exception: the details exist, but only where your team can see them.',
      ],
    },
    {
      kind: 'try',
      title: 'The one exception: the OAuth token endpoint',
      goal: 'Ask for a token with the wrong client secret. The token endpoint answers in the format the OAuth standard requires, not in problem details.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'wrong-secret'], form: { grant_type: 'client_credentials' } },
      expect: { status: 401, headers: { 'Content-Type': '~application/json' }, body: { error: 'invalid_client' } },
      notice: [
        'RFC 6749 says token errors are JSON with error and error_description, so OAuth client libraries can read them. This API follows that, and documents the exception.',
        'Content-Type is application/json, not application/problem+json.',
      ],
    },
    {
      kind: 'read',
      title: 'One function builds every problem',
      goal: 'Each stack has a single place that turns a problem into the response body, so the shape can never drift between endpoints.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/problems.py',
          lines: [40, 76],
          note: 'Problem looks up its status and title by slug; problem_response adds instance from the path and requestId from the request state.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/problem.ts',
          lines: [50, 81],
          note: 'ApiProblem carries a slug from a closed union type, so a typo is a compile error; sendProblem strips the query string for instance.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Common/ProblemWriter.cs',
          lines: [11, 42],
          note: 'It fills ASP.NET Core’s own ProblemDetails class and adds requestId and errors as extension members.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The safety net for everything else',
      goal: 'Expected errors are raised as problems. Everything else is caught at the edge, logged in full, and turned into the fixed 500.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/web/middleware.py',
          lines: [101, 136],
          note: 'CrashGuard wraps the app; it logs the exception with requestId=<id> in the message, then sends the fixed 500, unless the response had already started.',
        },
        node: {
          path: 'node-typescript-gcp/src/http/errors.ts',
          lines: [6, 32],
          note: 'notFoundHandler covers unknown routes; the four-argument error middleware renders ApiProblem and logs anything else with the request id.',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Common/ApiExceptionHandler.cs',
          lines: [6, 20],
          note: 'An IExceptionHandler: ProblemException becomes its own problem, anything else is logged with the request id and becomes internal-error.',
        },
      },
    },
    {
      kind: 'think',
      title: 'Branching on detail',
      question:
        'A mobile app shows "Product not found" whenever the error’s detail contains the words "not found". Then the API team rewords its messages. What breaks, and what should the app do instead?',
      answer:
        'The app silently stops recognizing the error, because detail is text for humans and can change at any time. You can see it here: the three stacks word detail differently for the same problem, and the contract tests check type, title and status, never detail. The app should branch on status and type, and keep its own user-facing text keyed by type.',
    },
    {
      kind: 'think',
      title: 'Errors your code never sees',
      question:
        'In production, an API gateway sits in front of this API. It answers some requests itself: a 429 when its own limit is hit, a 504 when the API is too slow. What shape do those errors have, and what would you do about it?',
      answer:
        'They come in the gateway’s own format, so clients are back to parsing two shapes, and those errors have no requestId from your API. Configure the gateway’s error responses to send problem+json with the same members: API Gateway lets you customize its gateway responses, and Azure API Management has an on-error policy section. Also have the gateway pass a request id through, so its errors can be found in the logs too.',
    },
    {
      kind: 'build',
      title: 'Add a 413 problem for bodies that are too large',
      task: 'The stacks disagree about huge bodies: TypeScript answers 400 validation-error above 256 KB, and the other two accept far larger bodies. Make all three answer 413 with a new problem type, payload-too-large, for JSON bodies over 256 KB.',
      steps: [
        'Add the type: payload-too-large, status 413, title "The request body is too large". Python: the slug table in python-fastapi-aws/app/web/problems.py. TypeScript: ProblemSlug and CATALOG in node-typescript-gcp/src/http/problem.ts. C#: ProblemType in dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs (and 413 in FromStatus).',
        'Enforce one limit, 256 KB, where each stack reads a JSON body: read_json in python-fastapi-aws/app/web/body.py, ReadRawAsync in dotnet-azure/src/ApiConcepts.Api/Common/JsonBody.cs. TypeScript already stops at 256 KB; change how node-typescript-gcp/src/http/errors.ts maps body-parser’s entity.too.large.',
        'Raise the problem and let the existing error handler render it. You should not need a new handler.',
        'Restart your server (TypeScript reloads by itself under npm run dev), then press Check: it posts a 300 KB JSON body to the echo endpoint and expects 413 payload-too-large.',
      ],
      hints: [
        'Checking Content-Length first is cheap, but a chunked body has no Content-Length, so also count the bytes as you read them.',
        'Kestrel’s own default body limit is far larger than 256 KB, so in C# you enforce this one yourself, where the body is read.',
        'Once the error is a problem with its own type, clients can tell "too big" apart from "a field is wrong" without reading any text.',
      ],
      check: {
        request: { method: 'POST', path: '/v1/echo', as: 'reader', json: { note: 'x'.repeat(300_000) } },
        expect: { status: 413, body: { type: '/problems/payload-too-large', status: 413 } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
