// Concept 13 · OAuth 2.0: client credentials grant at POST /oauth/token (RFC 6749).
import express, { Router, type Request, type Response } from 'express';
import type { ClientRegistry } from './clients.js';
import type { TokenService } from './jwt.js';

type OAuthError = 'invalid_client' | 'invalid_request' | 'invalid_scope' | 'unsupported_grant_type';

function oauthError(res: Response, error: OAuthError, description: string): void {
  if (error === 'invalid_client') {
    res.setHeader('WWW-Authenticate', 'Basic realm="api-concepts"');
    res.status(401);
  } else {
    res.status(400);
  }
  res.json({ error, error_description: description });
}

/** client_secret_basic first, then client_secret_post. */
function readClientCredentials(req: Request): { id: string; secret: string } | undefined {
  const basic = /^Basic\s+(\S+)$/i.exec(req.get('Authorization') ?? '');
  if (basic) {
    const decoded = Buffer.from(basic[1]!, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon < 0) return undefined;
    return {
      id: decodeURIComponent(decoded.slice(0, colon)),
      secret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  }
  const { client_id: id, client_secret: secret } = (req.body ?? {}) as Record<string, unknown>;
  return typeof id === 'string' && typeof secret === 'string' ? { id, secret } : undefined;
}

export function oauthRouter(tokens: TokenService, clients: ClientRegistry): Router {
  const router = Router();

  router.post('/token', express.urlencoded({ extended: false }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (typeof body.grant_type !== 'string') {
      return oauthError(res, 'invalid_request', 'grant_type is required.');
    }
    if (body.grant_type !== 'client_credentials') {
      return oauthError(res, 'unsupported_grant_type', 'Only client_credentials is supported.');
    }

    let credentials: ReturnType<typeof readClientCredentials>;
    try {
      credentials = readClientCredentials(req);
    } catch {
      credentials = undefined; // undecodable percent-encoding in the Basic header
    }
    const client = credentials && clients.authenticate(credentials.id, credentials.secret);
    if (!client) return oauthError(res, 'invalid_client', 'Client authentication failed.');

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

  return router;
}
