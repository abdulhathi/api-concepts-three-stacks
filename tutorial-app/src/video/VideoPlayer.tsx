import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { readJson, writeJson } from '../lib/storage';
import { canSpeak, speakLine, useVoices } from './speech';
import { SceneView, STAGE_H, STAGE_W } from './Stage';
import { buildTimeline, clock, gapAfter, THINK_MS } from './timeline';
import type { VideoScript } from './types';
import { savePosition, useWatched } from './watched';

const PREFS_KEY = 'api-lab.video-prefs';
type Prefs = { rate: number; voice: string; voiceOn: boolean; captions: boolean };
const DEFAULT_PREFS: Prefs = { rate: 1, voice: '', voiceOn: true, captions: true };
export const RATES = [0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.25, 1.5, 1.75] as const;

/** Scales the 960 × 540 stage to the space it has, like a video frame. */
function useStageScale() {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => setScale(Math.min(el.clientWidth / STAGE_W, (el.clientHeight || Infinity) / STAGE_H) || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { box, scale };
}

/**
 * Plays a video lesson: each step's caption is read aloud (or timed, with the voice off) and the
 * next step follows on its own. Space or K plays and pauses, ← → move one caption, F is full screen,
 * C toggles captions, M toggles the voice. Your place is saved, so you can leave and come back.
 */
export function VideoPlayer({ script, title }: { script: VideoScript; title: string }) {
  const tl = useMemo(() => buildTimeline(script), [script]);
  const last = tl.steps.length - 1;
  const watched = useWatched();
  const saved = watched[script.id];
  const [i, setI] = useState(() => (saved && !saved.done && saved.of === tl.steps.length ? Math.min(saved.at, last) : 0));
  const [resumed] = useState(() => i > 0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...readJson<Partial<Prefs>>(PREFS_KEY, {}) }));
  const [thinkLeft, setThinkLeft] = useState(0);
  const [full, setFull] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { box, scale } = useStageScale();
  const voices = useVoices();
  const voiceWorks = prefs.voiceOn && canSpeak();

  const step = tl.steps[i];
  const scene = script.scenes[step.scene];

  useEffect(() => {
    writeJson(PREFS_KEY, prefs);
  }, [prefs]);
  useEffect(() => {
    savePosition(script.id, i, tl.steps.length);
  }, [script.id, i, tl.steps.length]);

  // Play the current step, then move on. Every timer and voice is stopped when anything changes.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const advance = () => {
      if (cancelled) return;
      if (i >= last) {
        setPlaying(false);
        setEnded(true);
      } else {
        timers.push(setTimeout(() => !cancelled && setI(i + 1), gapAfter(tl.steps, i) / prefs.rate));
      }
    };
    let speaking: { cancel: () => void } | undefined;
    if (step.phase === 'think') {
      const end = Date.now() + THINK_MS;
      setThinkLeft(Math.ceil(THINK_MS / 1000));
      const tick = setInterval(() => setThinkLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
      timers.push(setTimeout(() => {
        clearInterval(tick);
        advance();
      }, THINK_MS));
      return () => {
        cancelled = true;
        clearInterval(tick);
        timers.forEach(clearTimeout);
      };
    }
    if (voiceWorks && step.speech) {
      const started = Date.now();
      const s = speakLine(step.speech, { voice: prefs.voice || undefined, rate: prefs.rate });
      speaking = s;
      void s.done.then((how) => {
        // A flow line stays up until its packets arrive, even when the voice finishes first.
        if (how === 'end') timers.push(setTimeout(advance, Math.max(0, (step.hold ?? 0) / prefs.rate - (Date.now() - started))));
        // The browser would not speak (no click on the page yet, or no voice): keep the caption up for its normal time.
        else if (how === 'error') timers.push(setTimeout(advance, Math.max(0, step.ms / prefs.rate - (Date.now() - started))));
      });
      // Some voices never report that they finished; never wait more than three times the estimate.
      timers.push(setTimeout(() => {
        s.cancel();
        advance();
      }, (step.ms * 3 + 4000) / prefs.rate));
    } else {
      timers.push(setTimeout(advance, step.ms / prefs.rate));
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      speaking?.cancel();
    };
  }, [playing, i, last, step, tl.steps, voiceWorks, prefs.voice, prefs.rate]);

  // The clock ticks while a line plays, so it moves smoothly instead of jumping line by line.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!playing) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) * prefs.rate), 500);
    return () => clearInterval(t);
  }, [playing, i, prefs.rate]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const go = (n: number, keepPlaying = playing) => {
    setEnded(false);
    setI(Math.max(0, Math.min(last, n)));
    setPlaying(keepPlaying);
  };
  const toggle = () => {
    if (ended || (i >= last && !playing)) {
      go(0, true);
      return;
    }
    setPlaying((p) => !p);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void wrap.current?.requestFullscreen?.();
  };
  const set = (p: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...p }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if ((k === ' ' && tag !== 'BUTTON' && tag !== 'INPUT') || k === 'k') toggle();
    else if ((k === 'arrowright' && tag !== 'INPUT') || k === 'l') go(i + 1);
    else if ((k === 'arrowleft' && tag !== 'INPUT') || k === 'j') go(i - 1);
    else if (k === 'f') fullscreen();
    else if (k === 'c') set({ captions: !prefs.captions });
    else if (k === 'm') set({ voiceOn: !prefs.voiceOn });
    else return;
    e.preventDefault();
  };

  const now = tl.starts[i] + Math.min(step.ms, elapsed);
  return (
    <div className={full ? 'vp is-full' : 'vp'} ref={wrap} tabIndex={-1} onKeyDown={onKeyDown} aria-label={`Video lesson: ${title}`} role="region">
      <div className="vp-box" ref={box} onClick={toggle}>
        <div className="vp-stage" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <SceneView scene={scene} step={step} playing={playing} rate={prefs.rate} thinkLeft={playing ? thinkLeft : Math.ceil(THINK_MS / 1000)} />
          {prefs.captions && (
            <p className="vp-cc" aria-hidden="true">
              <span>{step.caption}</span>
            </p>
          )}
          {!playing && (
            <span className="vp-big-play" aria-hidden="true">
              {ended ? '↻' : '▶'}
            </span>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {step.caption}
      </p>

      <div className="vp-bar" role="toolbar" aria-label="Video controls">
        <button type="button" className="vp-btn vp-play" onClick={toggle} aria-label={playing ? 'Pause' : ended ? 'Replay' : 'Play'}>
          {playing ? '❚❚' : ended ? '↻' : '▶'}
        </button>
        <button type="button" className="vp-btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous caption">
          ⏮
        </button>
        <button type="button" className="vp-btn" onClick={() => go(i + 1)} disabled={i === last} aria-label="Next caption">
          ⏭
        </button>
        <span className="vp-time">
          {clock(now)} / {clock(tl.totalMs)}
        </span>
        <input
          className="vp-seek"
          type="range"
          min={0}
          max={last}
          value={i}
          onChange={(e) => go(Number(e.target.value))}
          aria-label="Seek"
          aria-valuetext={`${clock(now)} of ${clock(tl.totalMs)}`}
          style={{ ['--pct' as string]: `${(100 * i) / Math.max(1, last)}%` }}
        />
        <select className="vp-sel" value={prefs.rate} onChange={(e) => set({ rate: Number(e.target.value) })} aria-label="Speed">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r.toFixed(2)}×
            </option>
          ))}
        </select>
        <button type="button" className={prefs.voiceOn ? 'vp-btn on' : 'vp-btn'} onClick={() => set({ voiceOn: !prefs.voiceOn })} aria-pressed={prefs.voiceOn} aria-label="Narration voice" title="Voice (M)">
          {prefs.voiceOn ? '🔊' : '🔇'}
        </button>
        <button type="button" className={prefs.captions ? 'vp-btn on' : 'vp-btn'} onClick={() => set({ captions: !prefs.captions })} aria-pressed={prefs.captions} aria-label="Captions" title="Captions (C)">
          CC
        </button>
        <button type="button" className="vp-btn" onClick={fullscreen} aria-label={full ? 'Exit full screen' : 'Full screen'} title="Full screen (F)">
          ⛶
        </button>
      </div>

      <div className="vp-sub">
        <label>
          Scene{' '}
          <select className="vp-sel" value={step.scene} onChange={(e) => go(tl.sceneStarts[Number(e.target.value)])}>
            {script.scenes.map((s, k) => (
              <option key={k} value={k}>
                {k + 1}. {s.title} · {clock(tl.starts[tl.sceneStarts[k]])}
              </option>
            ))}
          </select>
        </label>
        {voices.length > 0 && (
          <label>
            Voice{' '}
            <select className="vp-sel" value={prefs.voice || voices[0].name} onChange={(e) => set({ voice: e.target.value })}>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!canSpeak() && <span className="muted">This browser has no voice, so captions play on a timer.</span>}
        {resumed && i > 0 && !playing && !ended && (
          <span className="vp-resume">
            Picking up where you left off.{' '}
            <button type="button" className="chip-btn" onClick={() => go(0, false)}>
              Start over
            </button>
          </span>
        )}
      </div>

      <details className="vp-transcript">
        <summary>Transcript</summary>
        {script.scenes.map((s, k) => (
          <section key={k}>
            <h4>{s.title}</h4>
            <p>
              {tl.steps.map((st, n) =>
                st.scene === k && st.speech ? (
                  <button key={n} type="button" className={n === i ? 'vp-line now' : 'vp-line'} onClick={() => go(n)}>
                    {st.caption}
                  </button>
                ) : null,
              )}
            </p>
          </section>
        ))}
      </details>
    </div>
  );
}
