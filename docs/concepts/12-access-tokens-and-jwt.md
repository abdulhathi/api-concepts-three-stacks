# 12 · Access tokens and JWT

An access token is a short-lived string that proves a client was granted access, and a JWT is a token format that carries signed claims inside it.

## Why it matters

- A self-contained token lets any server instance check a caller without a database lookup.
- Signing makes the token tamper-proof. Without it, a client could edit its own scopes.
- Loose validation (accepting `alg: none`, skipping `exp`) turns a security feature into a hole.

## How it works

A JWT (RFC 7519) has three Base64URL parts joined by dots: header, payload, signature. The signature is computed over the first two parts with a secret (HS256 means HMAC-SHA-256, per RFC 7518). The payload is only encoded, not encrypted, so anyone can read it. Never put secrets in it.

Header and payload of a token from this API, decoded:

```json
{ "alg": "HS256", "typ": "JWT" }
```

```json
{
  "iss": "api-concepts",
  "aud": "api-concepts-clients",
  "sub": "reader",
  "scope": "products:read orders:read",
  "iat": 1767268800,
  "exp": 1767269700,
  "jti": "4f6c1b7e-9a53-4c0b-8d61-2f0f3d1f6a11"
}
```

`iss` is who issued it, `aud` who it is for, `sub` the client, `iat` and `exp` the issue and expiry times in seconds since 1970, and `jti` a unique id for this token.

## The rule in this repo

- HS256 only, with `typ: JWT` in the header and the claims above. `exp` is `iat` plus `TOKEN_TTL_SECONDS` (default 900).
- Validation checks the signature, the algorithm (HS256 only), `exp` with no leeway, `iss` and `aud`.
- The secret is `JWT_SECRET` (at least 32 bytes). The default is for development only.
- Any failure becomes a `401` (see [10 · Authentication](10-authentication.md)). The response does not say which check failed.
- There is no refresh token and no revocation list. A token is good until it expires.

## Side by side

### Python · FastAPI
PyJWT signs the claims. Pinning `algorithms` on decode blocks the `alg: none` and algorithm-confusion attacks.

```python
        claims = {
            "iss": self._issuer,
            "aud": self._audience,
            "sub": client.client_id,
            "scope": " ".join(scopes),
            "iat": int(issued_at.timestamp()),
            "exp": int((issued_at + timedelta(seconds=self.ttl_seconds)).timestamp()),
            "jti": str(uuid.uuid4()),
        }
        return jwt.encode(claims, self._secret, algorithm=self.ALGORITHM, headers={"typ": "JWT"})
```
[`app/auth/tokens.py` lines 53-62](../../python-fastapi-aws/app/auth/tokens.py#L53-L62)

### TypeScript · Express
`jose` builds the token with a fluent API, one claim per call.

```ts
    return new SignJWT({ scope: scopes.join(' ') })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.jwtIssuer)
      .setAudience(this.config.jwtAudience)
      .setSubject(clientId)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.config.tokenTtlSeconds)
      .setJti(randomUUID())
      .sign(this.key);
  }
```
[`src/auth/jwt.ts` lines 25-34](../../node-typescript-gcp/src/auth/jwt.ts#L25-L34)

### C# · ASP.NET Core
`JsonWebTokenHandler` signs a descriptor. Validation is configured in `AuthSetup.cs` ([line 41](../../dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs#L41)).

```csharp
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = settings.JwtIssuer,
            Audience = settings.JwtAudience,
            IssuedAt = now,
            Expires = now + settings.TokenTtl,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = client.Id,
                ["scope"] = scope,
                ["jti"] = Guid.NewGuid().ToString(),
            },
            SigningCredentials = new SigningCredentials(SigningKey(settings), SecurityAlgorithms.HmacSha256),
        };
        return new IssuedToken(_handler.CreateToken(descriptor), (int)settings.TokenTtl.TotalSeconds, scope);
```
[`src/ApiConcepts.Api/Auth/TokenService.cs` lines 21-35](../../dotnet-azure/src/ApiConcepts.Api/Auth/TokenService.cs#L21-L35)

## Try it

Any stack works; these commands use the Python server on port 8001.

```bash
TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token)
echo $TOKEN | jq -R 'split(".") | .[0], .[1] | @base64d | fromjson'     # header and payload
BAD=$(echo $TOKEN | awk -F. '{print $1"."$2"A."$3}')     # edit the payload, keep the old signature
curl -s localhost:8001/v1/me -H "Authorization: Bearer $BAD" | jq .status   # 401
```

## In the cloud

- **AWS:** Amazon Cognito issues and signs JWTs and publishes the public keys. Keep a shared secret like `JWT_SECRET` in Secrets Manager.
- **GCP:** Identity Platform or Firebase Authentication issue JWTs signed with rotating RSA keys. Keep secrets in Secret Manager.
- **Azure:** Microsoft Entra ID issues signed JWTs. This repo keeps `JWT_SECRET` in Key Vault.

## Common mistakes

- Reading the algorithm from the token header and trusting it. Pin the allowed algorithm on the server.
- Long lifetimes. A stolen token works until `exp`, so keep it short.
- Treating the payload as secret. Base64URL is not encryption.

## Interview questions

<details><summary>Is a JWT encrypted?</summary>Usually not. A signed JWT (a JWS, RFC 7515) is readable by anyone and only protected from changes. Encrypted JWTs (JWE, RFC 7516) exist but are less common.</details>
<details><summary>HS256 or RS256?</summary>HS256 uses one shared secret to sign and verify, so every verifier can also mint tokens. RS256 signs with a private key and verifies with a public key, which suits many services and an outside identity provider.</details>
<details><summary>How do you revoke a JWT?</summary>You mostly cannot before `exp`. Use short lifetimes, and where needed keep a deny list of `jti` values or rotate the signing key.</details>

← [previous](11-authorization.md) · [all concepts](../README.md) · [next](13-oauth2.md) →
