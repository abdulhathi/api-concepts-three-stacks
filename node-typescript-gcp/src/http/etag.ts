// Concept 19 · Caching: ETag generation and the If-None-Match / If-Match comparisons.
import { createHash } from 'node:crypto';

export function strongEtag(id: string, version: number): string {
  return `"${id}-v${version}"`;
}

/** Weak validator for a response that is derived from many resources: a hash of its serialized body. */
export function weakEtagOf(body: string): string {
  return `W/"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
}

function parseList(header: string): string[] {
  return header.split(',').map((tag) => tag.trim()).filter(Boolean);
}

const opaque = (tag: string) => tag.replace(/^W\//, '');

/** If-None-Match uses weak comparison: `W/"a"` matches `"a"`. `*` matches any current representation. */
export function noneMatchHits(header: string | undefined, current: string): boolean {
  if (!header) return false;
  return parseList(header).some((tag) => tag === '*' || opaque(tag) === opaque(current));
}

/** If-Match uses strong comparison; absent means "no precondition". `*` passes for an existing resource. */
export function ifMatchPasses(header: string | undefined, current: string): boolean {
  if (header === undefined) return true;
  return parseList(header).some((tag) => tag === '*' || tag === current);
}
