import type { Practice } from '../../practice/types';

const CHALLENGE = 'Bearer realm="api-concepts"';

export const practice: Practice = {
  id: 'authentication',
  intro:
    'You will call a public endpoint, get turned away from a protected one, fetch a token and send it the right way. Then you will send it every wrong way (tampered, as Basic auth, in the URL) and read the 401 challenge each time.',
  steps: [
    {
      kind: 'try',
      title: 'A public endpoint needs no token',
      goal: 'A few endpoints must stay open, or nothing could start. A load balancer calls the health endpoint with no token at all.',
      request: { method: 'GET', path: '/health' },
      expect: { status: 200, body: { status: 'ok' } },
      notice: [
        'No Authorization header, and still 200.',
        'The public list in this API is short: /, /health, /openapi.json, /docs and /oauth/token. Everything under /v1 and /graphql needs a token.',
      ],
    },
    {
      kind: 'try',
      title: 'A protected endpoint with no token',
      goal: 'GET /v1/me tells you who the API thinks you are. Without a token, it cannot know, so it answers 401 with a challenge.',
      request: { method: 'GET', path: '/v1/me' },
      expect: {
        status: 401,
        headers: { 'WWW-Authenticate': CHALLENGE, 'Content-Type': '~application/problem+json', 'RateLimit-Limit': false },
        body: { type: '/problems/unauthorized', status: 401 },
      },
      notice: [
        'The WWW-Authenticate header is the challenge: use the Bearer scheme, in the realm api-concepts. HTTP requires it on every 401.',
        'There is no error= part, because no token was sent at all.',
        'No RateLimit headers: authentication runs before rate limiting, so a 401 costs the caller nothing.',
      ],
    },
    {
      kind: 'try',
      title: 'Get an access token',
      goal: 'The client trades its id and secret for a short-lived token. This is the only place this API accepts Basic auth. Lesson 13 covers the grant itself.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], form: { grant_type: 'client_credentials' } },
      expect: { status: 200, body: { token_type: 'Bearer', expires_in: 900, access_token: '*' } },
      save: { TOKEN: 'body.access_token' },
      notice: [
        'token_type is Bearer: whoever holds this token can use it.',
        'expires_in is 900 seconds, 15 minutes. The lab saved the token for the next steps.',
      ],
    },
    {
      kind: 'try',
      title: 'Send the token in the Authorization header',
      goal: 'The right way: the scheme Bearer, one space, then the token, in the Authorization header.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: 'Bearer {{TOKEN}}' } },
      expect: { status: 200, headers: { 'RateLimit-Limit': '1000' }, body: { clientId: 'reader', plan: 'standard', tokenExpiresAt: '*' } },
      notice: [
        'The API verified the token and now knows the caller: clientId reader.',
        'This time there are RateLimit headers. Once the API knows who you are, the call counts against your own bucket.',
      ],
    },
    {
      kind: 'try',
      title: 'The scheme name is not case sensitive',
      goal: 'HTTP says authentication scheme names are case-insensitive, so bearer works the same as Bearer.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: 'bearer {{TOKEN}}' } },
      expect: { status: 200, body: { clientId: 'reader' } },
      notice: [
        'All three stacks accept it: a regex with the i flag in TypeScript, a lower-case comparison in FastAPI, and a case-insensitive check in ASP.NET Core.',
        'The token itself is the opposite: change one character and it fails, as the next step shows.',
      ],
    },
    {
      kind: 'try',
      title: 'Tamper with the token',
      goal: 'Add one character to the end of the token. The signature no longer matches, so the server must reject it.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: 'Bearer {{TOKEN}}x' } },
      expect: {
        status: 401,
        headers: { 'WWW-Authenticate': `${CHALLENGE}, error="invalid_token"`, 'RateLimit-Limit': false },
        body: { type: '/problems/unauthorized' },
      },
      notice: [
        'Now the challenge has error="invalid_token": a token was sent, but it is not good. The client should get a new one, not retry this one.',
        'Every stack answers with one fixed sentence, whatever was wrong with the token, and none of them echo the token back.',
      ],
    },
    {
      kind: 'try',
      title: 'Basic auth is not accepted on the API',
      goal: 'Send the right id and secret, but as Basic auth on /v1/me. The API takes them only at the token endpoint.',
      request: { method: 'GET', path: '/v1/me', basic: ['reader', 'reader-secret'] },
      expect: { status: 401, headers: { 'WWW-Authenticate': CHALLENGE }, body: { type: '/problems/unauthorized' } },
      notice: [
        'The secret is correct, and it still gets 401. On /v1 the only scheme is Bearer.',
        'The challenge has no error code: as far as the API is concerned, no bearer token was sent.',
        'This is the point of tokens: the long-lived secret goes only to the token endpoint, and the other endpoints never see it.',
      ],
    },
    {
      kind: 'try',
      title: 'A token in the URL is ignored',
      goal: 'Put the valid token in a query parameter instead of the header. This API reads only the Authorization header.',
      request: { method: 'GET', path: '/v1/me?access_token={{TOKEN}}' },
      expect: { status: 401, headers: { 'WWW-Authenticate': CHALLENGE }, body: { type: '/problems/unauthorized' } },
      notice: [
        'A good token, and still 401: in the URL, it simply does not count.',
        'RFC 6750 allows a query parameter only when nothing else is possible, because URLs end up in server logs, proxy logs and browser history.',
      ],
    },
    {
      kind: 'try',
      title: 'The API never repeats your token',
      goal: 'The echo endpoint sends your request back to you, headers included. Look at what it does with Authorization.',
      request: { method: 'GET', path: '/v1/echo', headers: { Authorization: 'Bearer {{TOKEN}}' } },
      expect: { status: 200, body: { 'headers.authorization': 'Bearer ***' } },
      notice: [
        'The token comes back as Bearer ***. Reflecting a credential is how it ends up in a screenshot or a log.',
        'The request log follows the same rule: one line per request with the clientId, never the token, the secret or the body.',
      ],
    },
    {
      kind: 'read',
      title: 'Where the token is checked',
      goal: 'Each stack checks the token in one place, before any route runs, and writes the same two challenges.',
      files: {
        python: {
          path: 'python-fastapi-aws/app/auth/dependencies.py',
          lines: [17, 50],
          note: 'HTTPBearer(auto_error=False) hands over the credentials or None, so the code raises its own 401: plain for no token, invalid_token for a bad one.',
        },
        node: {
          path: 'node-typescript-gcp/src/auth/authenticate.ts',
          lines: [10, 35],
          note: 'A case-insensitive regex reads the Bearer header; any failure inside verify becomes a 401 with error="invalid_token".',
        },
        dotnet: {
          path: 'dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs',
          lines: [41, 73],
          note: 'The built-in JwtBearer handler validates the token; OnChallenge replaces its empty 401 with problem details and the right challenge.',
        },
      },
    },
    {
      kind: 'read',
      title: 'The log line: who, never the token',
      goal: 'One JSON line per request. Look for what is in it, and what is not.',
      files: {
        python: { path: 'python-fastapi-aws/app/web/middleware.py', lines: [82, 98], note: 'clientId comes from request state that the auth dependency set; no header is ever logged.' },
        node: { path: 'node-typescript-gcp/src/http/requestLog.ts', lines: [8, 28], note: 'The line is built field by field, so the Authorization header cannot slip in by accident.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Http/RequestLogMiddleware.cs', lines: [17, 43], note: 'clientId is read from the sub claim of the authenticated user, after the token was checked.' },
      },
    },
    {
      kind: 'think',
      title: 'Why a 401 is not rate limited',
      question:
        'Authentication runs before rate limiting here, so a flood of requests with no token or bad tokens is never counted. Why is it built this way, and how would you protect the API from that flood in production?',
      answer:
        'The bucket belongs to a client, and the client is only known once the token is verified. Counting unknown callers would mean one shared bucket that anyone could empty for everyone. Rejecting a bad token is cheap, but a real flood should be stopped earlier: a per-IP limit or a web application firewall at the edge, in front of the API.',
    },
    {
      kind: 'think',
      title: 'A secret inside a mobile app',
      question:
        'A teammate wants the mobile app to call this API with the writer client’s id and secret built into the app. What is wrong with that, and what would you do instead?',
      answer:
        'Anything shipped inside an app can be pulled out of it, so the secret is public the day you release, and every install shares one identity. The client credentials grant is for servers that can keep a secret. A mobile app should sign the user in with the authorization code flow and PKCE and get a short-lived token for that user, or call your own backend, which keeps the secret.',
    },
    {
      kind: 'build',
      title: 'Tell the client why its token was rejected',
      task: 'RFC 6750 lets a challenge carry an error_description for the client developer. Add one to the invalid_token challenge, with one text for an expired token and another for every other failure.',
      steps: [
        'Find the invalid_token challenge in your stack: python-fastapi-aws/app/auth/dependencies.py, node-typescript-gcp/src/auth/authenticate.ts, or OnChallenge in dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs.',
        'Use exactly two texts: "The access token expired" for an expired token, and "The access token is invalid" for everything else. Plain ASCII, with no double quotes or backslashes inside.',
        'Tell the two cases apart. PyJWT raises ExpiredSignatureError, jose throws errors.JWTExpired, and ASP.NET Core puts a SecurityTokenExpiredException in context.AuthenticateFailure.',
        'Append it to the challenge: Bearer realm="api-concepts", error="invalid_token", error_description="The access token is invalid".',
        'Leave the missing-token challenge alone. With no token there is no error, so there is nothing to describe.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check: it sends a token that is not a JWT at all.',
      ],
      hints: [
        'Python: verify raises TokenError from the PyJWT exception, so the original one is on exc.__cause__. Or give TokenError a field that says whether it expired.',
        'TypeScript: the catch block ignores the error today. Name it, then test it with instanceof against errors.JWTExpired, imported from jose.',
        'Keep the description short and general. It helps the client developer; it should not explain to an attacker which check failed beyond expired or not.',
      ],
      check: {
        request: { method: 'GET', path: '/v1/me', headers: { Authorization: 'Bearer not.a.token' } },
        expect: { status: 401, headers: { 'WWW-Authenticate': '~error_description="The access token is invalid"' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the 401 tests check the challenge and must still pass',
    },
  ],
};
