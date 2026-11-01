import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyBlock } from '../components/Copy';
import { openCode } from '../lib/code';
import { passStep, resetPractice, setMark, useProgress } from '../lib/progress';
import { portOf, setStack, setTarget, STACKS, stackOf, useHealth, useStack, useTarget, type StackId } from '../lib/stacks';
import { check, curlFor, fill, fillDeep, missingVars, pick, prepare, send, tokenCommand, uuid, webhookSignature, type Check, type Result, type Vars } from './run';
import type { BuildStep, InboxStep, LabRequest, Practice, PracticeStep, ReadStep, ThinkStep, TryStep } from './types';

/** Steps that count towards "practiced": the ones the lab can check. */
export const checkedSteps = (p: Practice) => p.steps.flatMap((s, i) => (s.kind === 'try' || s.kind === 'read' || s.kind === 'inbox' ? [i] : []));

export const makeVars = (p: Practice): Vars =>
  Object.fromEntries(Object.entries(p.vars ?? {}).map(([k, v]) => [k, v === 'uuid' ? uuid() : v]));

const labOrigin = () => (typeof window === 'undefined' ? 'http://localhost:5195' : window.location.origin);

/** The practice lab of one concept: pick a stack, then work through the steps in order. */
export function PracticeView({ topicId, practice }: { topicId: string; practice: Practice }) {
  const stack = useStack();
  const target = useTarget();
  const health = useHealth(5000, target);
  const progress = useProgress()[topicId];
  const [base, setBase] = useState<Vars>(() => makeVars(practice));
  const [saved, setSaved] = useState<Partial<Record<StackId, Vars>>>({});
  const vars = useMemo<Vars>(() => ({ LAB: labOrigin(), ...base, ...saved[stack] }), [base, saved, stack]);
  const counted = useMemo(() => checkedSteps(practice), [practice]);
  const passed = new Set(progress?.passed?.[stack] ?? []);
  const clients = useMemo(() => [...new Set(practice.steps.flatMap((s) => (s.kind === 'try' && s.request.as ? [s.request.as] : [])))], [practice]);

  const pass = useCallback((i: number) => passStep(topicId, stack, i, counted), [topicId, stack, counted]);
  const save = useCallback((values: Vars) => setSaved((prev) => ({ ...prev, [stack]: { ...prev[stack], ...values } })), [stack]);
  /** The step that saves a value, for "run step N first". */
  const saverOf = (name: string) => practice.steps.findIndex((s) => s.kind === 'try' && s.save && name in s.save);

  return (
    <div className="practice">
      <p className="lede-sm">{practice.intro}</p>

      <div className="target-bar" role="group" aria-label="Whose servers">
        <button type="button" className={target === 'stack' ? 'chip-btn on' : 'chip-btn'} aria-pressed={target === 'stack'} onClick={() => setTarget('stack')}>
          Reference servers
        </button>
        <button type="button" className={target === 'mine' ? 'chip-btn on' : 'chip-btn'} aria-pressed={target === 'mine'} onClick={() => setTarget('mine')}>
          My servers (built by hand)
        </button>
      </div>
      <div className="stack-bar" role="group" aria-label="Server to practice on">
        {STACKS.map((s) => (
          <button key={s.id} type="button" className={s.id === stack ? 'stack-btn on' : 'stack-btn'} aria-pressed={s.id === stack} onClick={() => setStack(s.id)}>
            <span className={`dot ${health[s.id]}`} aria-hidden="true" />
            {s.name}
            <span className="stack-port">:{portOf(s.id, target)}</span>
            {progress?.practiced?.includes(s.id) && <span className="tag ok">done</span>}
          </button>
        ))}
      </div>
      {health[stack] === 'down' &&
        (target === 'stack' ? (
          <div className="box warn">
            <span className="box-label">{stackOf(stack).short} server is not running</span>
            <p>Start it in a terminal from the folder that holds SPEC.md (or from Study Hub, if you use it):</p>
            <CopyBlock text={stackOf(stack).start} />
          </div>
        ) : (
          <div className="box warn">
            <span className="box-label">Your {stackOf(stack).short} server is not running</span>
            <p>Start your own server on port {stackOf(stack).minePort}, from the bookshop-api-handbuilt folder:</p>
            <CopyBlock text={`cd ${stackOf(stack).mineDir} && ./start.sh`} />
            <p className="small">Steps that send a token need your POST /oauth/token (concept 13). Until then, use the Build tab’s check instead.</p>
          </div>
        ))}

      <div className="practice-tools">
        <span>
          {counted.filter((i) => passed.has(i)).length} of {counted.length} steps passed on {stackOf(stack).short}
        </span>
        <button type="button" className="chip-btn" onClick={() => (setBase(makeVars(practice)), setSaved({}))} title="New idempotency keys and other generated values; forget saved ids">
          New values
        </button>
        <button type="button" className="chip-btn" onClick={() => resetPractice(topicId)}>
          Start over
        </button>
      </div>

      <details className="terminal-setup">
        <summary>Prefer your terminal? Set these first</summary>
        <p>Every step also shows its curl command. These lines put a token for each demo client in a shell variable:</p>
        <CopyBlock
          text={[...clients.map((c) => tokenCommand(c, stack)), ...Object.entries(base).map(([k, v]) => `${k}=${v}`)].join('\n') || '# This lab needs no tokens.'}
        />
      </details>

      <ol className="steps">
        {practice.steps.map((s, i) => (
          <li key={i} className={`pstep pstep-${s.kind}${passed.has(i) ? ' passed' : ''}`}>
            <StepView step={s} i={i} stack={stack} vars={vars} passed={passed.has(i)} onPass={() => pass(i)} onSave={save} saverOf={saverOf} topicId={topicId} />
          </li>
        ))}
      </ol>
    </div>
  );
}

