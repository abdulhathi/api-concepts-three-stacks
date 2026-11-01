// A practice lab is data: steps you do against the running Bookshop API, in the stack you pick.
// `try` steps send a real request through the lab's proxy and check the answer; `read` steps open the code that
// does it in each stack; `inbox` steps show webhook deliveries the lab received; `build` steps are changes you make
// yourself; `think` steps are a question with a hidden answer. PRACTICE-GUIDE.md is the writer brief.
import type { StackId } from '../lib/stacks';

/** The demo OAuth clients from SPEC.md. */
export type ClientId = 'reader' | 'writer' | 'partner' | 'admin' | 'free';

export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/**
 * One request. Text anywhere in it may use {{NAME}} placeholders: values from `Practice.vars`, values a step saved
 * (`save`), and LAB (this lab's address, for webhook URLs). A step whose placeholder has no value yet says which
 * step to run first.
 */
export type LabRequest = {
  method: Method;
  /** Path and query: "/v1/products?limit=2". */
  path: string;
  /** Request headers. Origin, Access-Control-Request-Method and -Headers are allowed: the proxy sets them for you. */
  headers?: Record<string, string>;
  /** A JSON body, sent with Content-Type: application/json unless `headers` sets another type. */
  json?: unknown;
  /** A raw body, sent exactly as written: broken JSON, or a body with the wrong Content-Type. */
  raw?: string;
  /** Form fields, sent as application/x-www-form-urlencoded (the OAuth token endpoint). */
  form?: Record<string, string>;
  /** HTTP Basic client authentication: [client_id, client_secret]. */
  basic?: [string, string];
  /** Send `Authorization: Bearer <token>` for this demo client; the lab fetches and caches the token itself. */
  as?: ClientId;
  /** Send the request this many times (default 1), one after another unless `parallel`. */
  times?: number;
  /** With `times`: send them all at once. */
  parallel?: boolean;
};

/**
 * What a correct answer looks like. Strings starting with "~" match when the actual value contains the rest.
 * With `times`, `status`, `headers` and `body` check the last response.
 */
export type Expect = {
  status?: number;
  /** With `times`: how many responses had each status, e.g. { 200: 5, 429: 1 }. */
  statuses?: Record<number, number>;
  /** Header name (any case) → exact value, "~part", true (present) or false (absent). */
  headers?: Record<string, string | boolean>;
  /** Dotted JSON path ("page.hasMore", "data.0.id", "errors.length") → value; "*" means present and not null. */
  body?: Record<string, unknown>;
  /** No body at all (204, 304, a HEAD). */
  empty?: boolean;
};

export type TryStep = {
  kind: 'try';
  title: string;
  /** One or two sentences: what this request shows and why it matters. */
  goal: string;
  request: LabRequest;
  expect?: Expect;
  /** Remember values for later steps: NAME → "body.id", "header.etag", "body.access_token". */
  save?: Record<string, string>;
  /** What to look at in the response, one point each. */
  notice: string[];
};

export type CodeRef = {
  /** Path inside APIConcepts/: "python-fastapi-aws/app/routes/orders.py". */
  path: string;
  /** First and last line to highlight. */
  lines?: [number, number];
  /** One sentence: what to look for in this code. */
  note: string;
};

export type ReadStep = {
  kind: 'read';
  title: string;
  goal: string;
  files: Record<StackId, CodeRef>;
};

export type InboxStep = {
  kind: 'inbox';
  title: string;
  goal: string;
  /** The inbox name (placeholders allowed); the API delivers to {{LAB}}/lab/inbox/<box>. */
  box: string;
  /** The webhook secret (usually "{{SECRET}}"), to check each delivery's signature in the browser. */
  secret?: string;
  /** Passes once at least this many deliveries arrived (default 1). */
  atLeast?: number;
  notice: string[];
};

export type BuildStep = {
  kind: 'build';
  title: string;
  /** What you will build or change, in one or two sentences. */
  task: string;
  /** The steps, in order. Mention files by their path inside APIConcepts/. */
  steps: string[];
  /** Hints, shown one at a time. Never the full solution. */
  hints: string[];
  /** A request that passes once your change works (the server must be restarted or watching for changes). */
  check?: { request: LabRequest; expect: Expect };
  /** A command that checks it, run from APIConcepts/: a test or the contract suite. */
  command?: string;
  /** How to put the code back afterwards, when the change is temporary. */
  undo?: string;
};

export type ThinkStep = {
  kind: 'think';
  title: string;
  question: string;
  answer: string;
};

export type PracticeStep = TryStep | ReadStep | InboxStep | BuildStep | ThinkStep;

export type Practice = {
  /** The concept id, which is also its folder name. */
  id: string;
  /** One or two sentences before the steps: what you will do. */
  intro: string;
  /** Values made once when the lab opens: NAME → "uuid" (a new UUID) or fixed text. "New values" makes them again. */
  vars?: Record<string, string>;
  steps: PracticeStep[];
};
