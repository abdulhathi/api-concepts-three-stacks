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
    dir: 'python-fastapi-aws',
    start: 'cd python-fastapi-aws && .venv/bin/python -m app',
  },
  {
    id: 'node',
    name: 'TypeScript · Express',
    short: 'TypeScript',
    cloud: 'GCP',
    port: 8002,
    dir: 'node-typescript-gcp',
    start: 'cd node-typescript-gcp && npm run dev',
  },
  {
    id: 'dotnet',
    name: 'C# · ASP.NET Core',
    short: 'C#',
    cloud: 'Azure',
    port: 8003,
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

export type Health = 'up' | 'down' | 'checking';

/** Whether each server answers GET /health, checked now and every few seconds while mounted. */
export function useHealth(everyMs = 5000): Record<StackId, Health> {
  const [h, setH] = useState<Record<StackId, Health>>({ python: 'checking', node: 'checking', dotnet: 'checking' });
  useEffect(() => {
    let live = true;
    const check = () =>
      STACKS.forEach((s) =>
        fetch(`/stack/${s.id}/health`, { cache: 'no-store' })
          .then((r) => r.ok)
          .catch(() => false)
          .then((ok) => live && setH((prev) => (prev[s.id] === (ok ? 'up' : 'down') ? prev : { ...prev, [s.id]: ok ? 'up' : 'down' }))),
      );
    check();
    const t = setInterval(check, everyMs);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [everyMs]);
  return h;
}
