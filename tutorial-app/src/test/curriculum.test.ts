import { describe, expect, it } from 'vitest';
import { LEVELS, numberOf, TOPICS } from '../curriculum';
import { GUIDE_IDS, PRACTICE_IDS, VIDEO_IDS } from '../lessons';

describe('curriculum', () => {
  it('has the 27 concepts, numbered 1 to 27 in study order, with unique lowercase ids', () => {
    expect(TOPICS.map((t) => t.n)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    for (const t of TOPICS) expect(t.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(numberOf('idempotency')).toBe('22');
  });

  it('numbers parts from 1 and gives every concept a goal and a scope', () => {
    LEVELS.forEach((l, i) => expect(l.n).toBe(i + 1));
    for (const t of TOPICS) {
      expect(t.goal.length, t.id).toBeGreaterThan(30);
      expect(t.covers.length, t.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('finds the concept guide of every concept in ../docs/concepts', () => {
    expect(TOPICS.filter((t) => !GUIDE_IDS.has(t.id)).map((t) => t.id)).toEqual([]);
  });

  it('only has lessons for concepts in the course', () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    for (const id of [...VIDEO_IDS, ...PRACTICE_IDS]) expect(ids.has(id), `src/lessons/${id}`).toBe(true);
  });

  it.skipIf(process.env.PARTIAL === '1')('has a video and a practice lab for every concept', () => {
    expect(TOPICS.filter((t) => !VIDEO_IDS.has(t.id)).map((t) => t.id), 'concepts without a video').toEqual([]);
    expect(TOPICS.filter((t) => !PRACTICE_IDS.has(t.id)).map((t) => t.id), 'concepts without a practice lab').toEqual([]);
  });
});
