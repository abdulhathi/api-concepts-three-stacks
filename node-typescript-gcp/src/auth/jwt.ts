// Concept 12 · Access tokens and JWT: HS256 tokens signed and verified with jose.
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Config } from '../config.js';

export interface TokenClaims {
  sub: string;
  scope: string;
  exp: number; // epoch seconds
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly config: Pick<Config, 'jwtSecret' | 'jwtIssuer' | 'jwtAudience' | 'tokenTtlSeconds'>) {
    this.key = new TextEncoder().encode(config.jwtSecret);
  }

  get ttlSeconds(): number {
    return this.config.tokenTtlSeconds;
  }

  async issue(clientId: string, scopes: string[]): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
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

  /** Throws unless signature, algorithm, expiry (no leeway), issuer and audience are all valid. */
  async verify(token: string): Promise<TokenClaims> {
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: this.config.jwtIssuer,
      audience: this.config.jwtAudience,
      clockTolerance: 0,
      requiredClaims: ['sub', 'exp', 'iat', 'jti'],
    });
    return {
      sub: String(payload.sub),
      scope: typeof payload.scope === 'string' ? payload.scope : '',
      exp: payload.exp as number,
    };
  }
}
