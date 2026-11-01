import { describe, expect, it } from 'vitest';
import { loadPractice, PRACTICE_IDS } from '../lessons';
import { loadCode } from '../lib/code';
import { STACKS } from '../lib/stacks';
import type { Practice } from '../practice/types';
import { BRITISH } from './spelling';

// ONLY=idempotency npx vitest run src/test/practice.test.ts checks just that lab while you write it.
const only = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const ids = [...PRACTICE_IDS].filter((id) => !only || only.includes(id)).sort();
const PLACEHOLDER = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

describe.each(ids)('practice lab: %s', (id) => {
  let practice: Practice;
  const get = async () => (practice ??= await loadPractice(id));

  it('has enough to do: requests to send, code to read, something to build and something to think about', async () => {
    const kinds = (await get()).steps.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'try').length, 'try steps').toBeGreaterThanOrEqual(4);
    expect(kinds.filter((k) => k === 'try').length, 'try steps').toBeLessThanOrEqual(14);
    expect(kinds.includes('read'), 'a read step').toBe(true);
    expect(kinds.includes('build'), 'a build step').toBe(true);
    expect(kinds.includes('think'), 'a think step').toBe(true);
    expect((await get()).intro.length).toBeGreaterThan(30);
  });

  it('checks every request and says what to notice', async () => {
    for (const s of (await get()).steps) {
      if (s.kind !== 'try') continue;
      expect(s.expect, `"${s.title}" needs an expect`).toBeDefined();
      expect(Object.keys(s.expect!).length, `"${s.title}" expects something`).toBeGreaterThan(0);
      expect(s.notice.length, `"${s.title}" needs at least one notice`).toBeGreaterThan(0);
      expect(s.request.path, `"${s.title}"`).toMatch(/^\//);
      if (s.expect?.statuses) expect(s.request.times, `"${s.title}": statuses needs times`).toBeGreaterThan(1);
    }
  });

  it('only uses placeholders that exist by then: vars, LAB, or a value an earlier step saved', async () => {
    const p = await get();
    const known = new Set(['LAB', ...Object.keys(p.vars ?? {})]);
    p.steps.forEach((s, i) => {
      const text = JSON.stringify(s.kind === 'try' ? [s.request, s.expect] : s.kind === 'build' ? s.check ?? {} : s.kind === 'inbox' ? s.secret ?? '' : '');
      for (const m of text.matchAll(PLACEHOLDER)) expect(known.has(m[1]), `step ${i + 1} "${s.title}" uses {{${m[1]}}} before any step saves it`).toBe(true);
      if (s.kind === 'try') for (const name of Object.keys(s.save ?? {})) known.add(name);
      if (s.kind === 'try') for (const path of Object.values(s.save ?? {})) expect(path).toMatch(/^(body|header)\.\S+$/);
    });
  });

  it('points read steps at real code in all three stacks', async () => {
    for (const s of (await get()).steps) {
      if (s.kind !== 'read') continue;
      for (const stack of STACKS) {
        const ref = s.files[stack.id];
        expect(ref, `"${s.title}" needs ${stack.id}`).toBeDefined();
        expect(ref.path.startsWith(stack.dir + '/'), `${ref.path} is in ${stack.dir}`).toBe(true);
        const lines = (await loadCode(ref.path)).split('\n').length;
        if (ref.lines) {
          expect(ref.lines[0]).toBeGreaterThan(0);
          expect(ref.lines[1]).toBeGreaterThanOrEqual(ref.lines[0]);
          expect(ref.lines[1], `${ref.path} has ${lines} lines`).toBeLessThanOrEqual(lines);
        }
      }
    }
  });

  it('gives build steps clear steps and hints, and a way to check them', async () => {
    for (const s of (await get()).steps) {
      if (s.kind !== 'build') continue;
      expect(s.steps.length, `"${s.title}"`).toBeGreaterThanOrEqual(2);
      expect(s.hints.length, `"${s.title}"`).toBeGreaterThanOrEqual(1);
      expect(Boolean(s.check || s.command), `"${s.title}" needs a check or a command`).toBe(true);
    }
  });

  it('is in American English', async () => {
    expect(JSON.stringify(await get()).match(BRITISH)?.[0], 'British spelling').toBeUndefined();
  });
});
