// The source files the guides and practice labs point at, bundled as text so the lab can show them
// beside the lesson. Paths are relative to APIConcepts/: "python-fastapi-aws/app/routes/orders.py".
import { useSyncExternalStore } from 'react';

const files = import.meta.glob<string>(
  [
    '../../../SPEC.md',
    '../../../python-fastapi-aws/{app,bookshop_client,tests,examples,infra}/**/*.{py,yaml,toml,md}',
    '../../../python-fastapi-aws/*.{toml,md}',
    '../../../node-typescript-gcp/{src,tests,examples,infra}/**/*.{ts,yaml,sh}',
    '../../../node-typescript-gcp/{Dockerfile,*.md,package.json}',
    '../../../dotnet-azure/{src,tests,examples,infra}/**/*.{cs,bicep,json,md}',
    '../../../dotnet-azure/*.md',
    '../../../contract-tests/src/**/*.ts',
    '../../../contract-tests/*.{md,sh}',
    '!**/node_modules/**',
    '!**/bin/**',
    '!**/obj/**',
  ],
  { query: '?raw', import: 'default' },
);

const PREFIX = '../../../';

export const CODE_PATHS: ReadonlySet<string> = new Set(Object.keys(files).map((k) => k.slice(PREFIX.length)));

export const hasCode = (path: string) => CODE_PATHS.has(path);

export async function loadCode(path: string): Promise<string> {
  const load = files[PREFIX + path];
  if (!load) throw new Error(`The lab does not include ${path}`);
  return load();
}

/** The public copy of the repo, for files the lab does not bundle. */
export const githubUrl = (path: string, lines?: [number, number]) =>
  `https://github.com/abdulhathi/api-concepts-three-stacks/blob/main/${path}${lines ? `#L${lines[0]}-L${lines[1]}` : ''}`;

/** "#L70-L77" or "#L38" → [70, 77] or [38, 38]. */
export function linesOf(hash: string): [number, number] | undefined {
  const m = hash.match(/^#?L(\d+)(?:-L?(\d+))?$/);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : undefined;
}

// The code drawer: one file open at a time, beside the page.
export type OpenFile = { path: string; lines?: [number, number] };
let open: OpenFile | null = null;
const listeners = new Set<() => void>();

export function openCode(file: OpenFile | null) {
  open = file;
  listeners.forEach((l) => l());
}

export function useOpenCode(): OpenFile | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open,
  );
}
