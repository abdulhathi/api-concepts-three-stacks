import type { Practice } from '../../practice/types';

const GRANT = { grant_type: 'client_credentials' };

export const practice: Practice = {
  id: 'oauth2',
  intro:
    'You will run the client credentials grant yourself: get a token with HTTP Basic and with form fields, use it at the resource server, and ask for fewer scopes. Then you will make each OAuth error happen on purpose, one fault at a time.',
  steps: [
    {
      kind: 'try',
      title: 'Get a token with HTTP Basic',
      goal: 'The reader client trades its id and secret for an access token. The id and secret travel in the Authorization: Basic header (client_secret_basic).',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], form: GRANT },
      expect: {
        status: 200,
        headers: { 'Cache-Control': '~no-store' },
        body: { access_token: '*', token_type: 'Bearer', expires_in: 900, scope: 'products:read orders:read' },
      },
      save: { TOKEN: 'body.access_token' },
      notice: [
        'No scope was asked for, so reader got every scope it is registered for.',
        'Cache-Control: no-store: no browser, proxy or CDN may keep this answer.',
        'There is no refresh_token. When this token expires in 900 seconds, the client simply asks again.',
      ],
    },
    {
      kind: 'try',
      title: 'Use the token at the resource server',
      goal: 'The client now calls the API with the token, not with its secret. The token endpoint was the authorization server; the /v1 routes are the resource server.',
      request: { method: 'GET', path: '/v1/products?limit=1', headers: { Authorization: 'Bearer {{TOKEN}}' } },
      expect: { status: 200, body: { data: '*', page: '*' } },
      notice: [
        'Here one process plays both roles. In production the authorization server is usually a separate service, such as Cognito or Microsoft Entra ID.',
        'The secret went only to the token endpoint. Every call from now on carries only the short-lived token, until it is time to get a new one.',
      ],
    },
    {
      kind: 'try',
      title: 'Authenticate with form fields instead',
      goal: 'The same grant, with client_id and client_secret as form fields next to grant_type (client_secret_post), and no Authorization header.',
      request: { method: 'POST', path: '/oauth/token', form: { ...GRANT, client_id: 'reader', client_secret: 'reader-secret' } },
      expect: { status: 200, headers: { 'Cache-Control': '~no-store' }, body: { token_type: 'Bearer', scope: 'products:read orders:read' } },
      notice: [
        'RFC 6749 prefers Basic, and says to use form fields only for clients that cannot send it.',
        'If a request has both, all three servers use the Basic header.',
      ],
    },
    {
      kind: 'try',
      title: 'Ask for fewer scopes',
      goal: 'The writer client may read and write products and orders. A job that only reads products asks for scope products:read, and nothing more.',
      request: { method: 'POST', path: '/oauth/token', basic: ['writer', 'writer-secret'], form: { ...GRANT, scope: 'products:read' } },
      expect: { status: 200, body: { token_type: 'Bearer', scope: 'products:read' } },
      save: { SMALL: 'body.access_token' },
      notice: [
        'The scope field in the answer says what was granted: one scope, not four.',
        'Several scopes go in one field, separated by spaces: scope=products:read orders:read.',
      ],
    },
    {
      kind: 'try',
      title: 'The narrow token cannot do more',
      goal: 'writer itself may read orders, but this token was asked for with products:read only. The resource server goes by the token, not by the client.',
      request: { method: 'GET', path: '/v1/orders', headers: { Authorization: 'Bearer {{SMALL}}' } },
      expect: {
        status: 403,
        headers: { 'WWW-Authenticate': '~error="insufficient_scope"' },
        body: { type: '/problems/forbidden' },
      },
      notice: [
        'This is least privilege: if this token leaks, it can only read products.',
        'The 403 is a problem details answer from the resource server. The token endpoint’s own errors look different, as the next steps show.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: a wrong secret',
      goal: 'Send the reader id with the wrong secret. Client authentication fails, so nothing else is checked.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'wrong-secret'], form: GRANT },
      expect: {
        status: 401,
        headers: { 'WWW-Authenticate': '~Basic realm="api-concepts"', 'Cache-Control': '~no-store' },
        body: { error: 'invalid_client', error_description: '*' },
      },
      notice: [
        'The body is the RFC 6749 shape, error and error_description, not problem details. OAuth libraries read the error field.',
        'WWW-Authenticate: Basic tells the client how to authenticate. An unknown client id gets exactly the same answer, so nobody can probe which clients exist.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: credentials in the URL',
      goal: 'Put client_id and client_secret in the query string. RFC 6749 says they must never go in the URL, and the servers do not look there.',
      request: { method: 'POST', path: '/oauth/token?client_id=reader&client_secret=reader-secret', form: GRANT },
      expect: { status: 401, body: { error: 'invalid_client' } },
      notice: [
        'The server found no credentials in the Basic header or the form body, so the client is not authenticated.',
        'A URL ends up in access logs, browser history and proxy logs. That is why the secret belongs in a header or the body.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: a scope the client does not have',
      goal: 'reader asks for products:read and admin. reader may not have admin.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], form: { ...GRANT, scope: 'products:read admin' } },
      expect: { status: 400, body: { error: 'invalid_scope' } },
      notice: [
        'No token at all, not even one for products:read. The standard also lets a server grant only the allowed part; this API refuses instead.',
        'The error_description differs: Python and TypeScript name the scope, C# does not. The error code is the contract.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: a grant this server does not support',
      goal: 'Ask for the password grant, where a client sends a user’s password. This API supports only client_credentials.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], form: { grant_type: 'password' } },
      expect: { status: 400, body: { error: 'unsupported_grant_type' } },
      notice: ['Current security advice says not to use the password grant at all. Apps that act for a user use authorization code with PKCE.'],
    },
    {
      kind: 'try',
      title: 'Misuse: JSON instead of a form',
      goal: 'Send the grant as a JSON body. The token endpoint takes application/x-www-form-urlencoded, as RFC 6749 defines it.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], json: GRANT },
      expect: { status: 400, body: { error: 'invalid_request' } },
      notice: [
        'The server did not find grant_type in a form, so the request itself is invalid.',
        'The error_description differs: C# asks for a form, Python and TypeScript say grant_type is required. Each step here has one fault, because the stacks check faults in a different order.',
      ],
    },
    {
      kind: 'read',
      title: 'The token endpoint',
      goal: 'One handler per stack does the whole grant: authenticate the client, check the grant type, check the scopes, sign a token, answer with no-store.',
      files: {
        python: { path: 'python-fastapi-aws/app/auth/oauth.py', lines: [87, 116], note: 'It parses the form itself, authenticates the client first, then checks grant_type and the scopes.' },
        node: { path: 'node-typescript-gcp/src/auth/oauth.ts', lines: [34, 71], note: 'express.urlencoded parses the form; grant_type is checked before the client, so two faults can give a different error than the other stacks.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Auth/OAuthEndpoints.cs', lines: [29, 70], note: 'A hand-written handler with no OAuth package: it checks for a form, a missing grant_type, the client, then the grant type and scopes.' },
      },
    },
    {
      kind: 'read',
      title: 'Client authentication: Basic first, then form fields',
      goal: 'Each stack reads the Basic header first and falls back to the form fields. Look at how the id and secret are decoded and compared.',
      files: {
        python: { path: 'python-fastapi-aws/app/auth/oauth.py', lines: [40, 60], note: 'The Basic value is Base64 decoded, split at the first colon and URL-decoded, as RFC 6749 section 2.3.1 asks.' },
        node: { path: 'node-typescript-gcp/src/auth/clients.ts', lines: [33, 40], note: 'Both secrets are hashed with SHA-256 first, so timingSafeEqual compares equal lengths and the time leaks nothing.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Auth/OAuthEndpoints.cs', lines: [72, 93], note: 'Basic wins over the form fields; a header that is not valid Base64 counts as no credentials.' },
      },
    },
    {
      kind: 'think',
      title: 'A secret in a single-page app',
      question:
        'A React single-page app must call this API for the signed-in user. A teammate suggests shipping a client id and secret in the app and using client credentials. What is wrong, and what should it use?',
      answer:
        'Everything shipped to a browser is public, so the secret is no secret: anyone can copy it and act as that client. Client credentials also has no user, so the API cannot tell one user from another. Use the authorization code grant with PKCE through an identity provider: the app gets a token for the user, and no client secret lives in the browser.',
    },
    {
      kind: 'think',
      title: 'One token per call?',
      question: 'A partner service calls this API 50 times a second, and asks /oauth/token for a new token before every call. What is wrong, and what should it do?',
      answer:
        'It sends 50 extra token requests a second, signs 50 new tokens, and adds a round trip to every call, all for nothing. Cache the token and reuse it until shortly before expires_in runs out; this lab refreshes 30 seconds early. Also get a new one when a call answers 401 with error="invalid_token".',
    },
    {
      kind: 'build',
      title: 'Add token introspection (RFC 7662)',
      task: 'A resource server that cannot check a token itself, for example because the token is opaque, asks the authorization server about it. Add POST /oauth/introspect: an authenticated client sends a token and learns whether it is active, and what it carries.',
      steps: [
        'Open the token endpoint file: python-fastapi-aws/app/auth/oauth.py, node-typescript-gcp/src/auth/oauth.ts or dotnet-azure/src/ApiConcepts.Api/Auth/OAuthEndpoints.cs, and add POST /oauth/introspect next to /oauth/token.',
        'Authenticate the caller exactly like the token endpoint: Basic first, then form fields. A failure is 401 invalid_client.',
        'Read the token form field and verify it with the existing token service. C# has no verify method yet: add one to dotnet-azure/src/ApiConcepts.Api/Auth/TokenService.cs with JsonWebTokenHandler.ValidateTokenAsync and the same validation parameters as AuthSetup.cs.',
        'If it is valid, answer 200 with active: true, scope, client_id, sub, exp, iat and token_type: "Bearer". If it is not valid, for any reason, answer 200 with only active: false.',
        'Send Cache-Control: no-store, like the token endpoint.',
        'Restart your server (the TypeScript server reloads by itself under npm run dev), then press Check.',
      ],
      hints: [
        'An invalid token is not an error here: RFC 7662 answers 200 with active false, and says nothing about why.',
        'Reuse the validation code. A second copy of the checks is a second place to forget the audience.',
        'In production, only resource servers should be allowed to introspect. Here, any authenticated client may.',
      ],
      check: {
        request: { method: 'POST', path: '/oauth/introspect', basic: ['reader', 'reader-secret'], form: { token: '{{TOKEN}}' } },
        expect: { status: 200, body: { active: true, client_id: 'reader', scope: 'products:read orders:read' } },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
