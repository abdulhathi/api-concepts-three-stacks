# Bookshop API: Node.js, TypeScript and Express 5 on Google Cloud Run

One of three implementations of the same HTTP contract (see `SPEC.md` in the repo root). It covers 27 API concepts,
from headers and status codes to rate limiting, idempotency and signed webhooks, with small modules you can read in
one sitting. Storage is in memory, so it runs with no database, no Docker and no cloud account.

- **Stack:** Node.js 22+, TypeScript (strict, ESM), Express 5, zod, jose, graphql + graphql-http
- **Cloud:** Google Cloud Run (container), Artifact Registry, Cloud Build, Secret Manager
- **Port:** 8002
- **Concept map:** [CONCEPTS.md](CONCEPTS.md) links every concept to its code, its tests and a curl command

Rate limiting, throttling, idempotency and ETags are written by hand (no rate-limit package) so the mechanisms are
visible. The OpenAPI document is generated from the zod schemas that validate requests, so the two cannot drift apart.

## Run

```bash
npm install
npm run dev          # tsx watch, http://localhost:8002
```

Production build:

```bash
npm run build && npm start
```

Configuration comes from environment variables (`PORT`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`,
`TOKEN_TTL_SECONDS`, `CORS_ORIGINS`, `REQUEST_TIMEOUT_MS`, `WEBHOOK_RETRY_BASE_MS`, `WEBHOOK_MAX_ATTEMPTS`). Defaults are
in [src/config.ts](src/config.ts). The default `JWT_SECRET` is for local use only.

## Test

```bash
npm test             # vitest + supertest, in process, ~80 tests
npm run typecheck    # tsc --noEmit, strict mode
```

Every concept has at least one test, and test names start with the concept number (`20 the free plan allows 5
requests then 429 ...`). Tests start the real Express app on an ephemeral localhost port with fresh in-memory state.

## Try it

Interactive docs: http://localhost:8002/docs (Swagger UI, loaded from a CDN) and the raw document at `/openapi.json`.

Get a token with the OAuth client credentials grant, then call the API:

```bash
TOKEN=$(curl -s -u admin:admin-secret -d grant_type=client_credentials \
  localhost:8002/oauth/token | jq -r .access_token)

curl -s localhost:8002/v1/me -H "Authorization: Bearer $TOKEN" | jq
curl -s "localhost:8002/v1/products?limit=3" -H "Authorization: Bearer $TOKEN" | jq .page
curl -si localhost:8002/v1/products/prd_01 -H "Authorization: Bearer $TOKEN"     # note the ETag
curl -si localhost:8002/v1/products/nope -H "Authorization: Bearer $TOKEN"        # a 404 problem+json
```

Place an order twice with the same `Idempotency-Key` and watch the second answer carry `Idempotent-Replayed: true`:

```bash
for i in 1 2; do
  curl -si -X POST localhost:8002/v1/orders \
    -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' \
    -d '{"items":[{"productId":"prd_01","quantity":2}]}' | grep -iE '^(HTTP|idempotent|location)'
done
```

Run the retry demo (the client retries two planned 503s with backoff and prints each delay):

```bash
npm run example:retry
```

Demo clients (development only; see [src/auth/clients.ts](src/auth/clients.ts)):

| client_id | client_secret | scopes | plan |
|---|---|---|---|
| `reader` | `reader-secret` | products:read orders:read | standard |
| `writer` | `writer-secret` | products:read products:write orders:read orders:write | standard |
| `partner` | `partner-secret` | same as writer | standard |
| `admin` | `admin-secret` | writer scopes + admin | standard |
| `free` | `free-secret` | products:read | free (5 requests per minute) |

## Project layout

```text
src/
  index.ts              entry point: listen, graceful shutdown on SIGTERM
  app.ts                composition root: middleware order and routes
  config.ts             environment variables
  http/                 cross-cutting: request id, security headers, CORS, body parsing, problem+json,
                        validation, ETag helpers, cursor pagination, request log
  auth/                 JWT (jose), OAuth token endpoint, authenticate + requireScope, demo clients
  limits/               token bucket rate limiter, concurrency throttle with FIFO queue
  idempotency.ts        Idempotency-Key store
  products/ orders/     schemas (zod), repository interfaces + in-memory versions, routes, order service
  reports/              throttled, time-limited report endpoint
  demo/                 /v1/me, /v1/echo, flaky and crash endpoints
  webhooks/             subscriptions, HMAC signing and verification, background dispatcher with backoff
  graphql/              SDL schema, resolvers, graphql-http handler
  openapi/              OpenAPI document generated from the zod schemas, /docs page
  client/               typed client: token cache, per-attempt timeout, retries, backoff
examples/retry-flaky.ts demo script for the client
tests/                  vitest + supertest, one or more tests per concept
infra/gcp/              deploy.sh and cloudbuild.yaml
Dockerfile              multi-stage, node:24-slim, non-root
```

## HTTPS

The app speaks plain HTTP on `PORT`. TLS ends at the cloud edge: Cloud Run terminates HTTPS and forwards
`X-Forwarded-Proto: https`, which is what makes the app send `Strict-Transport-Security`. Locally you will not see HSTS
unless you send that header yourself.

## Deploy to Google Cloud Run

Prerequisites: a Google Cloud project with billing enabled, the `gcloud` CLI signed in (`gcloud auth login`), and
`openssl`. The container is built remotely by Cloud Build, so you do not need Docker locally.

```bash
# 1. Pick the project and (optionally) region
export PROJECT_ID=my-project-id
export REGION=us-central1

# 2. One command: enables APIs, creates the Artifact Registry repo, stores JWT_SECRET in Secret Manager,
#    builds the image with Cloud Build and deploys to Cloud Run
./infra/gcp/deploy.sh

# 3. Smoke test the deployed service
URL=$(gcloud run services describe bookshop-api --region "$REGION" --format 'value(status.url)')
curl -s "$URL/health"
open "$URL/docs"
```

What the script does, step by step:

1. `gcloud services enable` for Cloud Run, Artifact Registry, Cloud Build and Secret Manager.
2. `gcloud artifacts repositories create bookshop` (Docker format) if it does not exist.
3. Creates the Secret Manager secret `bookshop-jwt-secret` with a random 48-byte value, and lets the Cloud Run runtime
   service account read it.
4. `gcloud builds submit --config infra/gcp/cloudbuild.yaml`: runs typecheck and tests, builds the image, pushes it to
   Artifact Registry.
5. `gcloud run deploy` with `--set-secrets JWT_SECRET=bookshop-jwt-secret:latest`, `--min-instances 0`,
   `--max-instances 1`, `--concurrency 80`, `--timeout 30s`.

Override defaults with environment variables (`SERVICE`, `REPO`, `CORS_ORIGINS`, `MIN_INSTANCES`, `MAX_INSTANCES`).
Rotate the secret with `gcloud secrets versions add bookshop-jwt-secret --data-file=-` and redeploy. To remove
everything: `gcloud run services delete bookshop-api --region "$REGION"`.

## Production notes

This is a teaching implementation. Moving it to production means replacing the in-memory parts with managed services.

- **In-memory store to a managed database.** Products, orders and webhook subscriptions sit behind repository
  interfaces. Implement them on **Firestore** (document model, serverless, good fit for Cloud Run) or **Cloud SQL for
  PostgreSQL** (relational, transactions). Cursor pagination already uses keyset ordering, which maps to
  `orderBy(createdAt, id).startAfter(...)`.
- **Per-instance rate-limit and idempotency state to a shared cache.** The token buckets and idempotency keys live in each
  instance's memory, so with several instances every instance enforces its own limit and a retry that lands elsewhere
  would not be recognised. Move both to **Memorystore for Redis** (atomic `INCR`/Lua for buckets, `SET NX EX` for
  idempotency keys). That is also why `deploy.sh` caps the demo at one instance.
- **Background webhook delivery to a queue.** Cloud Run throttles CPU after the response is sent unless CPU is always
  allocated (`--no-cpu-throttling`), so the in-process delivery loop and its retry timers can stall or die with the
  instance. Publish events to **Cloud Tasks** (per-delivery retries with backoff and rate control) or **Pub/Sub** (push
  subscription to a delivery worker), and let that service own the attempt log. Validate subscription URLs against
  SSRF (block private and metadata addresses) before delivering.
- **Demo clients to a real identity provider.** The hard-coded client secrets are for demos only. Use **Identity Platform**
  or another OIDC provider for client credentials, publish keys through JWKS and switch from HS256 to RS256/ES256 so
  resource servers never hold a signing secret. Keep `JWT_SECRET` in **Secret Manager** (as `deploy.sh` does).
- **Edge protection.** Put **Cloud Armor** (WAF, coarse IP rate limits) in front through an external HTTPS load
  balancer, and let the in-app limiter handle per-client plans.
- **Observability.** The JSON request log goes to stdout, which **Cloud Logging** ingests; mapping `level` to `severity`
  and adding trace ids would make entries filterable. Add **Cloud Monitoring** alerts on 5xx and latency.
- **GraphQL hardening.** Add query depth and cost limits, and mask internal resolver errors before exposing GraphQL
  publicly.
