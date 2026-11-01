import type { Practice } from '../../practice/types';

// Fixed tokens for the failure steps. Each one was built from the same claims (sub reader, iat 2026-01-01 12:00 UTC,
// exp 2100-01-01 unless said otherwise) and signed with the default JWT_SECRET from SPEC.md, then broken in one way.
const PAYLOAD_2100 =
  'eyJpc3MiOiJhcGktY29uY2VwdHMiLCJhdWQiOiJhcGktY29uY2VwdHMtY2xpZW50cyIsInN1YiI6InJlYWRlciIsInNjb3BlIjoicHJvZHVjdHM6cmVhZCBvcmRlcnM6cmVhZCIsImlhdCI6MTc2NzI2ODgwMCwiZXhwIjo0MTAyNDQ0ODAwLCJqdGkiOiI0ZjZjMWI3ZS05YTUzLTRjMGItOGQ2MS0yZjBmM2QxZjZhMTEifQ';
const PAYLOAD_2100_ADMIN =
  'eyJpc3MiOiJhcGktY29uY2VwdHMiLCJhdWQiOiJhcGktY29uY2VwdHMtY2xpZW50cyIsInN1YiI6InJlYWRlciIsInNjb3BlIjoicHJvZHVjdHM6cmVhZCBvcmRlcnM6cmVhZCBhZG1pbiIsImlhdCI6MTc2NzI2ODgwMCwiZXhwIjo0MTAyNDQ0ODAwLCJqdGkiOiI0ZjZjMWI3ZS05YTUzLTRjMGItOGQ2MS0yZjBmM2QxZjZhMTEifQ';
const HS256 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

