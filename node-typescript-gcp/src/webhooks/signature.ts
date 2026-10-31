// Concept 26 · Webhooks: HMAC-SHA256 signing, and the verify helper receivers use.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** `v1=<hex>` over `<timestamp>.<raw body>`, keyed by the UTF-8 bytes of the whole secret (including whsec_). */
export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

export interface VerifyInput {
  secret: string;
  /** Webhook-Timestamp header (unix seconds). */
  timestamp: string;
  /** Webhook-Signature header; may list several space-separated `v1=` values during secret rotation. */
  signature: string;
  rawBody: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}

export function verifyWebhookSignature(input: VerifyInput): boolean {
  const { secret, timestamp, signature, rawBody } = input;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt)) return false;
  // The timestamp is part of the signed message, so an attacker cannot replay an old body with a fresh one.
  if (Math.abs(now - sentAt) > (input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS)) return false;

  const expected = Buffer.from(signWebhook(secret, sentAt, rawBody));
  return signature.split(/\s+/).some((candidate) => {
    const received = Buffer.from(candidate);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
