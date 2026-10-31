// Concept 22 · Idempotency: remember the first 201 per (client, Idempotency-Key) for 24 hours.
import { createHash } from 'node:crypto';
import { systemClock, type Clock } from './util/time.js';

export interface StoredResponse {
  status: number;
  body: string;
  location: string;
}

export type BeginOutcome =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'in-progress' }
  | { kind: 'reused' };

interface Entry {
  fingerprint: string;
  expiresAt: number;
  response?: StoredResponse; // absent while the first request is still in flight
}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export const fingerprintOf = (rawBody: Buffer): string => createHash('sha256').update(rawBody).digest('hex');

export class IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly clock: Clock = systemClock) {}

  /** Claims the key for this request, or reports why it cannot proceed. Synchronous, so claims never race. */
  begin(clientId: string, key: string, fingerprint: string): BeginOutcome {
    const id = `${clientId}\u0000${key}`;
    const existing = this.entries.get(id);
    if (existing && existing.expiresAt > this.clock()) {
      if (existing.fingerprint !== fingerprint) return { kind: 'reused' };
      return existing.response ? { kind: 'replay', response: existing.response } : { kind: 'in-progress' };
    }
    this.entries.set(id, { fingerprint, expiresAt: this.clock() + IDEMPOTENCY_TTL_MS });
    return { kind: 'new' };
  }

  complete(clientId: string, key: string, response: StoredResponse): void {
    const entry = this.entries.get(`${clientId}\u0000${key}`);
    if (entry) entry.response = response;
  }

  /** Failed attempts are not stored, so the client may retry the same key. */
  abandon(clientId: string, key: string): void {
    this.entries.delete(`${clientId}\u0000${key}`);
  }
}
