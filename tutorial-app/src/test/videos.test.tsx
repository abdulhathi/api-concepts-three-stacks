import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TOPICS } from '../curriculum';
import { problems } from '../flow/geometry';
import { loadVideo, VIDEO_IDS } from '../lessons';
import { UNSPEAKABLE } from '../video/speech';
import { SceneView } from '../video/Stage';
import { buildTimeline } from '../video/timeline';
import type { Scene, VideoScript } from '../video/types';
import { BRITISH } from './spelling';

// Set ONLY to a comma-separated list of topic ids to check just those while writing them,
// e.g. ONLY=caching npx vitest run src/test/videos.test.tsx
const only = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const ids = [...VIDEO_IDS].filter((id) => !only || only.includes(id)).sort();

const MAX_LINE = 240;
const MIN_MIN = 5;
const MAX_MIN = 14;

const itemsOf = (s: Scene): number | undefined =>
  s.kind === 'points' || s.kind === 'recap'
    ? s.points.length
    : s.kind === 'steps'
      ? s.steps.length
      : s.kind === 'signals' || s.kind === 'table'
        ? s.rows.length
        : s.kind === 'stats'
          ? s.items.length
          : undefined;

describe.each(ids)('video lesson: %s', (id) => {
  let video: VideoScript;
  const get = async () => (video ??= await loadVideo(id));

  it('opens with a title card, closes with a recap, and has enough scenes', async () => {
    const v = await get();
    expect(v.scenes[0].kind).toBe('title');
    expect(v.scenes.at(-1)!.kind).toBe('recap');
    expect(v.scenes.length).toBeGreaterThanOrEqual(10);
  });

  it('animates the architecture, asks you to think, and says when to use what', async () => {
    const kinds = (await get()).scenes.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'flow').length, 'at least four animated flow diagrams').toBeGreaterThanOrEqual(4);
    expect(kinds.includes('http'), 'needs an http scene that shows the real message').toBe(true);
    expect(kinds.includes('pause'), 'needs a pause-and-think question').toBe(true);
    expect(kinds.includes('signals'), 'needs a "when to reach for what" scene').toBe(true);
  });

  it(`runs between ${MIN_MIN} and ${MAX_MIN} minutes`, async () => {
    const ms = buildTimeline(await get()).totalMs;
    expect(ms / 60000).toBeGreaterThanOrEqual(MIN_MIN);
    expect(ms / 60000).toBeLessThanOrEqual(MAX_MIN);
  });

  it('has captions a voice can read: short lines, no symbols left after conversion', async () => {
    for (const step of buildTimeline(await get()).steps) {
      expect(step.caption.length, step.caption).toBeLessThanOrEqual(MAX_LINE);
      expect(step.speech, `"${step.caption}" is read as "${step.speech}"`).not.toMatch(UNSPEAKABLE);
    }
  });

  it('is in American English', async () => {
    const text = JSON.stringify((await get()).scenes);
    expect(text.match(BRITISH)?.[0], 'British spelling').toBeUndefined();
  });

  it('keeps reveals and beats in step with the narration', async () => {
    for (const s of (await get()).scenes) {
      expect(s.say.length, `scene "${s.title}" has nothing to say`).toBeGreaterThan(0);
      const n = itemsOf(s);
      if (n !== undefined) {
        const lead = 'lead' in s ? (s.lead ?? 0) : 0;
        expect(n, `scene "${s.title}": one line per item after the lead`).toBeLessThanOrEqual(s.say.length - lead);
        expect(n).toBeGreaterThan(0);
      }
      if (s.kind === 'table') for (const r of s.rows) expect(r.length, `scene "${s.title}": every row fills the columns`).toBe(s.head.length);
      if (s.kind === 'compare') {
        expect(s.rightAt).toBeGreaterThanOrEqual(1);
        expect(s.rightAt).toBeLessThan(s.say.length);
      }
      if (s.kind === 'pause') expect(s.answerSay.length).toBeGreaterThan(0);
      if (s.kind === 'http') {
        expect(s.marks?.length ?? 0, `scene "${s.title}": at most one mark per line`).toBeLessThanOrEqual(s.say.length);
        for (const m of s.marks ?? []) {
          for (const i of m.req ?? []) expect(i, `scene "${s.title}": request line ${i}`).toBeLessThan(s.request.length);
          for (const i of m.res ?? []) expect(i, `scene "${s.title}": response line ${i}`).toBeLessThan(s.response?.length ?? 0);
        }
        for (const l of [...s.request, ...(s.response ?? [])]) expect(l.length, `scene "${s.title}": "${l}" is too long for the stage`).toBeLessThanOrEqual(42);
        if (s.response && s.responseAt !== undefined) expect(s.responseAt).toBeLessThan(s.say.length);
      }
    }
  });

  it('draws every diagram cleanly: no overlaps, known ids, packets on visible edges', async () => {
    const flows = (await get()).scenes.filter((s) => s.kind === 'flow');
    // Every scene's problems at once, so a writer can fix them all in one pass.
    expect(flows.flatMap((s) => problems(s, s.say.length).map((p) => `scene "${s.title}": ${p}`))).toEqual([]);
    const names = flows.map((s) => s.name).filter(Boolean);
    expect(new Set(names).size, 'diagram names are unique').toBe(names.length);
  });

  it('moves something in most diagrams', async () => {
    for (const s of (await get()).scenes) {
      if (s.kind !== 'flow') continue;
      const lively = s.beats.filter(
        (b) => b.send?.length || b.show?.length || b.hide?.length || b.down?.length || b.up?.length || b.cut?.length || b.mend?.length || b.relabel || b.rows || b.badge,
      ).length;
      expect(lively, `scene "${s.title}": half its lines should change the picture`).toBeGreaterThanOrEqual(Math.ceil(s.beats.length / 2));
    }
  });

  it('points the recap at the next topic in the course', async () => {
    const recap = (await get()).scenes.at(-1)!;
    const next = TOPICS[TOPICS.findIndex((t) => t.id === id) + 1];
    if (recap.kind === 'recap') expect(recap.next).toBe(next?.id);
  });

  it('renders every scene', async () => {
    const v = await get();
    const tl = buildTimeline(v);
    v.scenes.forEach((scene, k) => {
      const lastStep = tl.steps.filter((s) => s.scene === k).at(-1)!;
      const { container, unmount } = render(<SceneView scene={scene} step={lastStep} />);
      expect(container.textContent?.length, `scene ${k} "${scene.title}"`).toBeGreaterThan(0);
      unmount();
    });
  });
});
