// Concept 18 · Pagination: opaque keyset cursors over a list that is already sorted by (createdAt, id).
import { ApiProblem } from './problem.js';

export interface Keyed {
  id: string;
  createdAt: string;
}

const CURSOR_SHAPE = /^v1\|\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[a-z]+_[0-9a-z]+$/;

export function encodeCursor(item: Keyed): string {
  return Buffer.from(`v1|${item.createdAt}|${item.id}`).toString('base64url');
}

/** Returns the sort key `createdAt|id` a cursor points past, or undefined when it cannot be decoded. */
export function decodeCursor(cursor: string): string | undefined {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!CURSOR_SHAPE.test(text)) return undefined;
  return text.slice(3);
}

const sortKey = (item: Keyed) => `${item.createdAt}|${item.id}`;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Keyset pagination: continue strictly after the cursor's position, so inserts never shift pages. */
export function paginate<T extends Keyed>(sorted: T[], limit: number, cursor?: string): Page<T> {
  let start = 0;
  if (cursor !== undefined) {
    const after = decodeCursor(cursor);
    if (after === undefined) throw new ApiProblem('invalid-cursor', 'The cursor was not issued by this API.');
    start = sorted.findIndex((item) => sortKey(item) > after);
    if (start === -1) start = sorted.length;
  }
  const items = sorted.slice(start, start + limit);
  const hasMore = start + limit < sorted.length;
  return { items, hasMore, nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null };
}

/** Orders items by createdAt, then id, the order the contract promises. */
export function byCreation<T extends Keyed>(a: T, b: T): number {
  return sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0;
}
