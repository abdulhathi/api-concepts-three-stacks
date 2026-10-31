import { randomBytes } from 'node:crypto';

/** `prefix_` followed by 12 random lowercase hex characters, e.g. `ord_3fa91c0b77de`. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}
