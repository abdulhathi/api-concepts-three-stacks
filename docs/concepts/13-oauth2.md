# 13 · OAuth 2.0

OAuth 2.0 is a standard (RFC 6749) for getting an access token; this repo uses its client credentials grant, where a program logs in as itself.

## Why it matters

- A client never has to send its long-lived secret on every call. It trades the secret for a short-lived token once.
- A standard flow means standard libraries, standard errors and no custom login endpoint to get wrong.
- Scopes let one client ask for less than it is allowed.

## How it works

OAuth defines several grants. **Client credentials** (RFC 6749 section 4.4) is for machine-to-machine calls with no user: the client authenticates with its id and secret and receives a token. Grants that involve a person, such as authorization code with PKCE, are not part of this repo.

```mermaid
sequenceDiagram
    participant C as Client
    participant T as POST /oauth/token
    participant A as API (/v1/...)
    C->>T: grant_type=client_credentials + Basic reader:reader-secret
    T-->>C: 200 {access_token, token_type: Bearer, expires_in: 900, scope}
    C->>A: GET /v1/products + Authorization: Bearer access_token
    A-->>C: 200 products
```

```http
POST /oauth/token HTTP/1.1
Authorization: Basic cmVhZGVyOnJlYWRlci1zZWNyZXQ=
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=products:read
```

```http
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json

{"access_token":"eyJhbGciOiJIUzI1NiIs...","token_type":"Bearer","expires_in":900,"scope":"products:read"}
```

## The rule in this repo

- `POST /oauth/token`, form-encoded, `grant_type=client_credentials`, optional `scope` (space-separated). Omit `scope` to get all of the client's scopes.
- Client authentication is HTTP Basic (`client_secret_basic`) or `client_id` and `client_secret` in the form (`client_secret_post`).
- Errors use the RFC 6749 shape `{ "error", "error_description" }`, not problem+json: `invalid_client` is 401 with `WWW-Authenticate: Basic realm="api-concepts"`; `invalid_request`, `unsupported_grant_type` and `invalid_scope` are 400.
- Responses carry `Cache-Control: no-store`. There is no refresh token, which RFC 6749 section 4.4.3 says should not be issued for this grant.
- The five demo clients (`reader`, `writer`, `partner`, `admin`, `free`) are for development only.

## Side by side

### Python · FastAPI
The handler reads the form itself and authenticates the client first. The excerpt checks the grant type and the scopes.

```python
    if grant_type != "client_credentials":
        return _oauth_error("unsupported_grant_type", "Only client_credentials is supported.", 400)

    requested = form.get("scope", "").split()
    granted = requested or list(client.scopes)
    missing = [s for s in granted if s not in client.scopes]
    if missing:
        return _oauth_error("invalid_scope", f"Scope not allowed: {' '.join(missing)}.", 400)
```
[`app/auth/oauth.py` lines 98-105](../../python-fastapi-aws/app/auth/oauth.py#L98-L105)

### TypeScript · Express
Express parses the form with `express.urlencoded`. The excerpt checks the scopes and sends the success response.

```ts
    const asked = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
    const requested = asked.length > 0 ? asked : client.scopes;
    const denied = requested.filter((scope) => !client.scopes.includes(scope));
    if (denied.length > 0) return oauthError(res, 'invalid_scope', `Scope not allowed: ${denied.join(' ')}.`);

    res.json({
      access_token: await tokens.issue(client.clientId, requested),
      token_type: 'Bearer',
      expires_in: tokens.ttlSeconds,
      scope: requested.join(' '),
    });
  });
```
[`src/auth/oauth.ts` lines 57-68](../../node-typescript-gcp/src/auth/oauth.ts#L57-L68)

### C# · ASP.NET Core
The handler uses `ReadFormAsync`. It is hand-written, without an OAuth package, since only this one grant is needed. The excerpt issues the token.

```csharp
        var issued = tokens.Issue(client, granted);
        return Results.Json(new Dictionary<string, object>
        {
            ["access_token"] = issued.AccessToken,
            ["token_type"] = "Bearer",
            ["expires_in"] = issued.ExpiresIn,
            ["scope"] = issued.Scope,
        });
```
[`src/ApiConcepts.Api/Auth/OAuthEndpoints.cs` lines 62-69](../../dotnet-azure/src/ApiConcepts.Api/Auth/OAuthEndpoints.cs#L62-L69)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq
curl -si -u reader:wrong -d grant_type=client_credentials http://localhost:8001/oauth/token | head -5     # 401 invalid_client
curl -s -u reader:reader-secret -d grant_type=client_credentials -d scope=admin http://localhost:8001/oauth/token | jq   # invalid_scope
```

## In the cloud

- **AWS:** Amazon Cognito user pools support the client credentials grant through resource servers and app clients with scopes.
- **GCP:** Apigee can act as the OAuth 2.0 authorization server and issue client-credentials tokens for your API. Without Apigee, use a third-party identity provider, or service account identity tokens for Cloud Run IAM.
- **Azure:** Microsoft Entra ID supports client credentials natively, with app registrations and app roles.

## Common mistakes

- Sending client credentials in the query string. Use the `Authorization` header or the POST body.
- Letting browsers or mobile apps hold a client secret. They cannot keep it secret; use a flow with a user and PKCE.
- Caching `invalid_client` responses or forgetting `Cache-Control: no-store` on token responses.

## Interview questions

<details><summary>Which OAuth grant fits a server calling another server?</summary>Client credentials. There is no user, so the client authenticates as itself and gets a token for its own permissions.</details>
<details><summary>What is the difference between OAuth 2.0 and authentication?</summary>OAuth 2.0 is about authorization: it hands out access tokens. Login of a person is added by OpenID Connect, which builds on OAuth 2.0.</details>
<details><summary>Why are errors from /oauth/token not problem+json?</summary>RFC 6749 section 5.2 defines the error format for the token endpoint, and OAuth libraries expect it. Everything else in the API uses RFC 9457.</details>

← [previous](12-access-tokens-and-jwt.md) · [all concepts](../README.md) · [next](14-https.md) →
