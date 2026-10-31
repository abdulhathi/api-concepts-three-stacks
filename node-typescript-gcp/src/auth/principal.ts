export type Plan = 'free' | 'standard';

/** The authenticated caller, built from a verified access token. */
export interface Principal {
  clientId: string;
  scopes: string[];
  plan: Plan;
  tokenExpiresAt: number; // epoch ms
}

export const hasScope = (principal: Principal, scope: string): boolean => principal.scopes.includes(scope);
export const isAdmin = (principal: Principal): boolean => hasScope(principal, 'admin');
