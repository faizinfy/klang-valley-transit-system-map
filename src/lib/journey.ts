import { network, type Stop } from './network';
import type { RideLeg, Route, TransferLeg } from './router';

// A route flattened into the rows of the journey view, plus a timeline that
// says where the train is at any moment of the animation.

export type Row =
  | { kind: 'stop'; stop: Stop; leg: RideLeg; role: 'board' | 'via' | 'alight' }
  | { kind: 'transfer'; leg: TransferLeg };

export function routeRows(route: Route): Row[] {
  const rows: Row[] = [];
  for (const leg of route.legs) {
    if (leg.kind === 'transfer') {
      rows.push({ kind: 'transfer', leg });
      continue;
    }
    leg.stops.forEach((stop, i) => {
      const role = i === 0 ? 'board' : i === leg.stops.length - 1 ? 'alight' : 'via';
      rows.push({ kind: 'stop', stop, leg, role });
    });
  }
  return rows;
}

/** Two consecutive rows are joined by track only when they belong to one ride. */
export function isRideSegment(rows: Row[], i: number): boolean {
  const a = rows[i], b = rows[i + 1];
  return a?.kind === 'stop' && b?.kind === 'stop' && a.leg === b.leg;
}

export interface Segment {
  from: number; // row index
  to: number; // row index (equal to `from` while dwelling)
  start: number; // ms
  duration: number; // ms
  mode: 'train' | 'walk';
}

// Milliseconds at 1× speed.
export const TIMING = {
  ride: 520, // between two stops
  walk: 800, // between a stop and a transfer row
  dwellVia: 160,
  dwellEnd: 600, // at boarding / alighting stops
};

export function buildTimeline(rows: Row[]): { segments: Segment[]; total: number } {
  const segments: Segment[] = [];
  let t = 0;
  const push = (from: number, to: number, duration: number, mode: Segment['mode']) => {
    segments.push({ from, to, start: t, duration, mode });
    t += duration;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === 'stop') push(i, i, row.role === 'via' ? TIMING.dwellVia : TIMING.dwellEnd, 'train');
    if (i === rows.length - 1) break;
    if (isRideSegment(rows, i)) push(i, i + 1, TIMING.ride, 'train');
    else push(i, i + 1, TIMING.walk, 'walk');
  }
  return { segments, total: t };
}

export const rowColor = (row: Row | undefined) =>
  row?.kind === 'stop' ? network.lineById.get(row.leg.lineId)!.color : undefined;

/** Which way a ride leg runs, e.g. "towards Putra Heights". */
export function direction(leg: RideLeg): string {
  const line = network.lineById.get(leg.lineId)!;
  const stops = network.stopsByLine.get(leg.lineId)!;
  const [a, b] = [leg.stops[0], leg.stops[1]];
  if (line.loop) {
    const forward = (b.index - a.index + stops.length) % stops.length < stops.length / 2;
    return forward ? 'clockwise (CC1 → CC33)' : 'anticlockwise (CC33 → CC1)';
  }
  const end = b.index > a.index ? stops[stops.length - 1] : stops[0];
  return `towards ${end.name}`;
}

/** Screen-reader announcement for reaching a row, if it's a key moment. */
export function describeRow(row: Row): string | null {
  if (row.kind === 'transfer') {
    return row.leg.type === 'connecting'
      ? `Walking from ${row.leg.from.name} to ${row.leg.to.name}`
      : `Changing lines at ${row.leg.from.name}`;
  }
  const line = network.lineById.get(row.leg.lineId)!;
  if (row.role === 'board') return `Boarding the ${line.name} at ${row.stop.name}`;
  if (row.role === 'alight') return `Arriving at ${row.stop.name}`;
  return null;
}

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/**
 * Where the traveller is at `time`: a fractional row position (e.g. 2.5 is
 * halfway between rows 2 and 3), the travel mode, and the row last reached.
 */
export function positionAt(segments: Segment[], time: number): { pos: number; mode: Segment['mode']; row: number } {
  if (!segments.length) return { pos: 0, mode: 'train', row: 0 };
  const seg = segments.find((s) => time < s.start + s.duration) ?? segments[segments.length - 1];
  const p = Math.min(1, Math.max(0, (time - seg.start) / seg.duration));
  const pos = seg.from + (seg.to - seg.from) * ease(p);
  return { pos, mode: seg.mode, row: p >= 1 ? seg.to : seg.from };
}
