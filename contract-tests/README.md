# Contract tests

One black-box suite that runs against any of the three servers, so all three stacks are held to the same
[`SPEC.md`](../SPEC.md). It talks to the server only over HTTP, and it never imports server code.

```bash
npm install
./run.sh python    # or node, or dotnet: builds, starts the server, runs the suite, stops the server
```

To run against a server you started yourself:

```bash
API_URL=http://127.0.0.1:8002 npx vitest run
```

The server must run with `WEBHOOK_RETRY_BASE_MS=100` (as `run.sh` does) for the webhook retry test to finish quickly.
Test names start with the concept number they check, from `1 · Requests and responses` to `27 · Error handling`.

| File | Concepts |
|---|---|
| [`basics.test.ts`](src/basics.test.ts) | 1–9: requests, endpoints, methods, headers, parameters, bodies, JSON, schemas, status codes |
| [`security.test.ts`](src/security.test.ts) | 10–15: authentication, authorization, JWT, OAuth 2.0, HTTPS, CORS |
| [`styles.test.ts`](src/styles.test.ts) | 16–19: REST, GraphQL, pagination, caching |
| [`reliability.test.ts`](src/reliability.test.ts) | 20–25: rate limiting, throttling, idempotency, retries, timeouts, backoff |
| [`webhooks-errors.test.ts`](src/webhooks-errors.test.ts) | 26–27: webhooks, error handling |
