import { describe, expect, it } from 'vitest';
import { ruleOf } from '../build/BuildTab';
import { BUILD_NOTES } from '../build/notes';
import { TOPICS } from '../curriculum';
import { loadGuide } from '../lessons';
import { GROUPS, groupFor, parseGroups } from '../lib/contract';

describe('the Build tab', () => {
  it('finds the contract tests of every concept, all 59 of them', () => {
    for (const t of TOPICS) expect(groupFor(t.n)?.tests.length, `concept ${t.n}`).toBeGreaterThan(0);
    expect(GROUPS.reduce((n, g) => n + g.tests.length, 0)).toBe(59);
    expect(groupFor(25)?.name).toMatch(/^23 \+ 25 · /);
  });

  it('notes which tests wait for a later concept', () => {
    const [g] = parseGroups(`describe('11 · Authorization', () => {\n  it.skipIf(!built(22))("hides another client's order", async () => {\n  it('plain one', async () => {`);
    expect(g.tests).toEqual([{ title: "hides another client's order", waits: 'runs once concept 22 is built' }, { title: 'plain one', waits: undefined }]);
  });

  it.each(TOPICS.map((t) => t.id))('%s: has build notes and a rule from its guide', async (id) => {
    const t = TOPICS.find((x) => x.id === id)!;
    expect(BUILD_NOTES[t.n]?.length).toBeGreaterThan(0);
    expect(ruleOf(await loadGuide(id))?.length).toBeGreaterThan(40);
  });
});