type StepProps = {
  step: PracticeStep;
  i: number;
  stack: StackId;
  vars: Vars;
  passed: boolean;
  onPass: () => void;
  onSave: (v: Vars) => void;
  saverOf: (name: string) => number;
  topicId: string;
};

const KIND_LABEL: Record<PracticeStep['kind'], string> = { try: 'Try it', read: 'Read the code', inbox: 'Watch the inbox', build: 'Build it yourself', think: 'Think' };

function StepView(props: StepProps) {
  const { step, i, passed } = props;
  return (
    <>
      <header className="pstep-head">
        <span className="pstep-n">{passed ? '✓' : i + 1}</span>
        <span className="pstep-kind">{KIND_LABEL[step.kind]}</span>
        <h3>{step.title}</h3>
      </header>
      {step.kind === 'try' && <TryView {...props} step={step} />}
      {step.kind === 'read' && <ReadView {...props} step={step} />}
      {step.kind === 'inbox' && <InboxView {...props} step={step} />}
      {step.kind === 'build' && <BuildView {...props} step={step} />}
      {step.kind === 'think' && <ThinkView step={step} />}
    </>
  );
}

/** The request as it goes on the wire, with a placeholder where the lab adds the token. */
function preview(req: LabRequest, vars: Vars): string {
  const p = prepare(req, vars, req.as ? `‹${req.as} token›` : undefined);
  let body = p.body ?? '';
  if (req.json !== undefined) body = JSON.stringify(JSON.parse(p.body!), null, 2);
  const times = req.times && req.times > 1 ? `   × ${req.times}${req.parallel ? ' at once' : ''}` : '';
  return [`${req.method} ${p.path}${times}`, ...p.headers.map(([k, v]) => `${k}: ${v}`), ...(body ? ['', body] : [])].join('\n');
}

