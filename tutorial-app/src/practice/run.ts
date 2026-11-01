// Sending a practice request and checking the answer. Requests go to /stack/<id>/…, which the lab's dev server
// proxies to the chosen server; headers a browser may not set (Origin, Access-Control-Request-*) travel as
// X-Lab-Set-<name> and the proxy renames them (vite.config.ts).
import { currentTarget, portOf, type StackId } from '../lib/stacks';
import type { ClientId, Expect, LabRequest } from './types';

export type Vars = Record<string, string>;

export type Result = {
  status: number;
  statusText: string;
  headers: [string, string][];
  text: string;
  json?: unknown;
  ms: number;
};

export type Check = { label: string; ok: boolean; detail?: string };

const PLACEHOLDER = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/** Replace {{NAME}} with its value; unknown names stay as they are. */
export const fill = (text: string, vars: Vars) => text.replace(PLACEHOLDER, (m, name: string) => vars[name] ?? m);

/** Fill placeholders in every string inside a value (request bodies, expected values). */
export function fillDeep<T>(value: T, vars: Vars): T;
export function fillDeep(value: unknown, vars: Vars): unknown {
  if (typeof value === 'string') return fill(value, vars);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, vars)]));
  return value;
}

/** Every {{NAME}} the request uses that has no value yet. */
export function missingVars(req: LabRequest, vars: Vars): string[] {
  const names = new Set<string>();
  for (const m of JSON.stringify(req).matchAll(PLACEHOLDER)) if (vars[m[1]] === undefined) names.add(m[1]);
  return [...names];
}

const FORBIDDEN = new Set(['origin', 'access-control-request-method', 'access-control-request-headers']);

/** Where requests go: through the lab's proxy (the default), or straight to the servers (the live test, in Node). */
let target = { base: (stack: StackId) => `/${currentTarget()}/${stack}`, direct: false };

/** Send requests straight to http://127.0.0.1:<port>, with Origin and friends as real headers. For tests in Node. */
export function sendDirect() {
  target = { base: (stack) => `http://127.0.0.1:${portOf(stack)}`, direct: true };
}

/** The headers and body of a request, as the API should receive them. */
export function prepare(req: LabRequest, vars: Vars, token?: string) {
  const headers: [string, string][] = Object.entries(req.headers ?? {}).map(([k, v]) => [k, fill(v, vars)]);
  const has = (name: string) => headers.some(([k]) => k.toLowerCase() === name);
  let body: string | undefined;
  if (req.json !== undefined) {
    body = JSON.stringify(fillDeep(req.json, vars));
    if (!has('content-type')) headers.push(['Content-Type', 'application/json']);
  } else if (req.form) {
    body = new URLSearchParams(Object.entries(req.form).map(([k, v]) => [k, fill(v, vars)])).toString();
    if (!has('content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  } else if (req.raw !== undefined) body = fill(req.raw, vars);
  if (req.basic) headers.push(['Authorization', `Basic ${btoa(req.basic.join(':'))}`]);
  if (token) headers.push(['Authorization', `Bearer ${token}`]);
  return { path: fill(req.path, vars), headers, body };
}

const tokens = new Map<string, { token: string; until: number }>();

/** An access token for a demo client, from the stack's own token endpoint, kept until 30 seconds before it expires. */
export async function tokenFor(stack: StackId, client: ClientId): Promise<string> {
  const key = `${currentTarget()}:${stack}:${client}`;
  const hit = tokens.get(key);
  if (hit && hit.until > Date.now()) return hit.token;
  const r = await fetch(`${target.base(stack)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${client}:${client}-secret`)}` },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Could not get a token for "${client}" (HTTP ${r.status} from port ${portOf(stack)}). Is the server running, and does it have POST /oauth/token (concept 13) yet?`);
  const t = (await r.json()) as { access_token: string; expires_in: number };
  tokens.set(key, { token: t.access_token, until: Date.now() + (t.expires_in - 30) * 1000 });
  return t.access_token;
}

/** Forget cached tokens, so the next request fetches a fresh one. */
export const forgetTokens = () => tokens.clear();

async function sendOnce(stack: StackId, p: ReturnType<typeof prepare>, method: string): Promise<Result> {
  const headers = new Headers();
  for (const [k, v] of p.headers) headers.append(FORBIDDEN.has(k.toLowerCase()) && !target.direct ? `X-Lab-Set-${k}` : k, v);
  const start = performance.now();
  try {
    const r = await fetch(`${target.base(stack)}${p.path}`, { method, headers, body: p.body, cache: 'no-store', redirect: 'manual' });
    const text = await r.text();
    const ms = Math.round(performance.now() - start);
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], text, json, ms };
  } catch (e) {
    return { status: 0, statusText: e instanceof Error ? e.message : 'Network error', headers: [], text: '', ms: Math.round(performance.now() - start) };
  }
}

