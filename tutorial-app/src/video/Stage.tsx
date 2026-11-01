import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { findTopic, numberOf } from '../curriculum';
import { FlowView } from '../flow/Flow';
import { stateAt } from '../flow/geometry';
import type { Step } from './timeline';
import type { Scene } from './types';

/** The size every scene is laid out at; the player scales it to fit, like a video frame. */
export const STAGE_W = 960;
export const STAGE_H = 540;

const COST = /([OΘΩ]\((?:[^()]|\([^()]*\))*\))/;

/** Slide text: Big-O expressions become badges, the rest stays plain. */
export function Txt({ children }: { children: string }) {
  const parts = children.split(COST);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="cost">{p}</span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Fits the content to the stage: shrinks it when a scene is too big, instead of cutting it off. */
function Fit({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const o = outer.current;
    const n = inner.current;
    if (!o || !n || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const h = n.scrollHeight;
      const w = n.scrollWidth;
      if (!h || !w) return;
      setScale(Math.min(1, o.clientHeight / h, o.clientWidth / w));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(n);
    ro.observe(o);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="vs-fit" ref={outer}>
      <div className="vs-fit-in" ref={inner} style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}>
        {children}
      </div>
    </div>
  );
}

const shown = (i: number, reveal: number) => (i < reveal ? 'vs-item on' : 'vs-item');

/** One scene at one step: what the viewer sees behind the caption. `rate` is the playback speed, for moving packets. */
export function SceneView({ scene, step, thinkLeft, playing = true, rate = 1 }: { scene: Scene; step: Step; thinkLeft?: number; playing?: boolean; rate?: number }) {
  if (scene.kind === 'title') {
    return (
      <div className="vs-scene vs-title">
        <p className="vs-brand">API Concepts Lab · video lesson</p>
        <h2 className="vs-big">{scene.title}</h2>
        <p className="vs-sub">
          <Txt>{scene.subtitle}</Txt>
        </p>
        <TitleArt />
      </div>
    );
  }
  if (scene.kind === 'flow') {
    const note = stateAt(scene, step.beat).note;
    return (
      <div className="vs-scene scene-flow">
        <div className="vs-flow-head">
          <h3 className="vs-h">{scene.title}</h3>
          {note && (
            <p className="vs-note" key={note}>
              {note}
            </p>
          )}
        </div>
        <div className="vs-flow">
          <FlowView diagram={scene} beat={step.beat} playing={playing} rate={rate} />
        </div>
      </div>
    );
  }
  return (
    <div className={`vs-scene scene-${scene.kind}`}>
      <h3 className="vs-h">{scene.title}</h3>
      <Fit>
        <Body scene={scene} step={step} thinkLeft={thinkLeft} />
      </Fit>
    </div>
  );
}

/** A quiet network of boxes behind the title card. */
function TitleArt() {
  return (
    <svg className="vs-title-art" viewBox="0 0 400 300" aria-hidden="true">
      <path d="M60 150H170M230 150H340M200 120V40M200 180V260M230 150L320 70M230 150L320 230" />
      {[
        [30, 135], [170, 135], [310, 135], [170, 10], [170, 230], [290, 40], [290, 200],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={60} height={30} rx={8} style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
      <circle r={6}>
        <animateMotion dur="3.2s" repeatCount="indefinite" path="M60 150H170L200 150L230 150L320 70" />
      </circle>
    </svg>
  );
}

function Body({ scene, step, thinkLeft }: { scene: Exclude<Scene, { kind: 'title' | 'flow' }>; step: Step; thinkLeft?: number }) {
  switch (scene.kind) {
    case 'points':
      return (
        <ul className={`vs-points${scene.tone ? ` tone-${scene.tone}` : ''}`}>
          {scene.points.map((p, i) => (
            <li key={i} className={shown(i, step.reveal)}>
              <Txt>{p}</Txt>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <div className="vs-steps">
          <ol>
            {scene.steps.map((s, i) => (
              <li key={i} className={shown(i, step.reveal)}>
                <Txt>{s}</Txt>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'table':
      return (
        <table className="vs-table">
          <thead>
            <tr>
              {scene.head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scene.rows.map((r, i) => (
              <tr key={i} className={shown(i, step.reveal)}>
                {r.map((c, k) => (
                  <td key={k}>
                    <Txt>{c}</Txt>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'stats':
      return (
        <div className={`vs-stats n${Math.min(scene.items.length, 4)}`}>
          {scene.items.map((it, i) => (
            <div key={i} className={shown(i, step.reveal) + ' vs-stat'}>
              <b>{it.value}</b>
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      );
    case 'compare':
      return (
        <div className="vs-compare">
          {[scene.left, scene.right].map((side, k) => (
            <section key={k} className={`vs-side${side.tone ? ` ${side.tone}` : ''}${k === 1 && step.reveal < 1 ? ' later' : ''}`}>
              <p className="vs-side-h">{side.label}</p>
              <ul>
                {side.points.map((p, i) => (
                  <li key={i}>
                    <Txt>{p}</Txt>
                  </li>
                ))}
              </ul>
              {side.cost && (
                <p className="vs-side-cost">
                  <Txt>{side.cost}</Txt>
                </p>
              )}
            </section>
          ))}
        </div>
      );
    case 'signals':
      return (
        <div className="vs-signals" role="table" aria-label="When you hear this, reach for that">
          <div className="vs-sig-head" role="row">
            <span role="columnheader">When you hear</span>
            <span role="columnheader">Reach for</span>
          </div>
          {scene.rows.map((r, i) => (
            <div key={i} className={`vs-sig-row ${shown(i, step.reveal)}`} role="row">
              <span role="cell">
                <Txt>{r.see}</Txt>
              </span>
              <span role="cell" className="think">
                <Txt>{r.think}</Txt>
              </span>
            </div>
          ))}
        </div>
      );
    case 'pause':
      return (
        <div className="vs-pause">
          <p className="vs-q">
            <Txt>{scene.question}</Txt>
          </p>
          {step.phase === 'think' && (
            <p className="vs-timer" aria-live="off">
              Think… {thinkLeft ?? ''}
            </p>
          )}
          <div className={step.phase === 'answer' ? 'vs-answer on' : 'vs-answer'}>
            <span className="vs-answer-h">Answer</span> <Txt>{scene.answer}</Txt>
          </div>
        </div>
      );
    case 'http': {
      const mark = scene.marks?.[step.beat] ?? {};
      const lit = (on: number[] | undefined, i: number) => (on?.includes(i) ? 'vs-hl on' : 'vs-hl');
      return (
        <div className="vs-http">
          <section className="vs-msg out">
            <p className="vs-msg-h">Request</p>
            <pre>
              {scene.request.map((l, i) => (
                <span key={i} className={lit(mark.req, i)}>
                  {l || ' '}
                  {'\n'}
                </span>
              ))}
            </pre>
          </section>
          {scene.response && (
            <section className={step.reveal ? 'vs-msg in' : 'vs-msg in later'}>
              <p className="vs-msg-h">Response</p>
              <pre>
                {scene.response.map((l, i) => (
                  <span key={i} className={lit(mark.res, i)}>
                    {l || ' '}
                    {'\n'}
                  </span>
                ))}
              </pre>
            </section>
          )}
        </div>
      );
    }
    case 'recap': {
      const next = scene.next ? findTopic(scene.next) : undefined;
      return (
        <div className="vs-recap">
          <ul className="vs-points tone-key">
            {scene.points.map((p, i) => (
              <li key={i} className={shown(i, step.reveal)}>
                <Txt>{p}</Txt>
              </li>
            ))}
          </ul>
          {next && (
            <p className={shown(0, step.reveal >= scene.points.length ? 1 : 0) + ' vs-next'}>
              Next: <b>{numberOf(next.id)} · {next.title}</b>
            </p>
          )}
        </div>
      );
    }
  }
}
