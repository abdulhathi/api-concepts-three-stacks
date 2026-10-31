// Concept 13 · OAuth 2.0: the registry of demo clients. Dev only; production uses an identity provider.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Plan } from './principal.js';

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  plan: Plan;
}

const RW = ['products:read', 'products:write', 'orders:read', 'orders:write'];

export const DEMO_CLIENTS: OAuthClient[] = [
  { clientId: 'reader', clientSecret: 'reader-secret', scopes: ['products:read', 'orders:read'], plan: 'standard' },
  { clientId: 'writer', clientSecret: 'writer-secret', scopes: RW, plan: 'standard' },
  { clientId: 'partner', clientSecret: 'partner-secret', scopes: RW, plan: 'standard' },
  { clientId: 'admin', clientSecret: 'admin-secret', scopes: [...RW, 'admin'], plan: 'standard' },
  { clientId: 'free', clientSecret: 'free-secret', scopes: ['products:read'], plan: 'free' },
];

export class ClientRegistry {
  private readonly byId: Map<string, OAuthClient>;

  constructor(clients: OAuthClient[] = DEMO_CLIENTS) {
    this.byId = new Map(clients.map((client) => [client.clientId, client]));
  }

  find(clientId: string): OAuthClient | undefined {
    return this.byId.get(clientId);
  }

  /** Returns the client when the secret matches. Hashing first makes the comparison constant-time for any length. */
  authenticate(clientId: string, secret: string): OAuthClient | undefined {
    const client = this.byId.get(clientId);
    const digest = (value: string) => createHash('sha256').update(value).digest();
    const expected = digest(client?.clientSecret ?? '');
    const matches = timingSafeEqual(expected, digest(secret));
    return client && matches ? client : undefined;
  }
}