/** Send the request (several times when `times` says so) and return every response in the order it was sent. */
export async function send(stack: StackId, req: LabRequest, vars: Vars): Promise<Result[]> {
  const token = req.as ? await tokenFor(stack, req.as) : undefined;
  const p = prepare(req, vars, token);
  const n = Math.max(1, req.times ?? 1);
  if (req.parallel) return Promise.all(Array.from({ length: n }, () => sendOnce(stack, p, req.method)));
  const out: Result[] = [];
  for (let i = 0; i < n; i++) out.push(await sendOnce(stack, p, req.method));
  return out;
}

export const header = (r: Result, name: string) => r.headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

/** A value from a response: "body.data.0.id", "body.errors.length" or "header.etag". */
export function pick(r: Result, path: string): unknown {
  const [where, ...rest] = path.split('.');
  if (where === 'header') return header(r, rest.join('.'));
  let v: unknown = r.json;
  for (const part of rest) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

const show = (v: unknown) => (v === undefined ? 'nothing' : JSON.stringify(v));

function matches(actual: unknown, expected: unknown): boolean {
  if (expected === '*') return actual !== undefined && actual !== null;
  if (typeof expected === 'string' && expected.startsWith('~')) return typeof actual === 'string' && actual.toLowerCase().includes(expected.slice(1).toLowerCase());
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/** Check the responses against what the step expects, one line per check. */
export function check(expect: Expect | undefined, results: Result[]): Check[] {
  const out: Check[] = [];
  const last = results.at(-1);
  if (!expect || !last) return out;
  if (expect.status !== undefined) out.push({ label: `Status ${expect.status}`, ok: last.status === expect.status, detail: `got ${last.status}` });
  if (expect.statuses) {
    const got: Record<number, number> = {};
    for (const r of results) got[r.status] = (got[r.status] ?? 0) + 1;
    for (const [status, count] of Object.entries(expect.statuses))
      out.push({ label: `${count} × ${status}`, ok: got[Number(status)] === count, detail: `got ${got[Number(status)] ?? 0}` });
  }
  for (const [name, want] of Object.entries(expect.headers ?? {})) {
    const got = header(last, name);
    if (want === true) out.push({ label: `${name} is sent`, ok: got !== undefined, detail: got === undefined ? 'missing' : got });
    else if (want === false) out.push({ label: `No ${name} header`, ok: got === undefined, detail: got });
    else out.push({ label: `${name}: ${want.startsWith('~') ? `contains ${want.slice(1)}` : want}`, ok: got !== undefined && matches(got, want), detail: got ?? 'missing' });
  }
  for (const [path, want] of Object.entries(expect.body ?? {})) {
    const got = pick(last, `body.${path}`);
    out.push({ label: `${path} ${want === '*' ? 'is present' : `= ${typeof want === 'string' && want.startsWith('~') ? `…${want.slice(1)}…` : show(want)}`}`, ok: matches(got, want), detail: `got ${show(got)}` });
  }
  if (expect.empty) out.push({ label: 'Empty body', ok: last.text === '', detail: last.text ? `${last.text.length} characters` : undefined });
  return out;
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The same request as a curl command for your terminal, with $NAME for values not known yet. */
export function curlFor(req: LabRequest, stack: StackId, vars: Vars): string {
  const known = (text: string) => fill(text, vars).replace(PLACEHOLDER, (_m, name: string) => `$${name}`);
  const base = `http://localhost:${portOf(stack)}`;
  const parts = [`curl -si -X ${req.method} "${base}${known(req.path)}"`];
  if (req.basic) parts.push(`-u ${req.basic.join(':')}`);
  if (req.as) parts.push(`-H "Authorization: Bearer $${req.as.toUpperCase()}_TOKEN"`);
  for (const [k, v] of Object.entries(req.headers ?? {})) parts.push(`-H "${k}: ${known(v)}"`);
  if (req.json !== undefined) {
    if (!Object.keys(req.headers ?? {}).some((k) => k.toLowerCase() === 'content-type')) parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d ${q(known(JSON.stringify(req.json)))}`);
  } else if (req.form) {
    for (const [k, v] of Object.entries(req.form)) parts.push(`-d ${q(`${k}=${known(v)}`)}`);
  } else if (req.raw !== undefined) parts.push(`-d ${q(known(req.raw))}`);
  const one = parts.join(' \\\n  ');
  const n = req.times ?? 1;
  if (n <= 1) return one;
  return req.parallel
    ? `for i in $(seq ${n}); do\n  ${one.replace(/\n/g, '\n  ')} &\ndone; wait`
    : `for i in $(seq ${n}); do\n  ${one.replace(/\n/g, '\n  ')}\ndone`;
}

/** The terminal line that puts a client's token in $<CLIENT>_TOKEN, for the curl commands. */
export const tokenCommand = (client: ClientId, stack: StackId) =>
  `${client.toUpperCase()}_TOKEN=$(curl -s -u ${client}:${client}-secret -d grant_type=client_credentials http://localhost:${portOf(stack)}/oauth/token | jq -r .access_token)`;

/** A random UUID, also where crypto.randomUUID is missing (plain-HTTP pages outside localhost). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** HMAC-SHA256 of `<timestamp>.<body>` with the whole secret as key, as lowercase hex (SPEC.md, webhooks). */
export async function webhookSignature(secret: string, timestamp: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
