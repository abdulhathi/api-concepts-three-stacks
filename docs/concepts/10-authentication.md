# 10 · Authentication

Authentication is proving who is calling; here the caller sends a bearer token and the server checks that it is valid.

## Why it matters

- Without it, anyone who finds the URL can read and change your data.
- Rate limits, audit logs and ownership rules all need to know which client made the call.
- A bad 401 (no hint, wrong header) leaves client developers guessing whether the token or the URL is wrong.

## How it works

The client first gets a token (see [13 · OAuth 2.0](13-oauth2.md)), then sends it on every call in the `Authorization` header using the Bearer scheme (RFC 6750). The server verifies the token and learns the caller from its claims. If the check fails, the server answers `401` and a `WWW-Authenticate` challenge (RFC 9110) that says what it expected.

```http
GET /v1/me HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"clientId":"reader","scopes":["products:read","orders:read"],"plan":"standard","tokenExpiresAt":"2026-01-01T12:15:00.000Z"}
```

With no token the answer is a challenge:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="api-concepts"
Content-Type: application/problem+json

{"type":"/problems/unauthorized","title":"Authentication is required","status":401,"detail":"...","instance":"/v1/me","requestId":"..."}
```

## The rule in this repo

- Every `/v1` and `/graphql` route needs `Authorization: Bearer <jwt>`.
- Missing token: `401` with `WWW-Authenticate: Bearer realm="api-concepts"`.
- Token sent but rejected (bad signature, expired, wrong issuer or audience): `401` with `, error="invalid_token"` added to the challenge.
- A 401 is not counted against the rate limit. Authentication runs before rate limiting.
- Public routes are `/`, `/health`, `/openapi.json`, `/docs` and `/oauth/token`.

## Side by side

### Python · FastAPI
A dependency factory, `require()`, reads the token through `HTTPBearer(auto_error=False)` so the code can raise its own problem instead of FastAPI's default. The excerpt is the verify step.

```python
        try:
            principal = container.tokens.verify(credentials.credentials)
        except TokenError as exc:
            # The client learns only that the token was rejected, never which check failed.
            raise Problem(
                "unauthorized",
                "The access token is missing, expired or invalid.",
                headers={"WWW-Authenticate": f'{REALM}, error="invalid_token"'},
            ) from exc
```
[`app/auth/dependencies.py` lines 42-50](../../python-fastapi-aws/app/auth/dependencies.py#L42-L50)

### TypeScript · Express
An `authenticate` middleware checks the header with a regex and verifies the JWT with `jose`. The excerpt is the failure branch.

```ts
      req.principal = principal;
      next();
    } catch {
      throw new ApiProblem('unauthorized', 'The access token is missing, expired or invalid.', {
        headers: { 'WWW-Authenticate': `${REALM}, error="invalid_token"` },
      });
    }
```
[`src/auth/authenticate.ts` lines 27-33](../../node-typescript-gcp/src/auth/authenticate.ts#L27-L33)

### C# · ASP.NET Core
The built-in JwtBearer handler validates the token. The `OnChallenge` event replaces the default empty 401 with a problem document and the right header.

```csharp
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                var rejected = context.AuthenticateFailure is not null;
                var challenge = rejected
                    ? $"Bearer realm=\"{Realm}\", error=\"invalid_token\""
                    : $"Bearer realm=\"{Realm}\"";
                await ProblemWriter.WriteAsync(
                    context.HttpContext,
                    ProblemType.Unauthorized,
                    rejected ? "The access token is invalid or expired." : "A bearer access token is required.",
                    headers: new Dictionary<string, string> { ["WWW-Authenticate"] = challenge });
            },
```
[`src/ApiConcepts.Api/Auth/AuthSetup.cs` lines 57-71](../../dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs#L57-L71)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
curl -si localhost:8001/v1/me | head -5                                   # 401 and WWW-Authenticate
curl -si localhost:8001/v1/me -H 'Authorization: Bearer not.a.token' | grep -i www-authenticate
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
curl -s localhost:8001/v1/me -H "Authorization: Bearer $TOKEN" | jq
```

## In the cloud

- **AWS:** API Gateway HTTP APIs have JWT authorizers that check the token at the edge (issuer, audience, signature) before Lambda runs. Cognito or any OIDC provider can issue the tokens.
- **GCP:** Cloud Run can require Google-issued ID tokens through IAM, and API Gateway can validate JWTs from an issuer you configure.
- **Azure:** App Service Authentication ("Easy Auth") with Microsoft Entra ID validates tokens before your code, and API Management has a `validate-jwt` policy.

## Common mistakes

- Returning `403` or `200` for a missing token. A missing or bad credential is `401`.
- Putting tokens in the URL (`?access_token=...`). URLs are logged.
- Giving different error text for "unknown user" and "wrong password", which helps attackers enumerate accounts.

## Interview questions

<details><summary>What is the difference between authentication and authorization?</summary>Authentication asks who you are. Authorization asks what you may do. In this API, 401 is the first and 403 is the second.</details>
<details><summary>Why use a bearer token and not send a password each time?</summary>The token is short-lived (15 minutes here), limited to some scopes and can be revoked or allowed to expire. A leaked password gives access until someone changes it.</details>
<details><summary>What does "bearer" mean?</summary>Whoever holds ("bears") the token can use it. Nothing else proves identity, so tokens must travel only over HTTPS and stay out of logs.</details>

← [previous](09-status-codes.md) · [all concepts](../README.md) · [next](11-authorization.md) →
