import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './word-helper.css';

// Select-to-understand, as in Study Scheduler: double-click a word to translate it, or select a phrase or sentence
// to get a small chip with Speak, Translate, Explain (a short Claude explanation in the context of the page) and
// Ask (type your own question about it, then follow-ups). Mount once near the app root. Selections inside fields
// and the code editor are left alone.
// Every study app has the same copy of this file, word-helper.css and server/words.ts: edit the Interview Library's,
// then run StudyHub/scripts/sync-word-helper.mjs (a Study Hub test fails while any copy differs).

type Mode = 'translate' | 'explain' | 'ask';
/** One question and its answer. An empty question stands for an Explain answer carried into Ask. */
type Turn = { question: string; answer: string | null; error?: string; model?: string };
type Popup = {
  mode: Mode;
  text: string;
  x: number;
  y: number;
  loading: boolean;
  translations: string[];
  explanation: string;
  model: string;
  error: string | null;
  cached: boolean;
  context: string;
  turns: Turn[];
};
type Chip = { text: string; x: number; y: number; context: string };

const POPUP_W = 340;
const ASK_W = 400;
const PAD = 12;
const MAX_LEN = 500;
const MAX_QUESTION = 500;
const CHIP_ID = 'word-helper-chip';
const POPUP_ID = 'word-helper-popup';
const LANG_LABEL: Record<string, string> = { ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', es: 'Spanish', fr: 'French' };
const LANG_GLYPH: Record<string, string> = { ta: 'த', hi: 'अ', te: 'అ', ml: 'അ', kn: 'ಅ' };

const popupWidth = (mode: Mode) => Math.min(mode === 'ask' ? ASK_W : POPUP_W, window.innerWidth - 2 * PAD);
const popupHeight = (mode: Mode) => (mode === 'ask' ? 380 : 220);

function insideEditable(node: Node | null): boolean {
  for (let el: Node | null = node; el; el = el.parentNode) {
    if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return true;
  }
  return false;
}

/** Trim whitespace and punctuation from the ends; keep hyphens, apostrophes and punctuation inside. */
export function normalizeSelection(raw: string): string {
  return raw.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
}

/** About 2,000 characters of the text around the selection, so Explain and Ask answer in context. */
function selectionContext(selected: string, maxLen = 2000): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const node = sel.getRangeAt(0).commonAncestorContainer;
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && (el.textContent?.length ?? 0) < 600 && el.parentElement && el.tagName !== 'BODY') el = el.parentElement;
  const full = (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (full.length <= maxLen) return full;
  const i = full.indexOf(selected.trim());
  if (i < 0) return full.slice(0, maxLen);
  const start = Math.max(0, i - Math.floor(maxLen / 2));
  return full.slice(start, start + maxLen);
}

function place(x: number, y: number, mode: Mode) {
  return {
    x: Math.min(Math.max(x + 8, PAD), window.innerWidth - popupWidth(mode) - PAD),
    y: Math.max(PAD, Math.min(y + 12, window.innerHeight - popupHeight(mode) - PAD)),
  };
}

/** Read the English text aloud (the source phrase, not the translation). */
function speak(text: string) {
  if (!('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.trim());
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

const SpeakerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M7 3.5L4 6H2v4h2l3 2.5v-9zM10.5 5.5a3 3 0 010 5l-.86-.86a2 2 0 000-3.28L10.5 5.5zm1.5-2a5 5 0 010 9l-.86-.86a4 4 0 000-7.28L12 3.5z" />
  </svg>
);
const SparkleIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1l1.3 3.7L13 6l-3.7 1.3L8 11 6.7 7.3 3 6l3.7-1.3L8 1zM13 10l.7 1.8L15.5 12l-1.8.7L13 14.5l-.7-1.8L10.5 12l1.8-.7L13 10z" />
  </svg>
);
const AskIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M2 3.5A2.5 2.5 0 014.5 1h7A2.5 2.5 0 0114 3.5v5a2.5 2.5 0 01-2.5 2.5H7.2L4 13.8V11h.5A2.5 2.5 0 012 8.5v-5z" />
  </svg>
)

