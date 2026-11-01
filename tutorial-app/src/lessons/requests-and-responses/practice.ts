import type { Practice } from '../../practice/types';

export const practice: Practice = {
  id: 'requests-and-responses',
  intro:
    'You will read real HTTP exchanges with the Bookshop API: a health check, the echo endpoint that shows what the server received, a request without its token, and the request id that ties a response to its log line.',
  vars: { TRACE: 'uuid', TRACE_2: 'uuid', BUILD_ID: 'uuid' },
  steps: [
    {
      kind: 'try',
      title: 'The smallest exchange: a health check',
      goal: 'GET /health needs no token and sends no body. Look at all three parts of the response: the status line, the headers and the body.',
      request: { method: 'GET', path: '/health' },
      expect: { status: 200, headers: { 'Content-Type': '~application/json', 'X-Request-Id': true }, body: { status: 'ok' } },
      notice: [
        '200 OK on the status line, then the headers, then a body of one small JSON object.',
        'X-Request-Id is on the response although you did not send one: the server made a UUID for this exchange.',
        'curl -i prints the same three parts in a terminal. Python sends header names in lower case, TypeScript and C# in capitals; names are case insensitive, so all three are correct.',
      ],
    },
    {
      kind: 'try',
      title: 'Send a request, see what the server received',
      goal: 'POST /v1/echo answers with a copy of the request as the server saw it. Send a query string and a small JSON body.',
      request: { method: 'POST', path: '/v1/echo?a=1', as: 'reader', json: { hi: 1 } },
      expect: {
        status: 200,
        body: { method: 'POST', path: '/v1/echo', 'query.a': '1', 'body.hi': 1, 'headers.content-type': '~application/json' },
      },
      notice: [
        'path is /v1/echo, without the query: the server splits the target into a path and a query.',
        'body came back parsed. The Content-Type header told the server the bytes were JSON.',
        'Any valid token works for the echo; the lab used reader’s.',
      ],
    },
    {
      kind: 'try',
      title: 'A GET has no body, and your token stays secret',
      goal: 'Send a GET with a header of your own. The echo lists every header it received, with lower-case names, and masks the token.',
      request: { method: 'GET', path: '/v1/echo', as: 'reader', headers: { 'X-Lab-Note': 'hello' } },
      expect: { status: 200, body: { method: 'GET', body: null, 'headers.x-lab-note': 'hello', 'headers.authorization': 'Bearer ***' } },
      notice: [
        'body is null: this GET carried no body.',
        'Your header arrived as x-lab-note. Header names are case insensitive, so the echo lower-cases them all.',
        'authorization is Bearer ***. The echo never sends a credential back, and the log line never contains one.',
      ],
    },
    {
      kind: 'try',
      title: 'Stateless: the server does not remember you',
      goal: 'Send the same GET again, without the Authorization header. You sent a token a moment ago. Does the server remember it?',
      request: { method: 'GET', path: '/v1/echo' },
      expect: { status: 401, headers: { 'WWW-Authenticate': '~Bearer' }, body: { type: '/problems/unauthorized' } },
      notice: [
        '401: the server keeps no memory of earlier requests. Every request must carry its own token.',
        'That is what lets any copy of the server answer any request behind a load balancer.',
        'WWW-Authenticate tells the client which scheme to use: Bearer. Lesson 10 covers authentication.',
      ],
    },
    {
      kind: 'try',
      title: 'Give your request a name',
      goal: 'Send an X-Request-Id of your own: 1 to 128 letters, digits, dots, dashes or underscores. The lab sends a fresh UUID.',
      request: { method: 'GET', path: '/v1/echo', as: 'reader', headers: { 'X-Request-Id': '{{TRACE}}' } },
      expect: { status: 200, headers: { 'X-Request-Id': '{{TRACE}}' }, body: { 'headers.x-request-id': '{{TRACE}}' } },
      notice: [
        'The response carries your id back in X-Request-Id, and the echo shows that it arrived.',
        'Look at the terminal where your server runs: the log line for this request has the same requestId, plus the method, path, status, duration and clientId reader.',
        'An id that breaks the rule is replaced by a new UUID. Lesson 4 follows one id across services.',
      ],
    },
    {
      kind: 'try',
      title: 'A broken request still gets a full response',
      goal: 'Send a body that is not valid JSON (the closing brace is missing), with another id of your own. A failed request needs its id even more than a good one.',
      request: {
        method: 'POST',
        path: '/v1/echo',
        as: 'reader',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': '{{TRACE_2}}' },
        raw: '{"hi": 1',
      },
      expect: {
        status: 400,
        headers: { 'X-Request-Id': '{{TRACE_2}}', 'Content-Type': '~application/problem+json' },
        body: { type: '/problems/malformed-json', requestId: '{{TRACE_2}}' },
      },
      notice: [
        'Even a broken request gets a status line, headers and a body. 400 means the mistake is on the client’s side.',
        'The same id is in the X-Request-Id header and in the requestId field of the error body, so an app can show it as a reference.',
        'The detail text differs a little between stacks; the type, status and requestId do not. Lesson 6 covers bodies.',
      ],
    },
    {
      kind: 'read',
      title: 'The echo handler',
      goal: 'Each stack builds the echo by hand from its own request object: the method, the path without the query, the first value of each query name, every header with the token masked, and the parsed body.',
      files: {
        python: { path: 'python-fastapi-aws/app/routes/echo.py', lines: [15, 30], note: 'Two decorators put one function on GET and POST; Starlette’s Request gives headers, query_params and url.path.' },
        node: { path: 'node-typescript-gcp/src/demo/routes.ts', lines: [51, 64], note: 'router.all takes every method and answers not-found itself for anything but GET and POST; the path is originalUrl cut at the question mark.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Endpoints/SystemEndpoints.cs', lines: [35, 55], note: 'MapMethods puts Echo on GET and POST; Mask swaps the Authorization value before anything is returned.' },
      },
    },
    {
      kind: 'read',
      title: 'One log line per request',
      goal: 'The log line is written by middleware that wraps every request, so it sees the final status and the time taken. It never reads the body or the token.',
      files: {
        python: { path: 'python-fastapi-aws/app/web/middleware.py', lines: [53, 98], note: 'RequestContext records the status from http.response.start and logs in a finally block, so even a crash gets a line.' },
        node: { path: 'node-typescript-gcp/src/http/requestLog.ts', lines: [8, 28], note: 'res.on finish runs once the response is sent; 4xx lines get level warn here and in C#, while Python uses info.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Http/RequestLogMiddleware.cs', lines: [17, 43], note: 'try and finally around next(context); requestId is the TraceIdentifier that RequestIdMiddleware set first.' },
      },
    },
    {
      kind: 'think',
      title: 'State in server memory',
      question:
        'A teammate wants to keep each client’s last search in the API server’s memory, so the next request can just say "page 2". You run three copies behind a load balancer. What goes wrong, and what would you do instead?',
      answer:
        'The next request may land on another copy, which never saw the search, so page 2 fails or returns the wrong data, and a restart loses it on every copy. Put the state in the request instead: a cursor that says where the next page starts (lesson 18). If the server must remember something, keep it in shared storage and have the client send the key every time.',
    },
    {
      kind: 'think',
      title: '"My order failed"',
      question: 'A user writes: "my order failed at about 3 pm." How do you find the exact request in your logs, and what would you change in the app so the next report is easier?',
      answer:
        'Without an id you can only filter the log lines by time, path, status and client id, and hope that one line matches. Make the app show the request id from the X-Request-Id header, or the requestId of the error body, on its error screen, and ask users to quote it. Then one search finds the one log line, with its status and duration.',
    },
    {
      kind: 'build',
      title: 'Complete the echo: version and request id',
      task: 'The echo shows two parts of the request line, the method and the target, but not the third: the HTTP version. It also leaves out the request id. Add two fields: version ("HTTP/1.1") and requestId (the same value as the X-Request-Id response header).',
      steps: [
        'Open the echo handler: python-fastapi-aws/app/routes/echo.py, node-typescript-gcp/src/demo/routes.ts or dotnet-azure/src/ApiConcepts.Api/Endpoints/SystemEndpoints.cs.',
        'Add version: the protocol from the request line, written exactly as HTTP/1.1.',
        'Add requestId: the id this request already has. Do not make a new one; read the one the request id middleware chose.',
        'In TypeScript, add both fields to echoSchema in the same file too, so the OpenAPI document stays true.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it sends an X-Request-Id of its own and expects both new fields.',
      ],
      hints: [
        'Every framework has already parsed the request line, so the version is on the request object (or in the ASGI scope, for Python). Two stacks give you "1.1" and one gives "HTTP/1.1", so make all three answer the same.',
        'The id lives wherever the middleware put it: the request state in Python, the response header that is already set in TypeScript, and HttpContext in C#.',
        'Only add fields; do not rename any. The contract test for the echo still checks method, path, query, headers and body.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/echo', as: 'reader', headers: { 'X-Request-Id': '{{BUILD_ID}}' } },
        expect: { status: 200, body: { version: 'HTTP/1.1', requestId: '{{BUILD_ID}}' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: every contract test must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
