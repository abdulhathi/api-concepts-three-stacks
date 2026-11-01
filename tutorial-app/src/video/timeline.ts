import { arrivalMs } from '../flow/geometry';
import { toSpeech } from './speech';
import type { Scene, VideoScript } from './types';

/** One caption on screen: the smallest unit the player plays, skips and seeks by. */
export type Step = {
  scene: number;
  caption: string;
  /** What the voice reads; empty for a silent step (the thinking pause). */
  speech: string;
  /** Estimated length at normal speed, used when the voice is off and for the clock. */
  ms: number;
  /** Flow scenes: the beat on screen (the line's index in the scene). */
  beat: number;
  /** Flow scenes: how long the beat's packets take to arrive at normal speed; the line stays up at least this long. */
  hold?: number;
  /** How many items of the scene are visible; for compare scenes, 1 once the right side shows. */
  reveal: number;
  /** Pause scenes: asking, thinking (silent countdown) or answering. */
  phase?: 'ask' | 'think' | 'answer';
};

export type Timeline = {
  steps: Step[];
  /** Index of each scene's first step. */
  sceneStarts: number[];
  /** Start time of each step in ms at normal speed, including the gaps between lines. */
  starts: number[];
  totalMs: number;
};

export const THINK_MS = 6000;
/** Silence after a line, and the longer one when the scene changes. */
export const LINE_GAP_MS = 350;
export const SCENE_GAP_MS = 900;

/** A rough reading time: about 165 words a minute plus a beat for punctuation. */
export function estimateMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const stops = (text.match(/[.,;:!?—]/g) ?? []).length;
  return Math.max(1500, Math.round(words * 365 + stops * 140));
}

/** Items appear one per line from line `lead`; the scene's last line always shows every item. */
export function revealAt(line: number, lines: number, items: number, lead = 0): number {
  if (line >= lines - 1) return items;
  return Math.min(items, Math.max(0, line - lead + 1));
}

const say = (scene: number, caption: string, rest: Partial<Step> = {}): Step => ({
  scene,
  caption,
  speech: toSpeech(caption),
  ms: estimateMs(caption),
  beat: 0,
  reveal: 0,
  ...rest,
});

function sceneSteps(s: Scene, k: number): Step[] {
  switch (s.kind) {
    case 'title':
      return s.say.map((line) => say(k, line));
    case 'flow':
      return s.say.map((line, i) => {
        const hold = arrivalMs(s, i);
        return say(k, line, { beat: i, hold, ms: Math.max(estimateMs(line), hold) });
      });
    case 'points':
    case 'recap':
      return s.say.map((line, i) => say(k, line, { reveal: revealAt(i, s.say.length, s.points.length, s.lead) }));
    case 'steps':
      return s.say.map((line, i) => say(k, line, { reveal: revealAt(i, s.say.length, s.steps.length, s.lead) }));
    case 'table':
      return s.say.map((line, i) => say(k, line, { reveal: revealAt(i, s.say.length, s.rows.length, s.lead) }));
    case 'stats':
      return s.say.map((line, i) => say(k, line, { reveal: revealAt(i, s.say.length, s.items.length, s.lead) }));
    case 'signals':
      return s.say.map((line, i) => say(k, line, { reveal: revealAt(i, s.say.length, s.rows.length, s.lead) }));
    case 'http':
      return s.say.map((line, i) => say(k, line, { beat: i, reveal: s.response && i >= (s.responseAt ?? s.say.length - 1) ? 1 : 0 }));
    case 'compare':
      return s.say.map((line, i) => say(k, line, { reveal: i >= s.rightAt || i === s.say.length - 1 ? 1 : 0 }));
    case 'pause':
      return [
        ...s.say.map((line) => say(k, line, { phase: 'ask' as const })),
        { scene: k, caption: 'Pause the video and work it out, or wait for the answer.', speech: '', ms: THINK_MS, beat: 0, reveal: 0, phase: 'think' },
        ...s.answerSay.map((line) => say(k, line, { phase: 'answer' as const })),
      ];
  }
}

export function buildTimeline(script: VideoScript): Timeline {
  const steps: Step[] = [];
  const sceneStarts: number[] = [];
  script.scenes.forEach((scene, k) => {
    sceneStarts.push(steps.length);
    steps.push(...sceneSteps(scene, k));
  });
  const starts: number[] = [];
  let t = 0;
  steps.forEach((s, i) => {
    starts.push(t);
    t += s.ms + gapAfter(steps, i);
  });
  return { steps, sceneStarts, starts, totalMs: t };
}

/** The pause after step i: longer when the next step starts a new scene, none after the last step. */
export function gapAfter(steps: Step[], i: number): number {
  if (i >= steps.length - 1) return 0;
  return steps[i + 1].scene !== steps[i].scene ? SCENE_GAP_MS : LINE_GAP_MS;
}

/** The step playing at a time in ms (normal speed). */
export function stepAt(tl: Timeline, ms: number): number {
  let i = 0;
  while (i + 1 < tl.starts.length && tl.starts[i + 1] <= ms) i++;
  return i;
}

/** 0:00, 6:05, 1:02:03 */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Whole minutes, at least 1: "6 min". */
export const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`;