function TryView({ step, stack, vars, onPass, onSave, saverOf }: StepProps & { step: TryStep }) {
  const [state, setState] = useState<{ busy?: boolean; results?: Result[]; checks?: Check[]; error?: string; stack?: StackId; target?: string }>({});
  const [curl, setCurl] = useState(false);
  const target = useTarget();
  const missing = missingVars(step.request, vars);
  const run = async () => {
    setState({ busy: true });
    try {
      const results = await send(stack, step.request, vars);
      const checks = check(fillDeep(step.expect, vars), results);
      const last = results.at(-1)!;
      setState({ results, checks, stack, target });
      if (step.save) {
        const values: Vars = {};
        for (const [name, path] of Object.entries(step.save)) {
          const v = pick(last, path);
          if (v !== undefined && v !== null) values[name] = String(v);
        }
        onSave(values);
      }
      if (last.status !== 0 && checks.every((c) => c.ok)) onPass();
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  // A result from another stack would mislead: clear it when the stack changes.
  const results = state.stack === stack && state.target === target ? state.results : undefined;
  return (
    <div className="pstep-body">
      <p>{step.goal}</p>
      <pre className="http-msg out" aria-label="The request">
        {preview(step.request, vars)}
      </pre>
      {missing.length > 0 ? (
        <p className="box warn">
          Run step {missing.map((m) => saverOf(m) + 1).filter((n) => n > 0).join(' and ') || 'above'} first: it saves {missing.map((m) => `{{${m}}}`).join(', ')}.
        </p>
      ) : (
        <div className="pstep-actions">
          <button type="button" className="btn primary" onClick={run} disabled={state.busy}>
            {state.busy ? 'Sending…' : `Send to ${stackOf(stack).short}`}
          </button>
          <button type="button" className="chip-btn" aria-expanded={curl} onClick={() => setCurl((c) => !c)}>
            {curl ? 'Hide curl' : 'Show curl'}
          </button>
        </div>
      )}
      {curl && (
        <>
          {step.request.as && <p className="small">First set <code>${step.request.as.toUpperCase()}_TOKEN</code> (see “Prefer your terminal?” above).</p>}
          <CopyBlock text={curlFor(step.request, stack, vars)} />
        </>
      )}
      {state.error && <p className="box warn">{state.error}</p>}
      {results && <Responses results={results} checks={state.checks ?? []} expectHeaders={Object.keys(step.expect?.headers ?? {})} />}
      {results && step.notice.length > 0 && (
        <div className="notice">
          <p className="notice-h">What to notice</p>
          <ul>
            {step.notice.map((n, k) => (
              <li key={k}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function statusClass(s: number) {
  return s === 0 ? 'st-fail' : s < 300 ? 'st-ok' : s < 400 ? 'st-redirect' : s < 500 ? 'st-client' : 'st-fail';
}

function Responses({ results, checks, expectHeaders }: { results: Result[]; checks: Check[]; expectHeaders: string[] }) {
  const last = results.at(-1)!;
  const [all, setAll] = useState(false);
  const wanted = new Set(expectHeaders.map((h) => h.toLowerCase()));
  const body = last.json !== undefined ? JSON.stringify(last.json, null, 2) : last.text;
  const lines = body.split('\n');
  const long = lines.length > 40;
  return (
    <div className="response">
      {results.length > 1 && (
        <ol className="resp-list" aria-label="Every response">
          {results.map((r, k) => (
            <li key={k}>
              <span className={`st ${statusClass(r.status)}`}>{r.status || 'ERR'}</span> <span className="ms">{r.ms} ms</span>
            </li>
          ))}
        </ol>
      )}
      <pre className="http-msg in" aria-label="The response">
        <span className={`st ${statusClass(last.status)}`}>
          {last.status ? `${last.status} ${last.statusText}` : `No answer: ${last.statusText}`}
        </span>
        <span className="ms"> · {last.ms} ms</span>
        {'\n'}
        {last.headers.map(([k, v]) => (
          <span key={k} className={wanted.has(k) ? 'hl' : undefined}>
            {k}: {v}
            {'\n'}
          </span>
        ))}
        {body && '\n'}
        {long && !all ? lines.slice(0, 40).join('\n') + '\n…' : body}
      </pre>
      {long && (
        <button type="button" className="chip-btn" onClick={() => setAll((a) => !a)}>
          {all ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      )}
      {checks.length > 0 && (
        <ul className="checks" aria-label="Checks">
          {checks.map((c, k) => (
            <li key={k} className={c.ok ? 'ok' : 'bad'}>
              {c.ok ? '✓' : '✗'} {c.label}
              {!c.ok && c.detail && <span className="detail"> ({c.detail})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadView({ step, stack, onPass }: StepProps & { step: ReadStep }) {
  const mine = step.files[stack];
  const open = (s: StackId) => {
    openCode({ path: step.files[s].path, lines: step.files[s].lines });
    if (s === stack) onPass();
  };
  return (
    <div className="pstep-body">
      <p>{step.goal}</p>
      <p className="read-note">
        <b>{stackOf(stack).name}:</b> {mine.note}
      </p>
      <div className="pstep-actions">
        <button type="button" className="btn primary" onClick={() => open(stack)}>
          Open {mine.path.split('/').pop()}
          {mine.lines && ` · lines ${mine.lines[0]}–${mine.lines[1]}`}
        </button>
        {STACKS.filter((s) => s.id !== stack).map((s) => (
          <button key={s.id} type="button" className="chip-btn" onClick={() => open(s.id)} title={step.files[s.id].note}>
            Compare: {s.short}
          </button>
        ))}
      </div>
    </div>
  );
}

type InboxDelivery = { n: number; at: string; answered: number; headers: Record<string, string>; body: string };

function InboxView({ step, vars, onPass }: StepProps & { step: InboxStep }) {
  const [list, setList] = useState<InboxDelivery[]>();
  const [valid, setValid] = useState<Record<number, boolean>>({});
  const [watch, setWatch] = useState(false);
  const box = fill(step.box, vars);
  const url = `${vars.LAB}/lab/inbox/${box}`;
  const secret = step.secret ? vars[step.secret.replace(/^\{\{|\}\}$/g, '')] : undefined;

  const load = useCallback(async () => {
    const r = await fetch(`/lab/inbox/${box}`, { cache: 'no-store' }).catch(() => undefined);
    if (r?.ok) setList(((await r.json()) as { data: InboxDelivery[] }).data);
  }, [box]);

  useEffect(() => {
    if (!watch) return;
    void load();
    const t = setInterval(() => void load(), 1500);
    return () => clearInterval(t);
  }, [watch, load]);

  useEffect(() => {
    if (!list || !secret) return;
    let live = true;
    void Promise.all(
      list.map(async (d) => {
        const want = `v1=${await webhookSignature(secret, d.headers['webhook-timestamp'] ?? '', d.body)}`;
        return [d.n, d.headers['webhook-signature'] === want] as const;
      }),
    ).then((rows) => live && setValid(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
  }, [list, secret]);

  useEffect(() => {
    if (!list) return;
    const ok = list.filter((d) => d.answered === 200 && (!secret || valid[d.n]));
    if (ok.length >= (step.atLeast ?? 1)) onPass();
  }, [list, valid, secret, step.atLeast, onPass]);

  return (
    <div className="pstep-body">
      <p>{step.goal}</p>
      <p className="small">
        Deliveries to <code>{url}</code> land here.
      </p>
      <div className="pstep-actions">
        <button type="button" className="btn primary" onClick={() => setWatch((w) => !w)} aria-pressed={watch}>
          {watch ? 'Watching… (stop)' : 'Watch the inbox'}
        </button>
        <button type="button" className="chip-btn" onClick={() => void fetch(`/lab/inbox/${box}`, { method: 'DELETE' }).then(load)}>
          Empty it
        </button>
      </div>
      {list && list.length === 0 && <p className="small">Nothing yet. Do the step above that makes an event, then wait a moment.</p>}
      {list && list.length > 0 && (
        <ol className="inbox">
          {list.map((d) => (
            <li key={d.n}>
              <p className="inbox-head">
                <span className={`st ${d.answered === 200 ? 'st-ok' : 'st-fail'}`}>answered {d.answered}</span> <span className="ms">{new Date(d.at).toLocaleTimeString()}</span>
                {secret && <span className={valid[d.n] ? 'sig ok' : 'sig bad'}>{valid[d.n] ? '✓ signature valid' : '✗ signature does not match'}</span>}
              </p>
              <pre className="http-msg in">
                {Object.entries(d.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
                {'\n\n'}
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(d.body), null, 2);
                  } catch {
                    return d.body;
                  }
                })()}
              </pre>
            </li>
          ))}
        </ol>
      )}
      {list && list.length > 0 && step.notice.length > 0 && (
        <div className="notice">
          <p className="notice-h">What to notice</p>
          <ul>
            {step.notice.map((n, k) => (
              <li key={k}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BuildView({ step, stack, vars, topicId }: StepProps & { step: BuildStep }) {
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<{ checks: Check[]; status: number }>();
  const built = useProgress()[topicId]?.built ?? false;
  const verify = async () => {
    if (!step.check) return;
    const results = await send(stack, step.check.request, vars);
    const checks = check(fillDeep(step.check.expect, vars), results);
    setResult({ checks, status: results.at(-1)!.status });
    if (checks.every((c) => c.ok)) setMark(topicId, 'built', true);
  };
  return (
    <div className="pstep-body">
      <p>{step.task}</p>
      <ol className="build-steps">
        {step.steps.map((s, k) => (
          <li key={k}>{s}</li>
        ))}
      </ol>
      {step.hints.slice(0, hints).map((h, k) => (
        <p key={k} className="hint">
          <b>Hint {k + 1}.</b> {h}
        </p>
      ))}
      <div className="pstep-actions">
        {hints < step.hints.length && (
          <button type="button" className="chip-btn" onClick={() => setHints((h) => h + 1)}>
            Show hint {hints + 1} of {step.hints.length}
          </button>
        )}
        {step.check && (
          <button type="button" className="btn primary" onClick={() => void verify()}>
            Check my change on {stackOf(stack).short}
          </button>
        )}
      </div>
      {step.command && (
        <>
          <p className="small">Check it from the APIConcepts folder:</p>
          <CopyBlock text={step.command} />
        </>
      )}
      {result && (
        <ul className="checks">
          {result.checks.map((c, k) => (
            <li key={k} className={c.ok ? 'ok' : 'bad'}>
              {c.ok ? '✓' : '✗'} {c.label}
              {!c.ok && c.detail && <span className="detail"> ({c.detail})</span>}
            </li>
          ))}
        </ul>
      )}
      {step.undo && (
        <p className="small">
          Done? Put the code back: <code>{step.undo}</code>
        </p>
      )}
      <label className="done">
        <input type="checkbox" checked={built} onChange={(e) => setMark(topicId, 'built', e.target.checked)} />I built it and it works
      </label>
    </div>
  );
}

function ThinkView({ step }: { step: ThinkStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pstep-body">
      <p className="think-q">{step.question}</p>
      <button type="button" className="chip-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the answer' : 'Show the answer'}
      </button>
      {open && <p className="think-a">{step.answer}</p>}
    </div>
  );
}

