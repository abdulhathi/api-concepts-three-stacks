// Concepts 10 and 11 · Authentication (Bearer token, 401) and authorization (scopes, 403).
import type { RequestHandler } from 'express';
import { ApiProblem } from '../http/problem.js';
import type { ClientRegistry } from './clients.js';
import type { TokenService } from './jwt.js';
import { hasScope, type Principal } from './principal.js';

const REALM = 'Bearer realm="api-concepts"';

export function authenticate(tokens: TokenService, clients: ClientRegistry): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('Authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      throw new ApiProblem('unauthorized', 'Send an access token as Authorization: Bearer <token>.', {
        headers: { 'WWW-Authenticate': REALM },
      });
    }
    try {
      const claims = await tokens.verify(match[1]!);
      const principal: Principal = {
        clientId: claims.sub,
        scopes: claims.scope.split(' ').filter(Boolean),
        plan: clients.find(claims.sub)?.plan ?? 'standard',
        tokenExpiresAt: claims.exp * 1000,
      };
      req.principal = principal;
      next();
    } catch {
      throw new ApiProblem('unauthorized', 'The access token is missing, expired or invalid.', {
        headers: { 'WWW-Authenticate': `${REALM}, error="invalid_token"` },
      });
    }
  };
}

/** Route guard: the token must carry `scope`, otherwise 403 with the scope that was needed. */
export function requireScope(scope: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.principal || !hasScope(req.principal, scope)) {
      throw new ApiProblem('forbidden', `This operation needs the ${scope} scope.`, {
        headers: { 'WWW-Authenticate': `${REALM}, error="insufficient_scope", scope="${scope}"` },
      });
    }
    next();
  };
}

export function principalOf(req: { principal?: Principal }): Principal {
  if (!req.principal) throw new Error('principalOf called on an unauthenticated request');
  return req.principal;
}
