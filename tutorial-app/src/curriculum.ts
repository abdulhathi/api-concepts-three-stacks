// The whole course: the 27 API concepts in five parts, in study order. Each concept has the same three parts:
//   a narrated video (src/lessons/<id>/video.ts), the concept guide (../docs/concepts/NN-<id>.md, shared with the
//   GitHub repo) and a practice lab (src/lessons/<id>/practice.ts) that sends real requests to the Bookshop API.
// A concept without a video or practice file shows what is ready and marks the rest "Soon".
// `covers` is the concept's scope: what its video teaches, in order. Writers stay inside it.
// VIDEO-GUIDE.md and PRACTICE-GUIDE.md explain how a lesson is written.

export type Topic = {
  id: string;
  /** The concept's number, 1 to 27, as in the GitHub repo and the guide's file name. */
  n: number;
  title: string;
  /** One sentence: what you can do after this concept. */
  goal: string;
  /** What the video teaches, in order. Writers stay inside it. */
  covers: string[];
};

export type Level = {
  key: string;
  n: number;
  title: string;
  blurb: string;
  topics: Topic[];
};

export const LEVELS: Level[] = [
  {
    key: 'shape',
    n: 1,
    title: 'The shape of an API call',
    blurb: 'What travels over the wire: requests, responses, methods, headers, parameters, bodies, JSON, schemas and status codes.',
    topics: [
      {
        id: 'requests-and-responses',
        n: 1,
        title: 'Requests and responses',
        goal: 'Read any HTTP exchange line by line: the request line, headers and body going out, and the status, headers and body coming back.',
        covers: ['A client and a server talking over HTTP', 'The request: method, path, version, headers, body', 'The response: status line, headers, body', 'Stateless: every request carries everything the server needs', 'Request IDs and one log line per request', 'Seeing it yourself with curl -i and the echo endpoint'],
      },
      {
        id: 'endpoints',
        n: 2,
        title: 'Endpoints',
        goal: 'Design clear endpoints: nouns for resources, a version prefix, nested paths only where ownership is real.',
        covers: ['An endpoint is a method plus a path', 'Resources are nouns, collections are plural', 'Versioning with /v1 and why it exists', 'Nesting: /orders/{id}/pay and when actions are fine', 'Unknown routes: a 404 that still follows the error format', 'Health and discovery endpoints'],
      },
      {
        id: 'http-methods',
        n: 3,
        title: 'HTTP methods',
        goal: 'Pick the right method for every operation and know which methods are safe and which are idempotent.',
        covers: ['GET, POST, PUT, PATCH and DELETE on one resource', 'Safe methods change nothing', 'Idempotent methods: same request twice, same result', 'PUT replaces, PATCH changes part', 'POST creates and why it is not idempotent', 'HEAD and OPTIONS'],
      },
      {
        id: 'headers',
        n: 4,
        title: 'Headers',
        goal: 'Use request and response headers for metadata: content type, tracing, location and security, and reject the wrong content type with 415.',
        covers: ['Headers are metadata, the body is the data', 'Content-Type and Accept', 'Rejecting the wrong media type: 415', 'X-Request-Id: tracing one request across systems', 'Location on a created resource', 'Security headers on every response'],
      },
      {
        id: 'path-and-query-parameters',
        n: 5,
        title: 'Path and query parameters',
        goal: 'Put identity in the path and options in the query, and validate both before any work happens.',
        covers: ['The path identifies one resource', 'The query filters, sorts and pages', 'Validating parameters and the 400 they earn', 'Encoding: spaces and special characters', 'Optional parameters and their defaults', 'Path versus query versus body: a rule of thumb'],
      },
      {
        id: 'request-bodies',
        n: 6,
        title: 'Request bodies',
        goal: 'Accept JSON bodies safely: validate every field, report every problem at once, and ignore what you do not know.',
        covers: ['Which methods carry a body', 'Validating a body against rules', 'One 400 that lists every field error', 'Malformed JSON versus invalid JSON', 'Unknown fields are ignored', 'Body size limits'],
      },
      {
        id: 'json-and-serialization',
        n: 7,
        title: 'JSON and serialization',
        goal: 'Turn objects into JSON and back the same way in every language: names, money, dates and nulls.',
        covers: ['Serialization and deserialization', 'camelCase property names in every stack', 'Money as integer cents, never floats', 'Timestamps in RFC 3339 UTC', 'null versus a missing field', 'The same JSON from Python, TypeScript and C#'],
      },
      {
        id: 'api-schemas',
        n: 8,
        title: 'API schemas',
        goal: 'Describe an API with OpenAPI so docs, clients and validation all come from one contract.',
        covers: ['A schema is a machine-readable contract', 'OpenAPI: paths, operations, components', 'Generated from code in FastAPI, ASP.NET Core and Express with zod', 'The docs UI at /docs', 'Contract-first versus code-first', 'Contract tests: one suite against three servers'],
      },
      {
        id: 'status-codes',
        n: 9,
        title: 'Status codes',
        goal: 'Answer with the status code that tells the client exactly what happened and what to do next.',
        covers: ['The five classes: 1xx to 5xx', 'Success: 200, 201, 204 and 304', 'Client errors: 400, 401, 403, 404, 409, 412, 415, 422, 429', 'Server errors: 500, 503, 504', 'Who should retry: the client or nobody', 'Common mix-ups: 401 versus 403, 400 versus 422'],
      },
    ],
  },
  {
    key: 'security',
    n: 2,
    title: 'Who may call it',
    blurb: 'Knowing who is calling and what they may do: authentication, authorization, JWTs, OAuth 2.0, HTTPS and CORS.',
    topics: [
      {
        id: 'authentication',
        n: 10,
        title: 'Authentication',
        goal: 'Prove who is calling with a bearer token, and answer a missing or bad token with 401 and WWW-Authenticate.',
        covers: ['Authentication answers who are you', 'API keys, Basic auth and bearer tokens', 'The Authorization header', '401 with WWW-Authenticate', 'Public endpoints that need no token', 'Never log tokens'],
      },
      {
        id: 'authorization',
        n: 11,
        title: 'Authorization',
        goal: 'Decide what a caller may do with scopes and ownership checks, and hide what they may not see.',
        covers: ['Authorization answers what may you do', 'Scopes on the token', '403 with insufficient_scope', 'Ownership: only your own orders', 'Why another client’s order is a 404, not a 403', 'Checks in one place, before the handler'],
      },
      {
        id: 'access-tokens-and-jwt',
        n: 12,
        title: 'Access tokens and JWT',
        goal: 'Read a JWT, know what each claim means, and validate one completely: signature, algorithm, expiry, issuer and audience.',
        covers: ['Opaque tokens versus self-contained tokens', 'The three parts of a JWT', 'The claims: iss, aud, sub, scope, iat, exp, jti', 'Signing with HS256 and why the algorithm is pinned', 'Validating every claim', 'Expiry, and why tokens are short-lived'],
      },
      {
        id: 'oauth2',
        n: 13,
        title: 'OAuth 2.0',
        goal: 'Get an access token with the client credentials grant and know which grant fits which kind of app.',
        covers: ['Roles: client, authorization server, resource server', 'The client credentials grant, step by step', 'Client authentication: Basic or form fields', 'Asking for fewer scopes', 'OAuth errors: invalid_client, invalid_scope', 'Other grants at a glance: authorization code with PKCE'],
      },
      {
        id: 'https',
        n: 14,
        title: 'HTTPS',
        goal: 'Explain what TLS protects, where it ends in the cloud, and how HSTS keeps browsers on HTTPS.',
        covers: ['What TLS gives: privacy, integrity, identity', 'The handshake at a glance', 'TLS ends at the cloud edge', 'X-Forwarded-Proto tells the app', 'HSTS, and why never over plain HTTP', 'Certificates are managed for you'],
      },
      {
        id: 'cors',
        n: 15,
        title: 'CORS',
        goal: 'Let the right web pages call your API from the browser with an origin allowlist and correct preflight answers.',
        covers: ['The same-origin policy and why it exists', 'Simple requests and the Origin header', 'The preflight OPTIONS request', 'Allowed methods, headers and max age', 'Exposed headers', 'CORS is a browser rule, not server security'],
      },
    ],
  },
  {
    key: 'styles',
    n: 3,
    title: 'API styles and moving data',
    blurb: 'Two ways to shape an API, and how to move a lot of data cheaply: REST, GraphQL, pagination and caching.',
    topics: [
      {
        id: 'rest',
        n: 16,
        title: 'REST',
        goal: 'Design a REST API around resources and a uniform interface, and know what each REST constraint buys you.',
        covers: ['Resources and representations', 'The uniform interface: methods, URLs, status codes', 'Statelessness', 'Location and Link headers', 'Cacheability', 'Where REST gets awkward'],
      },
      {
        id: 'graphql',
        n: 17,
        title: 'GraphQL',
        goal: 'Query exactly the fields you need across related objects in one request, and know the costs GraphQL brings.',
        covers: ['One endpoint, a typed schema', 'Queries select fields', 'Nested data: an order with its products', 'Errors in a 200 response', 'Authorization per field', 'REST or GraphQL: when each fits'],
      },
      {
        id: 'pagination',
        n: 18,
        title: 'Pagination',
        goal: 'Return big lists in pages with an opaque cursor that stays correct while data changes.',
        covers: ['Why lists need pages', 'Offset pagination and its problems', 'Cursor pagination', 'Opaque cursors and invalid-cursor', 'The page object and the Link header', 'Filters that survive paging'],
      },
      {
        id: 'caching',
        n: 19,
        title: 'Caching',
        goal: 'Make repeat reads cheap with ETag, If-None-Match and Cache-Control, and stop lost updates with If-Match.',
        covers: ['Why cache API responses', 'Cache-Control: private, max-age, no-store', 'ETags: strong and weak', 'Conditional GET: If-None-Match and 304', 'Optimistic concurrency: If-Match and 412', 'Where caches live: browser, CDN, gateway'],
      },
    ],
  },
  {
    key: 'reliability',
    n: 4,
    title: 'Staying up under load and failure',
    blurb: 'Protecting the API from too much traffic, and clients from a network that fails: limits, retries, timeouts and backoff.',
    topics: [
      {
        id: 'rate-limiting',
        n: 20,
        title: 'Rate limiting',
        goal: 'Limit each client to its plan with a token bucket, and tell it exactly when to come back.',
        covers: ['Why limit: fairness, cost, abuse', 'Algorithms: fixed window, sliding window, token bucket', 'The token bucket, step by step', 'RateLimit headers on every response', '429 with Retry-After', 'Limits per client and per plan, and where they live in the cloud'],
      },
      {
        id: 'throttling',
        n: 21,
        title: 'Throttling',
        goal: 'Protect an expensive endpoint by limiting how many requests run at once, queueing a few and turning the rest away.',
        covers: ['Throttling versus rate limiting', 'A concurrency limit', 'A small queue, first in first out', 'Shedding load with 503 and Retry-After', 'Why fail fast is kinder than slow', 'Built-in limiters in each stack'],
      },
      {
        id: 'idempotency',
        n: 22,
        title: 'Idempotency',
        goal: 'Make retries of a create request safe with an Idempotency-Key, so a lost response never means a double order.',
        covers: ['The lost response: did my order go through?', 'Idempotent methods and why POST is not one', 'The Idempotency-Key header', 'Replay: the same key and body return the stored response', 'Misuse: a reused key with a new body, a key still in progress', 'What the server stores, for how long, and per client'],
      },
      {
        id: 'retries',
        n: 23,
        title: 'Retries',
        goal: 'Retry only what is safe to retry, only on errors that can heal, and only a few times.',
        covers: ['Transient versus permanent failures', 'Which status codes to retry', 'Which methods are safe to retry', 'A retry budget: at most three retries', 'Retry storms and how they start', 'A typed client that retries for you'],
      },
      {
        id: 'timeouts',
        n: 24,
        title: 'Timeouts',
        goal: 'Put a time limit on every call, on both sides, so a slow dependency cannot hang your whole system.',
        covers: ['Why every call needs a deadline', 'The client per-attempt timeout', 'The server request timeout and 504', 'Cancelling the work, not just the response', 'Choosing the numbers', 'Timeouts, retries and the total budget'],
      },
      {
        id: 'exponential-backoff',
        n: 25,
        title: 'Exponential backoff',
        goal: 'Space out retries with exponential backoff and jitter so failing clients do not hit a recovering server all at once.',
        covers: ['Retrying at once makes things worse', 'Exponential delays: 200, 400, 800 milliseconds', 'A cap on the delay', 'Jitter: spreading clients out', 'Honoring Retry-After', 'Backoff in webhook deliveries'],
      },
    ],
  },
  {
    key: 'talking-back',
    n: 5,
    title: 'Talking back, and failing well',
    blurb: 'How an API tells other systems that something happened, and how it explains what went wrong.',
    topics: [
      {
        id: 'webhooks',
        n: 26,
        title: 'Webhooks',
        goal: 'Push events to subscribers with signed, retried webhook deliveries, and verify a signature on the receiving side.',
        covers: ['Polling versus webhooks', 'Subscriptions and events', 'Delivering in the background', 'Signing with HMAC-SHA256 and a timestamp', 'Verifying a signature as a receiver', 'Retries with backoff and the delivery log'],
      },
      {
        id: 'error-handling',
        n: 27,
        title: 'Error handling',
        goal: 'Return every error in one predictable shape, RFC 9457 problem details, that tells the client what went wrong and what to do.',
        covers: ['Why one error format', 'Problem details: type, title, status, detail, instance', 'Field errors for validation', 'The request ID that links the error to the log', 'Never leak a stack trace from a 500', 'One error handler per stack'],
      },
    ],
  },
];

export const TOPICS: Topic[] = LEVELS.flatMap((l) => l.topics);

export const findTopic = (id: string) => TOPICS.find((t) => t.id === id);

export const levelOf = (id: string) => LEVELS.find((l) => l.topics.some((t) => t.id === id));

/** "22": the concept's number, as in the GitHub repo. */
export function numberOf(id: string): string {
  const t = findTopic(id);
  return t ? String(t.n) : '';
}

/** The concept guide's file name in ../docs/concepts: "22-idempotency". */
export const docName = (t: Topic) => `${String(t.n).padStart(2, '0')}-${t.id}`;
