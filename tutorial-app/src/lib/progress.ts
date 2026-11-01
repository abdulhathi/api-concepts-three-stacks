import { useSyncExternalStore } from 'react';
import type { StackId } from './stacks';
import { readJson, writeJson } from './storage';

// Your progress per concept, kept in this browser only; videos keep their own record (src/video/watched.ts).
//   read, built, explained: ticked by you
//   passed: practice steps that passed, per stack; practiced: stacks where every step passed
export type Marks = {
  read?: boolean;
  built?: boolean;
  explained?: boolean;
  passed?: Partial<Record<StackId, number[]>>;
  practiced?: StackId[];
};

const KEY = 'api-lab.progress';

let all: Record<string, Marks> = readJson<Record<string, Marks>>(KEY, {});
const listeners = new Set<() => void>();

function update(id: string, change: (m: Marks) => Marks) {
  all = { ...all, [id]: change(all[id] ?? {}) };
  writeJson(KEY, all);
  listeners.forEach((l) => l());
}

export function toggleMark(id: string, mark: 'read' | 'built' | 'explained') {
  update(id, (m) => ({ ...m, [mark]: !m[mark] }));
}

export function setMark(id: string, mark: 'read' | 'built' | 'explained', value: boolean) {
  if (Boolean(all[id]?.[mark]) !== value) update(id, (m) => ({ ...m, [mark]: value }));
}

/** Record a passed practice step; once all `of` checked steps passed on a stack, that stack counts as practiced. */
export function passStep(id: string, stack: StackId, step: number, of: number[]) {
  const before = all[id]?.passed?.[stack] ?? [];
  if (before.includes(step)) return;
  update(id, (m) => {
    const passed = [...before, step].sort((a, b) => a - b);
    const done = of.every((s) => passed.includes(s));
    const practiced = done && !(m.practiced ?? []).includes(stack) ? [...(m.practiced ?? []), stack] : m.practiced;
    return { ...m, passed: { ...m.passed, [stack]: passed }, practiced };
  });
}

/** Forget the practice record of one concept (to do it again from the start). */
export function resetPractice(id: string) {
  update(id, (m) => ({ ...m, passed: {}, practiced: [] }));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProgress(): Readonly<Record<string, Marks>> {
  return useSyncExternalStore(subscribe, () => all, () => all);
}

/** The six steps of studying one concept, and whether each is done. */
export const STUDY_STEPS = [
  { key: 'watch', label: 'Watch the video', tab: '' },
  { key: 'read', label: 'Read the guide and the code', tab: 'learn' },
  { key: 'practice', label: 'Run every practice step in your stack', tab: 'practice' },
  { key: 'compare', label: 'Run them again on a second stack', tab: 'practice' },
  { key: 'build', label: 'Build it in your own API', tab: 'build' },
  { key: 'explain', label: 'Answer the interview questions out loud', tab: 'learn' },
] as const;

export type StudyKey = (typeof STUDY_STEPS)[number]['key'];

/** `byHand`: the concept passed its contract tests in your own API (progress.json). */
export function studyDone(m: Marks | undefined, watched: boolean, byHand = false): Record<StudyKey, boolean> {
  const practiced = m?.practiced?.length ?? 0;
  return {
    watch: watched,
    read: Boolean(m?.read),
    practice: practiced >= 1,
    compare: practiced >= 2,
    build: Boolean(m?.built) || byHand,
    explain: Boolean(m?.explained),
  };
}
