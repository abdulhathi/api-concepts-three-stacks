import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FlowDiagram, FlowNode } from '../video/types';
import {
  center, edgeId, edgeLine, edgeShown, LABEL_GAP, panelBox, positionAt, schedule, stateAt, SUB_GAP, TILE, viewBox, zoneBox,
} from './geometry';
import { FAMILY, ICONS } from './icons';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Milliseconds into the beat's packet loop, at normal speed: `rate` is the video's playback speed. Starts over when the
 * beat changes, holds still while paused, and stays at 0 where there is no animation frame (tests).
 */
function useLoop(active: boolean, cycle: number, restartKey: unknown, rate: number): number {
  const [t, setT] = useState(0);
  const elapsed = useRef(0);
  const lastKey = useRef(restartKey);
  useEffect(() => {
    if (lastKey.current !== restartKey) {
      lastKey.current = restartKey;
      elapsed.current = 0;
      setT(0);
    }
    if (!active || typeof requestAnimationFrame !== 'function') return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      elapsed.current += (now - prev) * rate;
      prev = now;
      setT(elapsed.current % cycle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, cycle, restartKey, rate]);
  return t;
}

/**
 * An architecture diagram at one beat: zones, edges, panels and nodes as the beats so far left them, with this beat's
 * highlights and its requests moving along the edges, faster or slower with the video's `rate`. The SVG fills its box
 * and keeps its proportions.
 */
export function FlowView({ diagram, beat, playing = true, rate = 1, label }: { diagram: FlowDiagram; beat: number; playing?: boolean; rate?: number; label?: string }) {
  const uid = useId().replace(/:/g, '');
  const byId = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram]);
  const box = useMemo(() => viewBox(diagram), [diagram]);
  const s = useMemo(() => stateAt(diagram, beat), [diagram, beat]);
  const { trips, cycle } = useMemo(() => schedule(s.send, byId), [s.send, byId]);
  // Paused, or with reduced motion: every packet of the beat holds still on its path.
  const still = reducedMotion() || !playing;
  const t = useLoop(trips.length > 0 && !still, cycle, `${beat}`, rate);

  const shownNodes = diagram.nodes.filter((n) => s.visible.has(n.id));
  const marker = (focus: boolean) => `url(#${uid}-${focus ? 'arrow-on' : 'arrow'})`;

  return (
    <svg
      className="flow"
      viewBox={`${box.x1} ${box.y1} ${box.x2 - box.x1} ${box.y2 - box.y1}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label ?? `Diagram: ${shownNodes.map((n) => n.label).join(', ')}`}
    >
      <defs>
        {(['arrow', 'arrow-on'] as const).map((m) => (
          <marker key={m} id={`${uid}-${m}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.8L9.5 5L0 9.2z" className={m === 'arrow' ? 'fl-arrowhead' : 'fl-arrowhead on'} />
          </marker>
        ))}
      </defs>

      {(diagram.zones ?? []).filter((z) => s.visible.has(z.id)).map((z) => {
        const b = zoneBox(z);
        return (
          <g key={z.id} className={s.focus.has(z.id) ? 'fl-zone focus' : 'fl-zone'}>
            <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} rx={16} />
            <text x={b.x1 + 14} y={b.y1 + 22}>{z.label}</text>
          </g>
        );
      })}

      {(diagram.edges ?? []).filter((e) => edgeShown(e, s)).map((e) => {
        const id = edgeId(e);
        const { a, b } = edgeLine(e, byId);
        const on = s.focus.has(id);
        const broken = s.cut.has(id);
        const arrow = e.arrow ?? 'to';
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <g key={id} className={`fl-edge${e.dashed ? ' dashed' : ''}${on ? ' focus' : ''}${broken ? ' cut' : ''}`}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              pathLength={e.dashed ? undefined : 1}
              markerEnd={arrow !== 'none' ? marker(on) : undefined}
              markerStart={arrow === 'both' ? marker(on) : undefined}
            />
            {e.label && (
              <text className="fl-elabel" x={mid.x} y={mid.y - 8} textAnchor="middle">
                {e.label}
              </text>
            )}
            {broken && <path className="fl-cut" d={`M${mid.x - 11} ${mid.y - 11}L${mid.x + 11} ${mid.y + 11}M${mid.x + 11} ${mid.y - 11}L${mid.x - 11} ${mid.y + 11}`} />}
          </g>
        );
      })}

      {(diagram.panels ?? []).filter((p) => s.visible.has(p.id)).map((p) => {
        const rows = s.rows.get(p.id) ?? p.rows;
        const most = Math.max(rows.length, ...diagram.beats.map((b) => b.rows?.[p.id]?.length ?? 0), p.rows.length);
        const b = panelBox(p, most);
        return (
          <g key={p.id} className={s.focus.has(p.id) ? 'fl-panel focus' : 'fl-panel'} transform={`translate(${b.x1} ${b.y1})`}>
            <rect width={b.x2 - b.x1} height={b.y2 - b.y1} rx={10} />
            <text className="fl-ptitle" x={12} y={21}>{p.title}</text>
            <line x1={0} x2={b.x2 - b.x1} y1={32} y2={32} />
            {rows.map((r, i) => (
              <text key={`${i}:${r}`} className="fl-prow" x={12} y={32 + 20 + i * 26} xmlSpace="preserve">
                {r}
              </text>
            ))}
          </g>
        );
      })}

      {shownNodes.map((n) => (
        <Node key={n.id} node={{ ...n, ...s.labels.get(n.id) }} down={s.down.has(n.id)} focus={s.focus.has(n.id)} badge={s.badges.get(n.id)} />
      ))}

      {trips.map((trip, i) => {
        // Still packets sit 40% along their path, so a request and its reply on one edge do not cover each other.
        const p = still ? positionAt(trip, trip.start + (trip.end - trip.start) * 0.4) : positionAt(trip, t);
        if (!p) return null;
        const text = trip.packet.label;
        const w = text ? text.length * 8.4 + 20 : 0;
        return (
          <g key={`${beat}-${i}`} className={`fl-packet tone-${trip.packet.tone ?? 'request'}${trip.packet.lost ? ' lost' : ''}`} transform={`translate(${p.x} ${p.y})`}>
            <circle r={10} />
            {text && (
              <g transform="translate(0 -26)">
                <rect x={-w / 2} y={-13} width={w} height={24} rx={12} />
                <text y={4} textAnchor="middle">{text}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Node({ node, down, focus, badge }: { node: FlowNode; down: boolean; focus: boolean; badge?: string }) {
  const { x, y } = center(node);
  const h = TILE / 2;
  const bw = badge ? badge.length * 8 + 14 : 0;
  return (
    <g className={`fl-node fam-${FAMILY[node.kind]}${down ? ' down' : ''}${focus ? ' focus' : ''}`} transform={`translate(${x} ${y})`}>
      <g className="fl-pop">
        {focus && <rect className="fl-ring" x={-h - 7} y={-h - 7} width={TILE + 14} height={TILE + 14} rx={19} />}
        <rect className="fl-tile" x={-h} y={-h} width={TILE} height={TILE} rx={15} />
        <g className="fl-icon" transform="translate(-17 -17) scale(1.4167)">
          {ICONS[node.kind]}
        </g>
        {down && <path className="fl-x" d="M-20 -20L20 20M20 -20L-20 20" />}
        <text className="fl-label" key={node.label} y={h + LABEL_GAP} textAnchor="middle">
          {node.label}
        </text>
        {node.sub && (
          <text className="fl-sub" y={h + LABEL_GAP + SUB_GAP} textAnchor="middle">
            {node.sub}
          </text>
        )}
        {badge && (
          <g className="fl-badge" transform={`translate(${h - 6} ${-h - 2})`}>
            <rect x={-bw / 2} y={-12} width={bw} height={22} rx={11} />
            <text y={4} textAnchor="middle">{badge}</text>
          </g>
        )}
      </g>
    </g>
  );
}
