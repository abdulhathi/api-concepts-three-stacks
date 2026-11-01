import { describe, expect, it } from 'vitest';
import { arrivalMs, BURST_MS, positionAt, problems, schedule, stateAt } from '../flow/geometry';
import { buildTimeline, estimateMs } from '../video/timeline';
import type { FlowDiagram, VideoScript } from '../video/types';

const d: FlowDiagram = {
  nodes: [
    { id: 'a', kind: 'server', label: 'Node A', col: 0, row: 1 },
    { id: 'b', kind: 'server', label: 'Node B', sub: 'follower', col: 2, row: 1 },
    { id: 'c', kind: 'db', label: 'Store', col: 4, row: 1, hidden: true },
  ],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  beats: [
    { send: [{ path: ['a', 'b'] }] },
    { show: ['c'], cut: ['a-b'], relabel: { b: { label: 'Leader', sub: 'term 2' } } },
    { down: ['a'], badge: { b: 'v2' } },
    { mend: ['a-b'], up: ['a'], relabel: { b: { sub: null } }, badge: { b: null } },
  ],
};

describe('flow state', () => {
  it('accumulates lasting changes beat by beat', () => {
    expect(stateAt(d, 0).visible.has('c')).toBe(false);
    const s1 = stateAt(d, 1);
    expect(s1.visible.has('c')).toBe(true);
    expect(s1.cut.has('a-b')).toBe(true);
    expect(s1.labels.get('b')).toEqual({ label: 'Leader', sub: 'term 2' });
    const s2 = stateAt(d, 2);
    expect(s2.down.has('a')).toBe(true);
    expect(s2.badges.get('b')).toBe('v2');
    const s3 = stateAt(d, 3);
    expect(s3.cut.size + s3.down.size + s3.badges.size).toBe(0);
    expect(s3.labels.get('b')).toEqual({ label: 'Leader', sub: undefined });
  });

  it('keeps this-beat-only changes to their beat', () => {
    expect(stateAt(d, 0).send).toHaveLength(1);
    expect(stateAt(d, 1).send).toHaveLength(0);
  });

  it('accepts a sound diagram and lists what is wrong with a broken one', () => {
    expect(problems(d, 4)).toEqual([]);
    const bad: FlowDiagram = {
      ...d,
      nodes: [...d.nodes, { id: 'x', kind: 'cache', label: 'On top of A', col: 0, row: 1 }],
      beats: [{ send: [{ path: ['a', 'c'] }], cut: ['nope'], relabel: { b: { label: 'A label that is far too long' } } }],
    };
    const p = problems(bad, 2).join('\n');
    expect(p).toMatch(/1 beats for 2 lines/);
    expect(p).toMatch(/"a" and "x" overlap/);
    expect(p).toMatch(/hidden node "c"/);
    expect(p).toMatch(/a → c has no edge/);
    expect(p).toMatch(/"nope" is not an edge id/);
    expect(p).toMatch(/relabel .* longer than 18/);
  });

  it('plays packets in order, together when asked, then rests', () => {
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const { trips, cycle } = schedule([{ path: ['a', 'b'] }, { path: ['b', 'c'], sameTime: true }, { path: ['b', 'a'] }], byId);
    expect(trips[1].start).toBe(trips[0].start);
    expect(trips[2].start).toBe(Math.max(trips[0].end, trips[1].end));
    expect(cycle).toBeGreaterThan(trips[2].end);
    expect(positionAt(trips[0], trips[0].start)).toEqual({ x: 0, y: 135 });
    expect(positionAt(trips[0], trips[0].end)).toEqual({ x: 320, y: 135 });
    expect(positionAt(trips[2], 0)).toBeNull();
  });
});

describe('lost packets', () => {
  it('stop halfway along their last hop', () => {
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const { trips } = schedule([{ path: ['a', 'b', 'c'], lost: true }], byId);
    expect(trips[0].points.at(-1)).toEqual({ x: 480, y: 135 });
    expect(positionAt(trips[0], trips[0].end)).toEqual({ x: 480, y: 135 });
  });
});

describe('packet checks', () => {
  it('flags packets sent by a failed node', () => {
    const bad: FlowDiagram = { ...d, beats: [{ down: ['b'], send: [{ path: ['a', 'b'] }, { path: ['b', 'a'] }] }, {}, {}, {}] };
    const p = problems(bad, 4);
    expect(p).toEqual(['beat 1: packet leaves "b", which is down (a failed node may only send an error, tone "fail")']);
    const error: FlowDiagram = { ...d, beats: [{ down: ['b'], send: [{ path: ['b', 'a'], tone: 'fail', label: '503' }] }, {}, {}, {}] };
    expect(problems(error, 4)).toEqual([]);
  });

  it('spreads identical packets sent together into a burst', () => {
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const { trips } = schedule([{ path: ['a', 'b'] }, { path: ['a', 'b'], sameTime: true }, { path: ['b', 'c'], sameTime: true }, { path: ['a', 'b'], sameTime: true }], byId);
    expect(trips.map((t) => t.start)).toEqual([0, BURST_MS, 0, 2 * BURST_MS]);
  });
});

describe('packets in the video', () => {
  it('keep a flow line up until its packets arrive', () => {
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    expect(arrivalMs(d, 0)).toBe(schedule([{ path: ['a', 'b'] }], byId).trips[0].end);
    expect(arrivalMs(d, 1)).toBe(0);
    const script: VideoScript = { id: 'x', scenes: [{ kind: 'flow', title: 'T', say: ['Go.', 'Cut.', 'Down.', 'Up.'], ...d }] };
    const [first, second] = buildTimeline(script).steps;
    expect(first.hold).toBe(arrivalMs(d, 0));
    expect(first.ms).toBe(Math.max(estimateMs('Go.'), first.hold!));
    expect(first.ms).toBeGreaterThan(estimateMs('Go.')); // a short line waits for the packet
    expect(second.hold).toBe(0);
  });
});
