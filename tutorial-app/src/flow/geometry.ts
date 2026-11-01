// Where everything in a flow diagram sits, what is on screen at each beat, and when each moving packet is where.
// Pure functions, so the tests can check every diagram without a browser.
import type { Beat, FlowDiagram, FlowEdge, FlowNode, FlowPanel, FlowZone, Packet } from '../video/types';

/** Grid spacing in SVG units. Columns run 0 to 6 and rows 0 to 3. */
export const COL_W = 160;
export const ROW_H = 135;
export const MAX_COL = 6;
export const MAX_ROW = 3;

/** The icon tile; the label sits under it. */
export const TILE = 64;
export const LABEL_GAP = 22; // tile bottom to the label's baseline
export const SUB_GAP = 19; // label baseline to the second line's baseline
const CHAR_W = 9.6; // average width of a label character at 18px
const SUB_CHAR_W = 7.6;
const PANEL_W = 210;
const PANEL_HEAD = 32;
const PANEL_ROW = 26;
const MARGIN = 18;

export const LIMITS = { label: 18, sub: 22, edge: 16, packet: 18, badge: 12, note: 64 } as const;

export type Box = { x1: number; y1: number; x2: number; y2: number };

/** The center of a node's icon tile. */
export const center = (n: { col: number; row: number }) => ({ x: n.col * COL_W, y: n.row * ROW_H });

export function nodeBox(n: FlowNode, longest: { label: number; sub: number } = { label: n.label.length, sub: n.sub?.length ?? 0 }): Box {
  const { x, y } = center(n);
  const textW = Math.max(longest.label * CHAR_W, longest.sub * SUB_CHAR_W, TILE);
  const bottom = y + TILE / 2 + LABEL_GAP + (n.sub ? SUB_GAP : 0) + 6;
  return { x1: x - textW / 2, y1: y - TILE / 2, x2: x + textW / 2, y2: bottom };
}

export function panelBox(p: FlowPanel, rows = p.rows.length): Box {
  const { x, y } = center(p);
  const w = p.width ?? PANEL_W;
  return { x1: x - w / 2, y1: y - TILE / 2, x2: x + w / 2, y2: y - TILE / 2 + PANEL_HEAD + Math.max(1, rows) * PANEL_ROW + 8 };
}

/** Zone labels are 13px monospaced capitals with wide spacing: about 8.9 units a character, 14 in from each side. */
const zoneLabelW = (z: FlowZone) => z.label.length * 8.9 + 28;

/** A zone's rectangle: its grid cells, widened evenly on both sides when its label needs more room. */
export function zoneBox(z: FlowZone): Box {
  const [c1, r1] = z.from;
  const [c2, r2] = z.to;
  const x1 = Math.min(c1, c2) * COL_W - COL_W / 2 + 6;
  const x2 = Math.max(c1, c2) * COL_W + COL_W / 2 - 6;
  const grow = Math.max(0, zoneLabelW(z) - (x2 - x1)) / 2;
  return {
    x1: x1 - grow,
    // Room above the top row for the label, clear of any badge on a node's top corner.
    y1: Math.min(r1, r2) * ROW_H - TILE / 2 - 50,
    x2: x2 + grow,
    y2: Math.max(r1, r2) * ROW_H + TILE / 2 + LABEL_GAP + SUB_GAP + 14,
  };
}

const overlap = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
export { overlap as boxesOverlap };

/** The longest label and second line a node ever shows, counting every relabel. */
function longestText(d: FlowDiagram, n: FlowNode) {
  let label = n.label.length;
  let sub = n.sub?.length ?? 0;
  for (const b of d.beats) {
    const r = b.relabel?.[n.id];
    if (r?.label) label = Math.max(label, r.label.length);
    if (r?.sub) sub = Math.max(sub, r.sub.length);
  }
  return { label, sub };
}

/** The space a node takes at its widest, for layout. */
export const nodeExtent = (d: FlowDiagram, n: FlowNode) => nodeBox(n, longestText(d, n));

/** The diagram's viewBox: everything it will ever show, hidden parts included, so it never jumps. */
export function viewBox(d: FlowDiagram): Box {
  const panelRows = maxPanelRows(d);
  const boxes = [
    ...d.nodes.map((n) => nodeExtent(d, n)),
    ...(d.zones ?? []).map(zoneBox),
    ...(d.panels ?? []).map((p) => panelBox(p, panelRows.get(p.id))),
  ];
  return {
    x1: Math.min(...boxes.map((b) => b.x1)) - MARGIN,
    y1: Math.min(...boxes.map((b) => b.y1)) - MARGIN,
    x2: Math.max(...boxes.map((b) => b.x2)) + MARGIN,
    y2: Math.max(...boxes.map((b) => b.y2)) + MARGIN,
  };
}

