// @vitest-environment node
// Runs practice labs for real against the three running servers (not part of npm test):
//   LIVE=idempotency,caching npx vitest run src/test/live.test.ts
// Every try step must pass on every stack; inbox steps wait for deliveries at the lab's dev server (LAB_URL, default
// http://localhost:5195); a build step's check must NOT pass yet, because nobody has made the change.
import { describe, expect, it } from 'vitest';
import { loadPractice } from '../lessons';
import { STACKS } from '../lib/stacks';
import { makeVars } from '../practice/Practice';
import { check, fill, fillDeep, missingVars, pick, send, sendDirect, webhookSignature } from '../practice/run';

const ids = process.env.LIVE?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const LAB = process.env.LAB_URL ?? 'http://localhost:5195';
sendDirect();

type Delivery = { answered: number; headers: Record<string, string>; body: string };

// Without LIVE, one skipped test, so plain `npm test` does not fail on an empty file.
it.skipIf(ids.length > 0)('set LIVE=<concept ids> to run the practice labs against the servers', () => {});

describe.skipIf(ids.length === 0).each(ids)('live practice: %s', (id) => {
  it.each(STACKS.map((s) => s.id))('every step passes on %s', async (stack) => {
    const p = await loadPractice(id);
    const vars: Record<string, string> = { LAB, ...makeVars(p) };
    const problems: string[] = [];
    for (const [i, s] of p.steps.entries()) {
      const where = `step ${i + 1} "${s.title}"`;
      if (s.kind === 'try') {
        const missing = missingVars(s.request, vars);
        if (missing.length) {
          problems.push(`${where}: no value for ${missing.join(', ')}`);
          continue;
        }
        const results = await send(stack, s.request, vars);
        const last = results.at(-1)!;
        if (last.status === 0) problems.push(`${where}: no answer (${last.statusText})`);
        for (const c of check(fillDeep(s.expect, vars), results)) if (!c.ok) problems.push(`${where}: ${c.label} (${c.detail ?? ''})`);
        for (const [name, path] of Object.entries(s.save ?? {})) {
          const v = pick(last, path);
          if (v === undefined || v === null) problems.push(`${where}: nothing to save at ${path}`);
          else vars[name] = String(v);
        }
      } else if (s.kind === 'inbox') {
        const box = fill(s.box, vars);
        const secret = s.secret ? vars[s.secret.replace(/^\{\{|\}\}$/g, '')] : undefined;
        let good = 0;
        for (let t = 0; t < 30 && good < (s.atLeast ?? 1); t++) {
          await new Promise((r) => setTimeout(r, 500));
          const r = await fetch(`${LAB}/lab/inbox/${box}`).catch(() => undefined);
          if (!r?.ok) continue;
          const { data } = (await r.json()) as { data: Delivery[] };
          good = 0;
          for (const d of data) {
            if (d.answered !== 200) continue;
            if (secret && d.headers['webhook-signature'] !== `v1=${await webhookSignature(secret, d.headers['webhook-timestamp'] ?? '', d.body)}`) continue;
            good++;
          }
        }
        if (good < (s.atLeast ?? 1)) problems.push(`${where}: ${good} good deliveries in ${LAB}/lab/inbox/${box}, wanted ${s.atLeast ?? 1}`);
      } else if (s.kind === 'build' && s.check) {
        const results = await send(stack, s.check.request, vars);
        if (check(fillDeep(s.check.expect, vars), results).every((c) => c.ok)) problems.push(`${where}: the check already passes before anyone made the change`);
      }
    }
    expect(problems).toEqual([]);
  }, 180_000);
});
