import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../lib/storage';

// Where you stopped in each video, and which ones you finished. Kept in this browser only.
const KEY = 'api-lab.videos';

export type VideoProgress = { at: number; of: number; done?: boolean };
type State = Record<string, VideoProgress>;

let state: State = readJson<State>(KEY, {});
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  writeJson(KEY, state);
  listeners.forEach((l) => l());
}

/** Remember the step you are on. Reaching the last step marks the video watched; it stays watched if you rewatch. */
export function savePosition(id: string, at: number, of: number) {
  const prev = state[id];
  const done = Boolean(prev?.done) || at >= of - 1;
  if (prev && prev.at === at && prev.of === of && Boolean(prev.done) === done) return;
  set({ ...state, [id]: { at, of, done } });
}

export function setWatched(id: string, done: boolean) {
  const prev = state[id] ?? { at: 0, of: 0 };
  set({ ...state, [id]: { ...prev, done } });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useWatched(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Tests start from a clean slate. */
export function resetWatchedForTests() {
  state = {};
  listeners.forEach((l) => l());
}
