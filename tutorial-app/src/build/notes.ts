// What to build in your own API for each concept, beyond the guide's "The rule in this repo", and what it depends on.
// The order follows the course; a few pieces are needed earlier than the lesson that teaches them, and those notes say so.

export const BUILD_NOTES: Record<number, string[]> = {
  1: [
    'Start with Step 0 in your stack’s README: create the project and its start.sh. check.sh waits for GET /health, so build that first: 200 with {"status":"ok"}.',
    'Then GET and POST /v1/echo, answering { method, path, query, headers, body } exactly as SPEC.md’s Echo section says, with authorization masked as "Bearer ***".',
    'Add X-Request-Id to every response and print one JSON log line per request.',
    'Your server does not check tokens yet: until concept 10, the tests send a placeholder Bearer token.',
  ],
  2: ['GET / answers the index ({ name, docs, openapi }) and GET /health needs no token.', 'Put every resource under /v1, as nouns: /v1/products, later /v1/orders.'],
  3: [
    'Keep products in memory, loaded from ../seed.json: list, get one, POST, PUT, PATCH and DELETE.',
    'Errors must already be problem details (concept 27): build the shape now. type /problems/<slug>, title (SPEC.md’s table), status, detail, instance, requestId, Content-Type application/problem+json.',
    'The test also checks that a non-admin DELETE gets 403. That part runs once you build authentication (concept 10).',
  ],
  4: ['Security headers on every response, 415 for a body that is not JSON, merge patch JSON on PATCH only, and Cache-Control: no-store by default under /v1.'],
  5: ['limit 1 to 50 (default 10) and tag, validated before any work: a 400 validation-error with one entry per bad field in errors[].', 'An unknown product id is a 404 not-found.'],
  6: ['Validate every field by SPEC.md’s product rules and list every problem in one 400.', 'A body that is not JSON at all is 400 malformed-json, a different type from validation-error.'],
  7: ['camelCase names, money as integer cents, timestamps in RFC 3339 UTC with milliseconds and Z, and null fields present, never left out.'],
  8: [
    'Serve GET /openapi.json (OpenAPI 3) and a docs page at GET /docs, generated from your code where your framework can.',
    'The test looks for the orders and webhooks paths only once you build them (concepts 22 and 26).',
  ],
  9: ['Mostly done already: 201 with Location for a create, 204 for a delete. Walk SPEC.md’s status table and check each code your server sends.'],
  10: [
    'Require Authorization: Bearer on every /v1 route and /graphql. Validate the JWT: HS256 only, signature with JWT_SECRET, exp, iss and aud.',
    'Answer 401 with WWW-Authenticate, as SPEC.md says. From now on the tests sign their own tokens with the default JWT_SECRET, until you build your token endpoint (13).',
  ],
  11: [
    'Check the scope each route needs (SPEC.md’s endpoint table) and answer 403 insufficient_scope.',
    'The order ownership tests run once you build orders (concept 22).',
  ],
  12: [
    'GET /v1/me answers { clientId, scopes, plan, tokenExpiresAt }, with the plan from SPEC.md’s demo clients table.',
    'The "issues an HS256 JWT" test runs once your token endpoint (13) is built.',
  ],
  13: [
    'POST /oauth/token: the client credentials grant, Basic or form client authentication, scope narrowing, RFC 6749 errors and Cache-Control: no-store.',
    'From now on every test gets its token from your endpoint, so run all your concepts again: ./check.sh <stack> all.',
  ],
  14: ['Strict-Transport-Security only when X-Forwarded-Proto is https, never over plain HTTP.'],
  15: ['An origin allowlist from CORS_ORIGINS (default http://localhost:5173), preflight answers without a token, and the exposed headers SPEC.md lists.'],
  16: ['Check that a created product’s Location can be followed with GET, and that your paths are nouns.'],
  17: ['POST /graphql with SPEC.md’s schema, cursor paging and error codes.', 'The order query runs once you build orders (concept 22).'],
  18: ['An opaque cursor, the page object, Link rel="next" that keeps the tag filter, and 400 invalid-cursor for a cursor you did not issue.'],
  19: ['A strong ETag for one product and a weak one for a list page, 304 for If-None-Match, and 412 for a stale If-Match (strong comparison: a W/ tag never matches).'],
  20: ['A token bucket per client, sized by plan (free 5 a minute, standard 1000), RateLimit-* headers on every authenticated response, 429 with Retry-After. GET /health is never limited.'],
  21: ['GET /v1/reports/sales?delayMs=…: at most 2 running and 2 waiting, then 503 throttled with Retry-After: 1. The totals can be zero until you build orders.'],
  22: [
    'Orders first: POST and GET /v1/orders, GET one, and POST /v1/orders/{id}/pay, owned by the client that created them.',
    'Then the Idempotency-Key rules. Afterwards run the order tests that were waiting: ./check.sh <stack> 11 17 22.',
  ],
  23: [
    'Server side: GET /v1/demo/flaky (its tests are shared with concept 25).',
    'Client side: write the small typed client from SPEC.md’s "The typed client". No contract test covers it, so compare it with the reference client and test it yourself.',
  ],
  24: ['Cancel a report that runs past REQUEST_TIMEOUT_MS and answer 504 timeout at that moment. Time spent waiting in the queue does not count.'],
  25: ['The same flaky tests as concept 23. The backoff itself lives in your typed client and, later, in your webhook sender (26).'],
  26: ['Subscriptions (admin only), events for order.created and order.paid, deliveries in the background signed with HMAC-SHA256, retries with backoff, and the delivery log.'],
  27: ['GET /v1/demo/crash must become a 500 internal-error that leaks nothing, logged with the request ID. You built the format at concept 3: check every error is problem details now.'],
};
