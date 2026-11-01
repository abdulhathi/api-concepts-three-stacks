// The contract tests, read from ../contract-tests/src, grouped by concept: the Build tab lists the tests a concept
// must pass in your own API. Groups are named "22 · Idempotency"; concepts 23 and 25 share "23 + 25 · …".
import { useEffect, useState } from 'react';

const sources = import.meta.glob<string>('../../../contract-tests/src/*.test.ts', { query: '?raw', import: 'default', eager: true });

export type ContractTest = { title: string; /** Why it may be skipped for now. */ waits?: string };
export type ContractGroup = { name: string; concepts: number[]; tests: ContractTest[] };

const GROUP = /^describe\((['"])(.+?)\1/;
const TEST = /^\s+it\b.*?\(\s*(['"])(.+?)\1\s*,\s*async/;

function waitsFor(line: string): string | undefined {
  const later = line.match(/skipIf\(!built\((\d+)\)\)/);
  if (later) return `runs once concept ${later[1]} is built`;
  if (/skipIf\(AUTH !== 'oauth'\)/.test(line)) return 'runs once your token endpoint (concept 13) is built';
  return undefined;
}

export function parseGroups(source: string): ContractGroup[] {
  const groups: ContractGroup[] = [];
  for (const line of source.split('\n')) {
    const g = line.match(GROUP);
    if (g) {
      const head = g[2].split(' · ')[0];
      groups.push({ name: g[2], concepts: head.split('+').map((n) => Number(n.trim())), tests: [] });
      continue;
    }
    const t = line.match(TEST);
    if (t && groups.length) groups.at(-1)!.tests.push({ title: t[2], waits: waitsFor(line) });
  }
  return groups;
}

export const GROUPS: ContractGroup[] = Object.values(sources).flatMap(parseGroups);

/** The contract tests for one concept. */
export const groupFor = (concept: number) => GROUPS.find((g) => g.concepts.includes(concept));

export type BuildProgress = { dir?: string; progress?: Record<string, number[]>; error?: string };

/** Your hand-built API's progress.json, read by the dev server: one shared poll every 15 seconds while anything shows it. */
let latest: BuildProgress = {};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function load() {
  void fetch('/lab/build-progress', { cache: 'no-store' })
    .then(async (r) => (await r.json()) as BuildProgress)
    .catch(() => ({ error: 'The lab could not read your progress.' }))
    .then((value) => {
      latest = value;
      listeners.forEach((l) => l());
    });
}

export function useBuildProgress(): BuildProgress {
  const [value, setValue] = useState(latest);
  useEffect(() => {
    const l = () => setValue(latest);
    listeners.add(l);
    if (listeners.size === 1) {
      load();
      timer = setInterval(load, 15000);
    }
    return () => {
      listeners.delete(l);
      if (!listeners.size) clearInterval(timer);
    };
  }, []);
  return value;
}

/** Concepts passed in your own API, in any stack. */
export const passedByHand = (b: BuildProgress, concept: number) => Object.values(b.progress ?? {}).some((list) => list.includes(concept));
