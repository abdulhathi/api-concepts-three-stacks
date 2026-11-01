import { useEffect, useRef, useState } from 'react';
import { githubUrl, hasCode, loadCode, openCode, useOpenCode } from '../lib/code';

/** The source file a guide or practice step points at, in a panel beside the page, with its lines highlighted. */
export function CodeDrawer() {
  const file = useOpenCode();
  const [text, setText] = useState<{ path: string; value?: string; error?: string }>();
  const mark = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!file) return;
    let live = true;
    if (!hasCode(file.path)) {
      setText({ path: file.path, error: 'This file is not bundled with the lab.' });
      return;
    }
    loadCode(file.path).then(
      (value) => live && setText({ path: file.path, value }),
      (e: unknown) => live && setText({ path: file.path, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openCode(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file]);

  useEffect(() => {
    mark.current?.scrollIntoView?.({ block: 'center' });
  }, [text, file?.lines]);

  if (!file) return null;
  const ready = text?.path === file.path ? text : undefined;
  const [from, to] = file.lines ?? [0, -1];
  const lines = ready?.value?.replace(/\n$/, '').split('\n') ?? [];
  return (
    <aside className="code-drawer" role="dialog" aria-label={`Code: ${file.path}`}>
      <header className="code-head">
        <code className="code-path">
          {file.path}
          {file.lines && ` · lines ${from}–${to}`}
        </code>
        <a className="chip-btn" href={githubUrl(file.path, file.lines)} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <button type="button" className="chip-btn" onClick={() => openCode(null)} aria-label="Close the code">
          Close ✕
        </button>
      </header>
      {ready?.error && <p className="box warn">{ready.error}</p>}
      {!ready && <p className="loading">Loading…</p>}
      {ready?.value !== undefined && (
        <pre className="code-body">
          {lines.map((line, i) => {
            const n = i + 1;
            const on = n >= from && n <= to;
            return (
              <span key={n} ref={n === from ? mark : undefined} className={on ? 'cl on' : 'cl'}>
                <span className="ln">{n}</span>
                {line || ' '}
                {'\n'}
              </span>
            );
          })}
        </pre>
      )}
    </aside>
  );
}