/** The payload edited to add admin, with the signature of the original payload. */
const TAMPERED = `${HS256}.${PAYLOAD_2100_ADMIN}.X0DuGqqRRaT5Ao6-TIzuhxyqF10hpR4prgDDvyiu4UA`;
/** Header {"alg":"none"} and an empty signature. */
const ALG_NONE = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${PAYLOAD_2100}.`;
/** Signed with the real secret, but with HS384. */
const HS384 = `eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.${PAYLOAD_2100}.clyC2X6vwS59bJwLH1BCVr0iBlX7U7HjIF8d--2l9PfrTz5hxUW8w6VFidj1oz9r`;
/** The guide's example token: exp 2026-01-01 12:15 UTC, correctly signed. */
const EXPIRED =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGktY29uY2VwdHMiLCJhdWQiOiJhcGktY29uY2VwdHMtY2xpZW50cyIsInN1YiI6InJlYWRlciIsInNjb3BlIjoicHJvZHVjdHM6cmVhZCBvcmRlcnM6cmVhZCIsImlhdCI6MTc2NzI2ODgwMCwiZXhwIjoxNzY3MjY5NzAwLCJqdGkiOiI0ZjZjMWI3ZS05YTUzLTRjMGItOGQ2MS0yZjBmM2QxZjZhMTEifQ.DMp9AudqidYqnQwm7xE9GXwBGtbhaAnJJEmLd97wfAk';
/** aud is "another-api", correctly signed. */
const WRONG_AUD =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGktY29uY2VwdHMiLCJhdWQiOiJhbm90aGVyLWFwaSIsInN1YiI6InJlYWRlciIsInNjb3BlIjoicHJvZHVjdHM6cmVhZCBvcmRlcnM6cmVhZCIsImlhdCI6MTc2NzI2ODgwMCwiZXhwIjo0MTAyNDQ0ODAwLCJqdGkiOiI0ZjZjMWI3ZS05YTUzLTRjMGItOGQ2MS0yZjBmM2QxZjZhMTEifQ.x4YwjY68M2DP8W_0QLt31FkSR68cJA7Lbf5mGkiTYyU';
/** Correctly signed with the public development secret, with the admin scope added. */
const MINTED_ADMIN = `${HS256}.${PAYLOAD_2100_ADMIN}.FU7YrycPkAuOFfSrsvyNoSfKR-MxKHfPTuNrWN3pJ-s`;

const rejected = { status: 401, headers: { 'WWW-Authenticate': '~error="invalid_token"' }, body: { type: '/problems/unauthorized', status: 401 } };

export const practice: Practice = {
  id: 'access-tokens-and-jwt',
  intro:
    'You will get a real JWT, read its claims, and then send the server tokens that are broken in exactly one way each: an edited payload, no signature, the wrong algorithm, an old expiry, the wrong audience. Last, you will mint a token yourself with the development secret and see why that secret matters.',
  steps: [
    {
      kind: 'try',
      title: 'Get a token',
      goal: 'Ask the token endpoint for an access token as the reader client. The access_token in the answer is a JWT.',
      request: { method: 'POST', path: '/oauth/token', basic: ['reader', 'reader-secret'], form: { grant_type: 'client_credentials' } },
      expect: { status: 200, body: { access_token: '~eyJ', token_type: 'Bearer', expires_in: 900 } },
      save: { TOKEN: 'body.access_token' },
      notice: [
        'The token is three Base64URL parts joined by dots. Every JWT with this header starts with eyJ, which is the Base64 of {".',
        'Decode it in your terminal: TOKEN=$(curl -s -u reader:reader-secret -d grant_type=client_credentials http://localhost:8001/oauth/token | jq -r .access_token), then echo $TOKEN | jq -R \'split(".") | .[0], .[1] | @base64d | fromjson\'. Or paste it into a JWT decoder, but only a development token, never a real one.',
        'In the payload, exp minus iat is 900: the token lives 15 minutes. The C# token also carries nbf (not before), which its library adds by default.',
      ],
    },
    {
      kind: 'try',
      title: 'See what the server reads from it',
      goal: 'GET /v1/me answers with what the server learned from your token, without looking anything up about the token itself.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: 'Bearer {{TOKEN}}' } },
      expect: { status: 200, body: { clientId: 'reader', scopes: ['products:read', 'orders:read'], plan: 'standard', tokenExpiresAt: '*' } },
      notice: [
        'clientId is the sub claim, scopes is the scope claim split at spaces, and tokenExpiresAt is exp. Only the plan is looked up, by client id.',
        'The three servers share the same secret, issuer and audience, so a token from one works on the other two. Try it with curl.',
      ],
    },
    {
      kind: 'try',
      title: 'Edit the payload, keep the signature',
      goal: 'This token’s payload was edited to add the admin scope, and its old signature was kept. The signature no longer matches the payload.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: `Bearer ${TAMPERED}` } },
      expect: rejected,
      notice: [
        'error="invalid_token" in WWW-Authenticate means a token was sent but is not acceptable. With no token at all, the 401 has no error.',
        'All three stacks give one message for every failed check, which tells an attacker nothing about which check caught the token.',
      ],
    },
    {
      kind: 'try',
      title: 'Misuse: alg none',
      goal: 'The classic attack: a header that says alg none, and no signature at all. A server that lets the token pick its algorithm would accept it.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: `Bearer ${ALG_NONE}` } },
      expect: rejected,
      notice: [
        'The token ends with a dot and nothing after it: the signature is empty.',
        'All three servers pin HS256: algorithms=["HS256"] in PyJWT, algorithms: ["HS256"] in jose, ValidAlgorithms in ASP.NET Core.',
      ],
    },
    {
      kind: 'try',
      title: 'The right key, the wrong algorithm',
      goal: 'This token is signed with the real secret, but with HS384. The signature is genuine, and it is still refused.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: `Bearer ${HS384}` } },
      expect: rejected,
      notice: ['The server decides the algorithm, never the token. That is what pinning means: a token signed any other way is refused, even with the right key.'],
    },
    {
      kind: 'try',
      title: 'An expired token',
      goal: 'This is the example token from the guide, correctly signed with the development secret. It expired on January 1, 2026, at 12:15 UTC.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: `Bearer ${EXPIRED}` } },
      expect: rejected,
      notice: [
        'A valid signature does not save an expired token. exp is checked with no leeway in all three stacks.',
        'Decode it and compare exp with the current time: date -r 1767269700 on macOS, or date -d @1767269700 on Linux.',
      ],
    },
    {
      kind: 'try',
      title: 'A token for another audience',
      goal: 'Correctly signed and not expired, but its aud is another-api. A token meant for another API must not open this one.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: `Bearer ${WRONG_AUD}` } },
      expect: rejected,
      notice: [
        'Same 401, same header: the answer does not say that only the audience was wrong.',
        'iss is checked the same way. A token from an issuer the server does not trust is refused.',
      ],
    },
    {
      kind: 'try',
      title: 'Mint your own admin token',
      goal: 'This token was signed with the default JWT_SECRET, which anyone can read in SPEC.md. It says reader has the admin scope. Watch the server believe it.',
      request: { method: 'GET', path: '/v1/me', headers: { Authorization: `Bearer ${MINTED_ADMIN}` } },
      expect: { status: 200, body: { clientId: 'reader', 'scopes.2': 'admin', tokenExpiresAt: '~2100-01-01' } },
      notice: [
        'The server trusts whatever a correctly signed token says. reader is not allowed admin at the token endpoint, but this token never went through it.',
        'Whoever holds the secret can mint any token, with any scope and any lifetime: this one expires in 2100. Change JWT_SECRET in every real deployment.',
        'With HS256, every server that verifies tokens holds that secret. That is why many services verify with RS256 public keys instead.',
      ],
    },
    {
      kind: 'read',
      title: 'Issuing a token',
      goal: 'Each stack builds the same seven claims and signs them with HS256 and the shared secret.',
      files: {
        python: { path: 'python-fastapi-aws/app/auth/tokens.py', lines: [51, 62], note: 'PyJWT signs a plain dict of claims; exp is iat plus ttl_seconds, and jti is a fresh UUID.' },
        node: { path: 'node-typescript-gcp/src/auth/jwt.ts', lines: [23, 34], note: 'jose sets one claim per call on SignJWT, and the protected header carries alg and typ.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Auth/TokenService.cs', lines: [17, 36], note: 'JsonWebTokenHandler signs a SecurityTokenDescriptor; it also adds nbf, which the other stacks do not send.' },
      },
    },
    {
      kind: 'read',
      title: 'Validating a token',
      goal: 'Every stack pins HS256 and checks the signature, exp with no leeway, iss and aud. Find each of those settings.',
      files: {
        python: { path: 'python-fastapi-aws/app/auth/tokens.py', lines: [64, 87], note: 'algorithms, audience, issuer and leeway=0 on jwt.decode; it also refuses a sub that is not a known client.' },
        node: { path: 'node-typescript-gcp/src/auth/jwt.ts', lines: [36, 50], note: 'jwtVerify with algorithms, issuer, audience, clockTolerance 0, and requiredClaims, which also demands jti.' },
        dotnet: { path: 'dotnet-azure/src/ApiConcepts.Api/Auth/AuthSetup.cs', lines: [41, 73], note: 'TokenValidationParameters with ValidAlgorithms and ClockSkew zero; OnChallenge writes the 401 with error="invalid_token".' },
      },
    },
    {
      kind: 'think',
      title: 'A token in a log file',
      question:
        'A support engineer finds a reader access token from this API in a shared log. It was issued 3 minutes ago. What can someone do with it, for how long, and what would you change?',
      answer:
        'Anyone who copies it can act as reader, with its scopes, until exp: about 12 more minutes. This API has no revocation list, so the only way to cut that short is to rotate JWT_SECRET, which invalidates every client’s token at once. Never log Authorization headers, keep lifetimes short, and if you need to end one token early, keep a deny list of jti values until they expire.',
    },
    {
      kind: 'think',
      title: 'HS256 for ten services?',
      question: 'Ten internal services must all verify tokens from one token endpoint. Would you keep HS256 with one shared secret?',
      answer:
        'No. With HS256 every service holds the secret, so any one of them, if hacked, can mint tokens that all the others accept. Use RS256 or ES256: the token endpoint signs with a private key, and the services verify with the public key, usually fetched from a JWKS endpoint. The kid header says which key signed, which also makes key rotation possible.',
    },
    {
      kind: 'build',
      title: 'Revoke a token with a jti deny list',
      task: 'Today a token cannot be taken back before exp. Add POST /oauth/revoke (RFC 7009): an authenticated client sends a token, the server remembers its jti until the token would expire, and validation refuses any token on that list.',
      steps: [
        'Add a deny list, a map from jti to exp, to the token service: python-fastapi-aws/app/auth/tokens.py, node-typescript-gcp/src/auth/jwt.ts, or a new singleton in dotnet-azure/src/ApiConcepts.Api/Auth/ registered in AuthSetup.cs.',
        'Add POST /oauth/revoke next to the token endpoint: python-fastapi-aws/app/auth/oauth.py, node-typescript-gcp/src/auth/oauth.ts or dotnet-azure/src/ApiConcepts.Api/Auth/OAuthEndpoints.cs. Authenticate the client exactly as /oauth/token does, then read the token form field.',
        'Verify the token and put its jti on the list with its exp. Answer 200 with an empty body, even when the token is already invalid, as RFC 7009 says, so a caller learns nothing about the token.',
        'In validation, after the signature and claims pass, refuse a token whose jti is on the list with the usual 401. In C#, do it in JwtBearerEvents.OnTokenValidated with context.Fail.',
        'Drop entries whose exp has passed, so the list stays small.',
        'Restart your server and press Check. Then prove it in a terminal: get a token, call GET /v1/me with it (200), revoke it, and call again (401).',
      ],
      hints: [
        'Store only the jti and the exp. Keeping whole tokens wastes memory and keeps credentials you do not need.',
        'One client must not revoke another client’s tokens: compare the token’s sub with the client that authenticated.',
        'With several server copies the list must be shared, like the idempotency store: Redis with a time to live equal to the token’s remaining life is a common choice.',
      ],
      check: {
        request: { method: 'POST', path: '/oauth/revoke', basic: ['reader', 'reader-secret'], form: { token: '{{TOKEN}}' } },
        expect: { status: 200 },
      },
      command: 'cd contract-tests && ./run.sh python   # or node, dotnet: the contract tests must still pass',
      undo: 'git restore python-fastapi-aws node-typescript-gcp dotnet-azure   (from APIConcepts/), or keep your change on a branch',
    },
  ],
};
