import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'status-codes',
  intro:
    'You will make the Bookshop API send 13 different status codes on purpose: one book’s life from 201 to 404, every way a request can be refused, two server failures and a retry. Then you will add a 409 of your own.',
  vars: { RUN: 'uuid', KEY: 'uuid', FLAKY: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: '201 Created: add a book',
      goal: 'A POST that makes something new answers 201, not 200, and says where the new thing lives.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        json: { title: 'Status Codes in Practice', author: 'Lab run {{RUN}}', priceCents: 1999 },
      },
      expect: { status: 201, headers: { Location: '~/v1/products/prd_', ETag: '~-v1' }, body: { version: 1, priceCents: 1999 } },
      save: { PRODUCT_ID: 'body.id', ETAG: 'header.etag' },
      notice: [
        '201 means a new resource now exists. The Location header points at it, so the client never builds the URL itself.',
        'The ETag ends in -v1: version 1 of this book. The lab saved the id and the ETag for the next steps.',
      ],
    },
    {
      kind: 'try',
      title: '304 Not Modified: read it again with its ETag',
      goal: 'Send the ETag back in If-None-Match. If the book has not changed, the server sends no body at all.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'reader', headers: { 'If-None-Match': '{{ETAG}}' } },
      expect: { status: 304, empty: true, headers: { ETag: '{{ETAG}}' } },
      notice: [
        'No body: the copy the client already has is still current, so only headers travel.',
        '304 is in the 3xx class because it redirects the client to its own stored copy. Without If-None-Match, the same GET is a 200 with the whole book.',
      ],
    },
    {
      kind: 'try',
      title: '200 OK: change the price',
      goal: 'A PATCH that worked and returns the updated resource answers 200. If-Match says: only change it if it is still the version I read.',
      request: {
        method: 'PATCH',
        path: '/v1/products/{{PRODUCT_ID}}',
        as: 'writer',
        headers: { 'If-Match': '{{ETAG}}' },
        json: { priceCents: 2499 },
      },
      expect: { status: 200, headers: { ETag: '~-v2' }, body: { priceCents: 2499, version: 2 } },
      notice: [
        '200, because there is a body to return: the updated book.',
        'The version and the ETag moved to 2. The lab still holds the old v1 ETag, which the next step uses on purpose.',
      ],
    },
    {
      kind: 'try',
      title: '412 Precondition Failed: change it with the old ETag',
      goal: 'Send another change with If-Match still set to version 1, the way a second user with an old copy would.',
      request: {
        method: 'PATCH',
        path: '/v1/products/{{PRODUCT_ID}}',
        as: 'writer',
        headers: { 'If-Match': '{{ETAG}}' },
        json: { priceCents: 2999 },
      },
      expect: { status: 412, headers: { 'Content-Type': '~application/problem+json' }, body: { type: '/problems/precondition-failed', status: 412 } },
      notice: [
        'The condition in If-Match was false: the book is at version 2 now, so nothing was changed.',
        'The fix is not a blind retry: read the book again, reapply the change, and send the new ETag.',
      ],
    },
    {
      kind: 'try',
      title: '204 No Content: delete it',
      goal: 'A delete that worked has nothing to send back, so the answer is 204 with an empty body. Deleting needs the admin scope.',
      request: { method: 'DELETE', path: '/v1/products/{{PRODUCT_ID}}', as: 'admin' },
      expect: { status: 204, empty: true },
      notice: [
        'Success with no body. A 204 is not allowed to carry one.',
        'The same DELETE as writer would get 403: writer has products:write, but deleting needs admin.',
      ],
    },
    {
      kind: 'try',
      title: '404 Not Found: read the deleted book',
      goal: 'The URL is the same as in step 2, but nothing lives there now.',
      request: { method: 'GET', path: '/v1/products/{{PRODUCT_ID}}', as: 'reader' },
      expect: { status: 404, body: { type: '/problems/not-found', status: 404 } },
      notice: [
        'The body is problem details: the type slug is for code, the title and detail are for people.',
        'This API also answers 404 for an unknown route, and for another client’s order, so nobody can probe which order ids exist.',
      ],
    },
    {
      kind: 'try',
      title: '401 Unauthorized: no token',
      goal: 'List the products without an Authorization header. The API does not know who is asking.',
      request: { method: 'GET', path: '/v1/products' },
      expect: { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="api-concepts"' }, body: { type: '/problems/unauthorized' } },
      notice: [
        '401 means “who are you?”, and it must carry WWW-Authenticate, which says how to authenticate: a Bearer token.',
        'A token that was sent but rejected (expired, or a bad signature) gets the same 401 with error="invalid_token" added.',
      ],
    },
    {
      kind: 'try',
      title: '403 Forbidden: a valid token without the scope',
      goal: 'Create a book as reader. The token is valid, but reader only has products:read and orders:read.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'reader',
        json: { title: 'Not Allowed', author: 'Reader', priceCents: 100 },
      },
      expect: {
        status: 403,
        headers: { 'WWW-Authenticate': 'Bearer realm="api-concepts", error="insufficient_scope", scope="products:write"' },
        body: { type: '/problems/forbidden' },
      },
      notice: [
        'The API knows exactly who is asking, and the answer is still no. A new token for reader would not help.',
        'The challenge names the scope that was missing: products:write. Compare it with the 401 in the step before.',
      ],
    },
    {
      kind: 'try',
      title: '415 Unsupported Media Type: send plain text',
      goal: 'Send a body as text/plain. The server only reads JSON on POST, PUT and PATCH, so it refuses before it looks at the content.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        headers: { 'Content-Type': 'text/plain' },
        raw: 'title=Plain Text&author=You&priceCents=100',
      },
      expect: { status: 415, body: { type: '/problems/unsupported-media-type', status: 415 } },
      notice: [
        '415 is about the format named in Content-Type, not about the fields: fix it by sending application/json.',
        'The scope check runs first. The same text/plain request from reader gets 403, not 415.',
      ],
    },
    {
      kind: 'try',
      title: '400 Bad Request: an invalid body',
      goal: 'Send real JSON that breaks the schema: a price below zero.',
      request: {
        method: 'POST',
        path: '/v1/products',
        as: 'writer',
        json: { title: 'Free Book', author: 'You', priceCents: -100 },
      },
      expect: { status: 400, body: { type: '/problems/validation-error', 'errors.0.field': 'priceCents' } },
      notice: [
        'errors lists each field that failed, so a client can show the message next to the right input.',
        'The message text differs per stack, but the field and the type slug are the same in all three.',
        'FastAPI’s own default for a schema failure is 422. The Python stack changes it to 400, as SPEC.md asks.',
      ],
    },
    {
      kind: 'try',
      title: '422 Unprocessable Content: a valid order for a missing book',
      goal: 'Order a product that does not exist. The JSON is well formed and passes the schema; the problem is what it asks for.',
      request: {
        method: 'POST',
        path: '/v1/orders',
        as: 'writer',
        headers: { 'Idempotency-Key': '{{KEY}}' },
        json: { items: [{ productId: 'prd_99', quantity: 1 }] },
      },
      expect: { status: 422, body: { type: '/problems/unknown-product', status: 422 } },
      notice: [
        'Compare it with step 6. There the URL pointed at nothing, so 404. Here the URL is fine, and the body names something missing, so 422.',
        'Look at the status line in the curl output: Python says Unprocessable Content (the RFC 9110 name), TypeScript and C# say Unprocessable Entity. Code reads only the number.',
      ],
    },
    {
      kind: 'try',
      title: '500 Internal Server Error: a bug',
      goal: 'The crash demo endpoint throws an exception on purpose. See what the client is allowed to learn about it.',
      request: { method: 'GET', path: '/v1/demo/crash', as: 'reader' },
      expect: { status: 500, body: { type: '/problems/internal-error', detail: 'An unexpected error occurred.', requestId: '*' } },
      notice: [
        'The detail is the same fixed sentence on every stack: the exception message and stack trace never leave the server.',
        'requestId equals the X-Request-Id header. The server logged the real error with that id, so a bug report only needs the id.',
      ],
    },
    {
      kind: 'try',
      title: '503 Service Unavailable: down for a moment',
      goal: 'The flaky demo endpoint fails the first failTimes calls for each key on purpose. With failTimes=1, the first call fails.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{FLAKY}}&failTimes=1', as: 'reader' },
      expect: { status: 503, headers: { 'Retry-After': false }, body: { type: '/problems/service-unavailable', status: 503 } },
      notice: [
        'A 5xx: the request was fine, the server could not answer it right now. This is a code worth retrying.',
        'This demo sends no Retry-After, so the client picks its own delay. The report endpoint’s 503 throttled sends Retry-After: 1.',
      ],
    },
    {
      kind: 'try',
      title: '200 OK after a retry',
      goal: 'Do what a good client does after a 503: wait a moment and send the very same request again.',
      request: { method: 'GET', path: '/v1/demo/flaky?key={{FLAKY}}&failTimes=1', as: 'reader' },
      expect: { status: 200, body: { key: '{{FLAKY}}', attempts: 2 } },
      notice: [
        'attempts is 2: the server counts calls per key, and the second one got through.',
        'A retry fixed the 503. Sending step 10 or 11 again would never work: a 4xx needs a changed request.',
        'The server remembers the calls for this key, so steps 13 and 14 give these answers again only after you press New values.',
      ],
    },
    {
      kind: 'read',
      title: 'One catalog: every problem slug has one status',
      goal: 'No route types a status code by hand. Each stack keeps one table from problem slug to status and title, and every error goes through it.',
      files: {
        python: { path: 'python-fastapi-aws/app/web/problems.py', lines: [11, 32], note: 'A dict from slug to (status, title). Problem, just below, looks the slug up, so an unknown slug fails the first time it is raised.' },
        node: { path: 'node-typescript-gcp/src/http/problem.ts', lines: [4, 43], note: 'The slugs are a union type, and the record must have every one, so a missing or unknown slug does not compile.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs', lines: [4, 35], note: 'One static record per problem type; FromStatus maps the bare codes the framework makes itself, like a 405 from routing.' },
      },
    },
    {
      kind: 'read',
      title: 'The safety net: any surprise becomes a plain 500',
      goal: 'Expected failures are problems with their own code. Anything else is a bug, and one handler turns it into the same generic 500.',
      files: {
        python: { path: 'python-fastapi-aws/app/web/middleware.py', lines: [101, 136], note: 'CrashGuard is the innermost ASGI layer: it logs the exception with the request id and sends the internal-error problem.' },
        node: { path: 'node-typescript-gcp/src/http/errors.ts', lines: [10, 31], note: 'Express calls this error handler last: an ApiProblem keeps its own status, anything else is logged and becomes a 500.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Common/ApiExceptionHandler.cs', lines: [6, 19], note: 'An IExceptionHandler: a ProblemException is written as its problem, and every other exception is logged and becomes a 500.' },
      },
    },
    {
      kind: 'think',
      title: 'Just use 400 for every error?',
      question:
        'A teammate says: “Let us answer every error with 400 and a message. Clients read the message anyway.” What breaks if you do that?',
      answer:
        'Everything that reads only the number. A 401 no longer tells the client to get a fresh token, a 429 or 503 no longer says wait and retry, and a server bug no longer shows up as a 5xx on the dashboards. Generic tools, retry policies, gateways and alerts all decide from the code, so it must be the most specific true one, with the message in the problem details body.',
    },
    {
      kind: 'think',
      title: 'Why did this lab not show a 409?',
      question:
        'This API sends 409 idempotency-key-in-progress when a second order with the same key arrives while the first is still running. Why is it so hard to see one here, and when would you see it in production?',
      answer:
        'Here the key store is in memory, and creating an order takes microseconds: in Python and TypeScript nothing else can run between claiming the key and storing the answer, and in C# the window is tiny. In production, creating an order calls a database and a payment service, which takes long enough for a client and its retry, or a double tap, to overlap. Then the second request gets 409 and retries a moment later.',
    },
    {
      kind: 'build',
      title: 'Answer 409 Conflict for a book that already exists',
      task: 'Add a 409 you can see: creating a product whose title and author match a product that already exists answers 409 with a new problem type, duplicate-product, instead of making a copy.',
      steps: [
        'Add the slug duplicate-product with status 409 and a short title to the catalog: python-fastapi-aws/app/web/problems.py, node-typescript-gcp/src/http/problem.ts (the union and the record) or dotnet-azure/src/ApiConcepts.Api/Common/ProblemTypes.cs.',
        'In the create path (python-fastapi-aws/app/services/products.py, node-typescript-gcp/src/products/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/ProductEndpoints.cs), after the body is validated, look for a product with the same title and author.',
        'If one exists, raise the new problem, with a detail that names the existing product’s id so the client can use it. Otherwise create the product as today.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it adds a second copy of HTTP from the Ground Up by Maya Chen and expects 409.',
        'Run the contract suite for your stack: every test must still pass, because each test creates books with titles of its own.',
      ],
      hints: [
        'The TypeScript repository already has findAll. In Python and C#, add a small find method to the in-memory product repository that loops over the products.',
        'Title and author are trimmed when the body is validated, so compare the values after validation, not the raw JSON.',
        'Two creates at the same moment can both pass a check like this. In production a unique index in the database closes that gap, the same lesson as the atomic claim in idempotency.',
      ],
      check: {
        request: {
          method: 'POST',
          path: '/v1/products',
          as: 'writer',
          json: { title: 'HTTP from the Ground Up', author: 'Maya Chen', priceCents: 3499, tags: [] },
        },
        expect: { status: 409, body: { type: '/problems/duplicate-product', status: 409 } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch. The rule goes beyond SPEC.md, so other labs that create the same book twice would get your 409.',
    },
  ],
};