/** The most rows each panel ever holds, so its box is sized once. */
function maxPanelRows(d: FlowDiagram): Map<string, number> {
  const most = new Map((d.panels ?? []).map((p) => [p.id, p.rows.length]));
  for (const b of d.beats) for (const [id, rows] of Object.entries(b.rows ?? {})) most.set(id, Math.max(most.get(id) ?? 0, rows.length));
  return most;
}

export const edgeId = (e: FlowEdge) => e.id ?? `${e.from}-${e.to}`;

/**
 * Where a line from a node's tile center toward `toward` leaves the node: the tile's sides, or the bottom of the
 * label when it heads down, so lines never cross a node's own label.
 */
export function attach(n: FlowNode, toward: { x: number; y: number }) {
  const c = center(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const half = TILE / 2 + 5;
  const below = TILE / 2 + LABEL_GAP + (n.sub ? SUB_GAP : 0) + 8;
  const ts = [
    dx > 0 ? half / dx : dx < 0 ? -half / dx : Infinity,
    dy > 0 ? below / dy : dy < 0 ? -half / dy : Infinity,
  ];
  const t = Math.min(...ts);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The visible segment of an edge, from border to border. */
export function edgeLine(e: FlowEdge, byId: Map<string, FlowNode>) {
  const a = byId.get(e.from)!;
  const b = byId.get(e.to)!;
  return { a: attach(a, center(b)), b: attach(b, center(a)) };
}

// ---------- state at a beat ----------

export type FlowState = {
  visible: Set<string>;
  down: Set<string>;
  /** Broken edges, by edge id. */
  cut: Set<string>;
  /** Current label and second line of every node. */
  labels: Map<string, { label: string; sub?: string }>;
  badges: Map<string, string>;
  rows: Map<string, string[]>;
  /** This beat only. */
  focus: Set<string>;
  send: Packet[];
  note?: string;
};

/** Everything on screen while line `beat` is read: the lasting changes of beats 0 to `beat`, plus this beat's own. */
export function stateAt(d: FlowDiagram, beat: number): FlowState {
  const visible = new Set<string>();
  for (const n of d.nodes) if (!n.hidden) visible.add(n.id);
  for (const e of d.edges ?? []) if (!e.hidden) visible.add(edgeId(e));
  for (const z of d.zones ?? []) if (!z.hidden) visible.add(z.id);
  for (const p of d.panels ?? []) if (!p.hidden) visible.add(p.id);
  const down = new Set<string>();
  const cut = new Set<string>();
  const labels = new Map(d.nodes.map((n) => [n.id, { label: n.label, sub: n.sub }]));
  const badges = new Map<string, string>();
  const rows = new Map((d.panels ?? []).map((p) => [p.id, p.rows]));
  const upTo = Math.max(0, Math.min(beat, d.beats.length - 1));
  for (let i = 0; i <= upTo; i++) {
    const b: Beat = d.beats[i] ?? {};
    b.show?.forEach((id) => visible.add(id));
    b.hide?.forEach((id) => visible.delete(id));
    b.down?.forEach((id) => down.add(id));
    b.up?.forEach((id) => down.delete(id));
    b.cut?.forEach((id) => cut.add(id));
    b.mend?.forEach((id) => cut.delete(id));
    for (const [id, r] of Object.entries(b.relabel ?? {})) {
      const now = labels.get(id);
      if (!now) continue;
      labels.set(id, { label: r.label ?? now.label, sub: r.sub === null ? undefined : (r.sub ?? now.sub) });
    }
    for (const [id, text] of Object.entries(b.badge ?? {})) {
      if (text === null) badges.delete(id);
      else badges.set(id, text);
    }
    for (const [id, r] of Object.entries(b.rows ?? {})) rows.set(id, r);
  }
  const now: Beat = d.beats[upTo] ?? {};
  return { visible, down, cut, labels, badges, rows, focus: new Set(now.focus ?? []), send: now.send ?? [], note: now.note };
}

/** An edge shows only when it and both of its nodes are visible. */
export const edgeShown = (e: FlowEdge, s: FlowState) => s.visible.has(edgeId(e)) && s.visible.has(e.from) && s.visible.has(e.to);

// ---------- moving packets ----------

/** Travel speed in SVG units per second at normal speed, and the pause before the beat's packets start over. */
export const SPEED = 200;
export const MIN_TRIP_MS = 1100;
export const REST_MS = 1500;
/** Identical packets sent at the same time leave this far apart, so a crowd reads as a burst, not one dot. */
export const BURST_MS = 400;

export type Trip = { packet: Packet; points: { x: number; y: number }[]; lengths: number[]; start: number; end: number };

/** When each of a beat's packets travels, in ms from the start of the loop, and how long the loop is. */
export function schedule(send: Packet[], byId: Map<string, FlowNode>): { trips: Trip[]; cycle: number } {
  const trips: Trip[] = [];
  let prevEnd = 0;
  let groupStart = 0;
  const group: string[] = [];
  for (const packet of send) {
    if (!packet.sameTime) group.length = 0;
    const points = packet.path.map((id) => center(byId.get(id)!));
    if (packet.lost && points.length >= 2) {
      const [a, b] = points.slice(-2);
      points[points.length - 1] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const ms = Math.max(MIN_TRIP_MS, (lengths.reduce((a, b) => a + b, 0) / SPEED) * 1000);
    if (!packet.sameTime) groupStart = prevEnd;
    const key = packet.path.join('>');
    const twins = group.filter((k) => k === key).length;
    group.push(key);
    const start = (packet.sameTime ? groupStart : prevEnd) + twins * BURST_MS;
    trips.push({ packet, points, lengths, start, end: start + ms });
    prevEnd = Math.max(prevEnd, start + ms);
  }
  return { trips, cycle: prevEnd + REST_MS };
}

/** How long a beat's packets take to arrive, at normal speed (0 with none): the video stays on the beat at least this long. */
export function arrivalMs(d: FlowDiagram, beat: number): number {
  const { send } = stateAt(d, beat);
  if (!send.length) return 0;
  return schedule(send, new Map(d.nodes.map((n) => [n.id, n]))).cycle - REST_MS;
}

/** A packet's position at `t` ms into the loop, or null when it is not travelling then. */
export function positionAt(trip: Trip, t: number): { x: number; y: number } | null {
  if (t < trip.start || t > trip.end) return null;
  const total = trip.lengths.reduce((a, b) => a + b, 0);
  let left = ((t - trip.start) / (trip.end - trip.start)) * total;
  for (let i = 0; i < trip.lengths.length; i++) {
    if (left <= trip.lengths[i] || i === trip.lengths.length - 1) {
      const f = trip.lengths[i] ? Math.min(1, left / trip.lengths[i]) : 1;
      const a = trip.points[i];
      const b = trip.points[i + 1];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    left -= trip.lengths[i];
  }
  return trip.points.at(-1)!;
}

// ---------- checks for writers ----------


/** Everything wrong with a diagram, in words; empty when it is fine. `lines` is the number of `say` lines. */
export function problems(d: FlowDiagram, lines: number): string[] {
  const out: string[] = [];
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  const edges = new Map((d.edges ?? []).map((e) => [edgeId(e), e]));
  const panels = new Map((d.panels ?? []).map((p) => [p.id, p]));
  const zones = new Map((d.zones ?? []).map((z) => [z.id, z]));
  const all = [...nodes.keys(), ...edges.keys(), ...panels.keys(), ...zones.keys()];
  const seen = new Set<string>();
  for (const id of all) {
    if (seen.has(id)) out.push(`id "${id}" is used twice`);
    seen.add(id);
  }
  if (d.beats.length !== lines) out.push(`${d.beats.length} beats for ${lines} lines: give every line one beat ({} for no change)`);

  for (const n of d.nodes) {
    if (n.col < 0 || n.col > MAX_COL || n.row < 0 || n.row > MAX_ROW) out.push(`node "${n.id}" is off the grid (col 0–${MAX_COL}, row 0–${MAX_ROW})`);
    if (n.label.length > LIMITS.label) out.push(`node "${n.id}" label is longer than ${LIMITS.label} characters`);
    if ((n.sub?.length ?? 0) > LIMITS.sub) out.push(`node "${n.id}" sub is longer than ${LIMITS.sub} characters`);
  }
  // A zone widened for its label must not reach over a node that is not in it.
  for (const z of d.zones ?? []) {
    const b = zoneBox(z);
    const [lo, hi] = [Math.min(z.from[0], z.to[0]), Math.max(z.from[0], z.to[0])];
    const [top, bottom] = [Math.min(z.from[1], z.to[1]), Math.max(z.from[1], z.to[1])];
    for (const n of d.nodes) {
      if (n.col >= lo && n.col <= hi && n.row >= top && n.row <= bottom) continue;
      const { x, y } = center(n);
      if (overlap(b, { x1: x - TILE / 2, y1: y - TILE / 2, x2: x + TILE / 2, y2: y + TILE / 2 }))
        out.push(`zone "${z.id}" reaches over node "${n.id}", which is not in it: shorten the zone's label or move the node`);
    }
  }
  for (const e of d.edges ?? []) {
    if (!nodes.has(e.from) || !nodes.has(e.to)) out.push(`edge "${edgeId(e)}" joins a node that does not exist`);
    if ((e.label?.length ?? 0) > LIMITS.edge) out.push(`edge "${edgeId(e)}" label is longer than ${LIMITS.edge} characters`);
  }
  // Panel text is monospaced: rows are 9 units a character, the title 8.6, inside 12 units of padding on each side.
  const fits = (p: FlowPanel) => Math.floor(((p.width ?? PANEL_W) - 24) / 9);
  for (const p of d.panels ?? []) {
    for (const r of p.rows) if (r.length > fits(p)) out.push(`panel "${p.id}" row "${r}" is longer than ${fits(p)} characters: shorten it or widen the panel`);
    if (p.title.length * 8.6 > (p.width ?? PANEL_W) - 24) out.push(`panel "${p.id}" title is too long for its width`);
  }

  // Nothing may sit on top of anything else.
  const rowsMax = maxPanelRows(d);
  const boxes: [string, Box][] = [...d.nodes.map((n): [string, Box] => [n.id, nodeExtent(d, n)]), ...(d.panels ?? []).map((p): [string, Box] => [p.id, panelBox(p, rowsMax.get(p.id))])];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i][1], boxes[j][1])) out.push(`"${boxes[i][0]}" and "${boxes[j][0]}" overlap: move one`);
  }

  const known = (id: string) => nodes.has(id) || edges.has(id) || panels.has(id) || zones.has(id);
  d.beats.forEach((b, i) => {
    const at = `beat ${i + 1}`;
    for (const id of [...(b.show ?? []), ...(b.hide ?? []), ...(b.focus ?? [])]) if (!known(id)) out.push(`${at}: unknown id "${id}"`);
    for (const id of [...(b.down ?? []), ...(b.up ?? []), ...Object.keys(b.badge ?? {}), ...Object.keys(b.relabel ?? {})]) if (!nodes.has(id)) out.push(`${at}: "${id}" is not a node`);
    for (const id of [...(b.cut ?? []), ...(b.mend ?? [])]) if (!edges.has(id)) out.push(`${at}: "${id}" is not an edge id`);
    for (const r of Object.values(b.relabel ?? {})) {
      if ((r.label?.length ?? 0) > LIMITS.label) out.push(`${at}: relabel "${r.label}" is longer than ${LIMITS.label} characters`);
      if ((r.sub?.length ?? 0) > LIMITS.sub) out.push(`${at}: relabel sub "${r.sub}" is longer than ${LIMITS.sub} characters`);
    }
    for (const text of Object.values(b.badge ?? {})) if (text && text.length > LIMITS.badge) out.push(`${at}: badge "${text}" is longer than ${LIMITS.badge} characters`);
    for (const [id, r] of Object.entries(b.rows ?? {})) {
      const p = panels.get(id);
      if (!p) out.push(`${at}: "${id}" is not a panel`);
      else for (const row of r) if (row.length > fits(p)) out.push(`${at}: panel row "${row}" is longer than ${fits(p)} characters: shorten it or widen the panel`);
    }
    if ((b.note?.length ?? 0) > LIMITS.note) out.push(`${at}: note is longer than ${LIMITS.note} characters`);
    const s = stateAt(d, i);
    for (const id of s.focus) if (known(id) && !s.visible.has(id)) out.push(`${at}: focus on hidden "${id}"`);
    // A failed node can be the target of a request and can answer with an error, but it cannot pass anything on or succeed.
    for (const p of b.send ?? []) {
      p.path.slice(0, -1).forEach((id, k) => {
        if (s.down.has(id) && (k > 0 || (p.tone ?? 'request') !== 'fail')) out.push(`${at}: packet leaves "${id}", which is down (a failed node may only send an error, tone "fail")`);
      });
    }
    for (const p of b.send ?? []) {
      if (p.path.length < 2) out.push(`${at}: a packet needs a path of two or more nodes`);
      if ((p.label?.length ?? 0) > LIMITS.packet) out.push(`${at}: packet label "${p.label}" is longer than ${LIMITS.packet} characters`);
      p.path.forEach((id, k) => {
        if (!nodes.has(id)) return out.push(`${at}: packet goes through unknown node "${id}"`);
        if (!s.visible.has(id)) out.push(`${at}: packet goes through hidden node "${id}"`);
        if (k === 0) return;
        const prev = p.path[k - 1];
        // Any edge between the two nodes will do, in either direction, as long as one of them is showing.
        const joining = (d.edges ?? []).filter((x) => (x.from === prev && x.to === id) || (x.from === id && x.to === prev));
        if (!joining.length) out.push(`${at}: packet hop ${prev} → ${id} has no edge`);
        else if (!joining.some((x) => edgeShown(x, s))) out.push(`${at}: packet hop ${prev} → ${id} uses a hidden edge`);
      });
    }
  });
  return out;
}
