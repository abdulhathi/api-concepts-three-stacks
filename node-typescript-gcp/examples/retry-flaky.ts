// Concepts 23-25 · Calls the flaky endpoint (2 planned failures) and prints each attempt and the delay before the next.
// Start the server first: npm run dev
import { randomUUID } from 'node:crypto';
import { BookshopClient } from '../src/client/index.js';

const client = new BookshopClient({
  baseUrl: process.env.BASE_URL ?? 'http://localhost:8002',
  clientId: 'reader',
  clientSecret: 'reader-secret',
  onRetry: ({ attempt, delayMs, reason, source }) =>
    console.log(`attempt ${attempt} failed (${reason}); waiting ${Math.round(delayMs)} ms [${source}]`),
});

const result = await client.flaky(`demo-${randomUUID()}`, 2);
console.log(`succeeded on attempt ${result.attempts}:`, result);
