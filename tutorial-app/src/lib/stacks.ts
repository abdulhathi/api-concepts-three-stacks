import { useEffect, useState, useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage';

// The three servers of the Bookshop API. The lab's dev server proxies /stack/<id>/… to each one (vite.config.ts),
// so practice requests are same-origin and need no CORS.
export type StackId = 'python' | 'node' | 'dotnet';

export type Stack = {
  id: StackId;
  name: string;
  short: string;
  cloud: string;
  port: number;
  /** Your own server for this stack, in the hand-built repo. */
  minePort: number;
  /** The stack's folder in the hand-built repo (bookshop-api-handbuilt). */
  mineDir: string;
  /** The stack's folder in APIConcepts/. */
  dir: string;
  /** How to start it from the folder that holds SPEC.md (Study Hub starts it too). Install first: see the stack's README. */
  start: string;
};

export const STACKS: Stack[] = [
  {
    id: 'python',
    name: 'Python · FastAPI',
    short: 'Python',
    cloud: 'AWS',
    port: 8001,
    minePort: 9001,
    mineDir: 'python',
    dir: 'python-fastapi-aws',
    start: 'cd python-fastapi-aws && .venv/bin/python -m app',
  },
  {
    id: 'node',
    name: 'TypeScript · Express',
    short: 'TypeScript',
    cloud: 'GCP',
    port: 8002,
    minePort: 9002,
    mineDir: 'typescript',
    dir: 'node-typescript-gcp',
    start: 'cd node-typescript-gcp && npm run dev',
  },
  {
    id: 'dotnet',
    name: 'C# · ASP.NET Core',
    short: 'C#',
    cloud: 'Azure',
    port: 8003,
    minePort: 9003,
    mineDir: 'csharp',
    dir: 'dotnet-azure',
    start: 'cd dotnet-azure && dotnet run --project src/ApiConcepts.Api',
  },
];

export const stackOf = (id: StackId) => STACKS.find((s) => s.id === id)!;

const KEY = 'api-lab.stack';
const saved = readJson<string>(KEY, '');
let current: StackId = STACKS.find((s) => s.id === saved)?.id ?? 'python';
const listeners = new Set<() => void>();

export function setStack(id: StackId) {
  current = id;
  writeJson(KEY, id);
  listeners.forEach((l) => l());
}

/** The stack you practice on, remembered in this browser. */
export function useStack(): StackId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

/** Which servers the practice labs talk to: the reference ones, or the ones you are building yourself. */
export type Target = 'stack' | 'mine';
const TARGET_KEY = 'api-lab.target';
let target: Target = readJson<string>(TARGET_KEY, 'stack') === 'mine' ? 'mine' : 'stack';
const targetListeners = new Set<() => void>();

export function setTarget(t: Target) {
  target = t;
  writeJson(TARGET_KEY, t);
  targetListeners.forEach((l) => l());
}

export const currentTarget = () => target;

export function useTarget(): Target {
  return useSyncExternalStore(
    (l) => {
      targetListeners.add(l);
      return () => targetListeners.delete(l);
    },
    () => target,
    () => target,
  );
}

/** The port a request goes to: the reference server's, or your own. */
export const portOf = (stack: StackId, t: Target = target) => (t === 'mine' ? stackOf(stack).minePort : stackOf(stack).port);

export type Health = 'up' | 'down' | 'checking';

/** Whether each server (reference or yours) answers GET /health, checked now and every few seconds while mounted. */
export function useHealth(everyMs = 5000, t: Target = 'stack'): Record<StackId, Health> {
  const [h, setH] = useState<Record<StackId, Health>>({ python: 'checking', node: 'checking', dotnet: 'checking' });
  useEffect(() => {
    let live = true;
    setH({ python: 'checking', node: 'checking', dotnet: 'checking' });
    const check = () =>
      STACKS.forEach((s) =>
        fetch(`/${t}/${s.id}/health`, { cache: 'no-store' })
          .then((r) => r.ok)
          .catch(() => false)
          .then((ok) => live && setH((prev) => (prev[s.id] === (ok ? 'up' : 'down') ? prev : { ...prev, [s.id]: ok ? 'up' : 'down' }))),
      );
    check();
    const timer = setInterval(check, everyMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [everyMs, t]);
  return h;
}