type Props = {
  /** Translation target, a two-letter language code. Default: Tamil. */
  target?: string;
  /** Headers that prove a request comes from this app's own page, e.g. { 'X-Interview-Library': '1' }. */
  headers: Record<string, string>;
  /** The Claude model for Explain and Ask (the server falls back to its default). */
  model?: string;
};

async function call<T>(input: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error('Could not reach the app’s dev server.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? `The server answered ${res.status}.`);
  return data;
}

export function WordHelper({ target = 'ta', headers, model }: Props) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const close = useCallback(() => setPopup(null), []);
  const lang = LANG_LABEL[target] ?? target.toUpperCase();
  const glyph = LANG_GLYPH[target] ?? target.toUpperCase();
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const open = useCallback((text: string, x: number, y: number, mode: Mode, context: string) => {
    setChip(null);
    setPopup({ mode, text, ...place(x, y, mode), loading: mode !== 'ask', translations: [], explanation: '', model: '', error: null, cached: false, context, turns: [] });
  }, []);

  const switchMode = useCallback((mode: Mode) => {
    setPopup((p) => {
      if (!p || p.mode === mode) return p;
      if (mode === 'ask') {
        // Carry an explanation into the conversation, so a question can build on it.
        const seed = p.turns.length ? p.turns : p.mode === 'explain' && p.explanation ? [{ question: '', answer: p.explanation, model: p.model }] : [];
        return { ...p, mode, loading: false, error: null, turns: seed, ...place(p.x - 8, p.y - 12, mode) };
      }
      return { ...p, mode, loading: true, translations: [], explanation: '', model: '', error: null, cached: false };
    });
  }, []);

  /** Ask a question about the selection; earlier answered turns go along so follow-ups have the conversation. */
  const ask = useCallback(
    (question: string) => {
      const q = question.trim().slice(0, MAX_QUESTION);
      if (!q || !popup) return;
      const base = popup.mode === 'ask' ? popup.turns : popup.explanation ? [{ question: '', answer: popup.explanation, model: popup.model }] : [];
      const history = base.filter((t) => t.answer).map((t) => ({ question: t.question, answer: t.answer! }));
      const index = base.length;
      const { text, context } = popup;
      setPopup((p) => (p ? { ...p, mode: 'ask', loading: false, error: null, turns: [...base, { question: q, answer: null }], ...(p.mode === 'ask' ? {} : place(p.x - 8, p.y - 12, 'ask')) } : p));
      const patch = (t: Partial<Turn>) =>
        setPopup((p) => (p && p.text === text && p.mode === 'ask' ? { ...p, turns: p.turns.map((turn, i) => (i === index ? { ...turn, ...t } : turn)) } : p));
      call<{ answer: string; model: string }>('/api/words/ask', {
        method: 'POST',
        headers: { ...headersRef.current, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context, question: q, history, model }),
      })
        .then((r) => patch({ answer: r.answer, model: r.model }))
        .catch((e: unknown) => patch({ answer: '', error: e instanceof Error ? e.message : String(e) }));
    },
    [popup, model],
  );

  // Double-click a word: translate it straight away.
  useEffect(() => {
    const onDbl = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(`#${POPUP_ID}, #${CHIP_ID}`) || insideEditable(e.target as Node)) return;
      const text = normalizeSelection(window.getSelection()?.toString() ?? '');
      if (!text || text.length > MAX_LEN) return;
      open(text, e.clientX, e.clientY, 'translate', selectionContext(text));
    };
    document.addEventListener('dblclick', onDbl);
    return () => document.removeEventListener('dblclick', onDbl);
  }, [open]);

  // Select two or more words: offer the chip next to the selection.
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(`#${POPUP_ID}, #${CHIP_ID}`) || insideEditable(e.target as Node)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel && sel.rangeCount > 0 ? normalizeSelection(sel.toString()) : '';
        if (!sel || !text || text.length > MAX_LEN || text.split(/\s+/).length < 2) return setChip(null);
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return setChip(null);
        setChip({
          text,
          x: Math.max(PAD, Math.min(rect.right + 6, window.innerWidth - 280 - PAD)),
          y: Math.max(PAD, Math.min(rect.bottom + 4, window.innerHeight - 40 - PAD)),
          context: selectionContext(text),
        });
      }, 0);
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // The chip's position goes stale when the page scrolls or resizes.
  useEffect(() => {
    if (!chip) return;
    const hide = () => setChip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [chip]);

  // Fetch a translation or an explanation when the popup asks for one.
  const text = popup?.text;
  const mode = popup?.mode;
  const loading = popup?.loading;
  const context = popup?.context ?? '';
  useEffect(() => {
    if (!text || !loading || mode === 'ask') return;
    let live = true;
    const done = (patch: Partial<Popup>) => live && setPopup((p) => (p && p.text === text && p.mode === mode ? { ...p, loading: false, ...patch } : p));
    const request =
      mode === 'translate'
        ? call<{ translations: string[]; cached: boolean }>(`/api/words/translate?${new URLSearchParams({ text, target })}`, { headers: headersRef.current }).then((r) =>
            done({ translations: r.translations, cached: r.cached }),
          )
        : call<{ explanation: string; model: string; cached: boolean }>('/api/words/explain', {
            method: 'POST',
            headers: { ...headersRef.current, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, context, model }),
          }).then((r) => done({ explanation: r.explanation, model: r.model, cached: r.cached }));
    request.catch((e: unknown) => done({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [text, mode, loading, context, target, model]);

  // Escape or a click outside closes the popup.
  const isOpen = popup !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!document.getElementById(POPUP_ID)?.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close();
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  const lastModel = [...(popup?.turns ?? [])].reverse().find((t) => t.model)?.model ?? popup?.model;
  return (
    <>
      {chip &&
        createPortal(
          // preventDefault on mousedown keeps the selection alive while a chip button is pressed.
          <div id={CHIP_ID} className="wh-chip" style={{ left: chip.x, top: chip.y }} onMouseDown={(e) => e.preventDefault()} role="toolbar" aria-label="Selected text">
            <button type="button" className="wh-speak" onClick={() => speak(chip.text)} title="Read aloud (English)" aria-label="Read aloud">
              <SpeakerIcon />
            </button>
            <button type="button" className="wh-translate" onClick={() => open(chip.text, chip.x, chip.y, 'translate', chip.context)} title={`Translate to ${lang}`}>
              <span className="wh-glyph" aria-hidden="true">{glyph}</span> Translate
            </button>
            <button type="button" className="wh-explain" onClick={() => open(chip.text, chip.x, chip.y, 'explain', chip.context)} title="Explain with Claude">
              <SparkleIcon /> Explain
            </button>
            <button type="button" className="wh-ask" onClick={() => open(chip.text, chip.x, chip.y, 'ask', chip.context)} title="Ask Claude a question about it">
              <AskIcon /> Ask
            </button>
          </div>,
          document.body,
        )}
      {popup &&
        createPortal(
          <div
            id={POPUP_ID}
            className={popup.mode === 'ask' ? 'wh-popup ask' : 'wh-popup'}
            style={{ left: popup.x, top: popup.y, width: popupWidth(popup.mode) }}
            role="dialog"
            aria-label={popup.mode === 'ask' ? 'Ask a question' : popup.mode === 'explain' ? 'Explanation' : 'Translation'}
          >
            <div className="wh-head">
              <span className={`wh-mode ${popup.mode}`}>{popup.mode === 'ask' ? 'Ask' : popup.mode === 'explain' ? 'Explain' : `EN → ${target.toUpperCase()}`}</span>
              <span className="wh-term" title={popup.text}>{popup.text}</span>
              <button type="button" onClick={() => speak(popup.text)} title="Read aloud (English)" aria-label="Read aloud">
                <SpeakerIcon />
              </button>
              {popup.mode !== 'translate' && (
                <button type="button" className="wh-glyph" onClick={() => switchMode('translate')} title={`Translate to ${lang}`} aria-label={`Translate to ${lang}`}>
                  {glyph}
                </button>
              )}
              {popup.mode !== 'explain' && (
                <button type="button" className="wh-sparkle" onClick={() => switchMode('explain')} title="Explain with Claude" aria-label="Explain with Claude">
                  <SparkleIcon />
                </button>
              )}
              {popup.mode !== 'ask' && (
                <button type="button" className="wh-ask-btn" onClick={() => switchMode('ask')} title="Ask a question about it" aria-label="Ask a question about it">
                  <AskIcon />
                </button>
              )}
              <button type="button" onClick={close} title="Close (Esc)" aria-label="Close">
                ✕
              </button>
            </div>
            {popup.mode === 'ask' ? (
              <AskPanel popup={popup} onAsk={ask} />
            ) : (
              <div className="wh-body" aria-live="polite">
                {popup.loading ? (
                  <p className="wh-wait">
                    <span className={popup.mode === 'explain' ? 'wh-spin explain' : 'wh-spin'} aria-hidden="true" />
                    {popup.mode === 'explain' ? 'Asking Claude…' : 'Translating…'}
                  </p>
                ) : popup.error ? (
                  <p className="wh-error" role="alert">{popup.error}</p>
                ) : popup.mode === 'explain' ? (
                  <>
                    <p className="wh-explanation">{popup.explanation}</p>
                    <AskBox onAsk={ask} placeholder="Ask a question about this…" />
                  </>
                ) : (
                  <ol className="wh-list">
                    {popup.translations.map((t, i) => (
                      <li key={i} className={i === 0 ? 'first' : undefined}>{t}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <div className="wh-foot">
              <span>{popup.mode === 'translate' ? 'via MyMemory' : `via Claude${lastModel ? ` · ${lastModel}` : ''}`}</span>
              {popup.cached && popup.mode !== 'ask' && <span className="wh-cached">cached</span>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** The conversation about the selection, newest at the bottom, with the box for the next question. */
function AskPanel({ popup, onAsk }: { popup: Popup; onAsk: (q: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const pending = popup.turns.some((t) => t.answer === null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [popup.turns]);
  return (
    <div className="wh-ask-panel">
      <div className="wh-turns" ref={list} aria-live="polite">
        {popup.turns.length === 0 && <p className="wh-hint">Ask anything about “{popup.text}”: what it means here, why it matters, an example, how it compares with something else.</p>}
        {popup.turns.map((t, i) => (
          <div key={i} className="wh-turn">
            {t.question ? <p className="wh-q">{t.question}</p> : <p className="wh-q explain">Explanation</p>}
            {t.answer === null ? (
              <p className="wh-wait">
                <span className="wh-spin ask" aria-hidden="true" />
                Asking Claude…
              </p>
            ) : t.error ? (
              <p className="wh-error" role="alert">{t.error}</p>
            ) : (
              <p className="wh-a">{t.answer}</p>
            )}
          </div>
        ))}
      </div>
      <AskBox onAsk={onAsk} disabled={pending} autoFocus placeholder={popup.turns.length ? 'Ask a follow-up…' : 'Type your question…'} />
    </div>
  );
}

/** A question box: Enter asks, Shift+Enter makes a new line. */
function AskBox({ onAsk, disabled, autoFocus, placeholder }: { onAsk: (q: string) => void; disabled?: boolean; autoFocus?: boolean; placeholder: string }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled || !value.trim()) return;
    onAsk(value);
    setValue('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit();
  };
  return (
    <form className="wh-askbox" onSubmit={submit}>
      <textarea
        ref={ref}
        rows={2}
        value={value}
        maxLength={MAX_QUESTION}
        placeholder={placeholder}
        aria-label="Your question"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Ask
      </button>
    </form>
  );
}
