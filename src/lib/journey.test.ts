import { describe, expect, it } from 'vitest';
import { buildTimeline, isRideSegment, positionAt, routeRows, TIMING } from './journey';
import { findStation, network } from './network';
import { findRoute } from './router';

const rowsFor = (a: string, b: string) =>
  routeRows(findRoute(network, findStation(network, a)!.id, findStation(network, b)!.id)!);

describe('journey rows', () => {
  it('lists every stop of a single-line trip', () => {
    const rows = rowsFor('KJ1', 'KJ5');
    expect(rows.map((r) => (r.kind === 'stop' ? r.stop.code : 'T'))).toEqual(['KJ1', 'KJ2', 'KJ3', 'KJ4', 'KJ5']);
    expect(rows.map((r) => r.kind === 'stop' && r.role)).toEqual(['board', 'via', 'via', 'via', 'alight']);
  });

  it('puts a transfer row between rides and breaks the track there', () => {
    const rows = rowsFor('KJ24', 'SB3'); // Kelana Jaya -> USJ 7 -> Sunway Lagoon
    const t = rows.findIndex((r) => r.kind === 'transfer');
    expect(t).toBeGreaterThan(0);
    expect(isRideSegment(rows, t - 1)).toBe(false);
    expect(isRideSegment(rows, t)).toBe(false);
    expect(isRideSegment(rows, 0)).toBe(true);
  });
});

describe('timeline', () => {
  it('starts at the first row and ends at the last', () => {
    const rows = rowsFor('KJ24', 'SB3');
    const { segments, total } = buildTimeline(rows);
    expect(positionAt(segments, 0).pos).toBe(0);
    const end = positionAt(segments, total);
    expect(end.pos).toBe(rows.length - 1);
    expect(end.row).toBe(rows.length - 1);
  });

  it('moves monotonically down the rows', () => {
    const { segments, total } = buildTimeline(rowsFor('KJ1', 'KE3'));
    let last = -1;
    for (let t = 0; t <= total; t += 50) {
      const { pos } = positionAt(segments, t);
      expect(pos).toBeGreaterThanOrEqual(last);
      last = pos;
    }
  });

  it('walks across transfers and rides between stops', () => {
    const rows = rowsFor('KJ24', 'SB3');
    const { segments } = buildTimeline(rows);
    const t = rows.findIndex((r) => r.kind === 'transfer');
    const walk = segments.find((s) => s.to === t)!;
    expect(walk.mode).toBe('walk');
    expect(segments.find((s) => s.from === 0 && s.to === 1)!.mode).toBe('train');
  });

  it('pauses longer at boarding stops than at stops passed through', () => {
    const { segments } = buildTimeline(rowsFor('KJ1', 'KJ5'));
    const dwell = (row: number) => segments.find((s) => s.from === row && s.to === row)!.duration;
    expect(dwell(0)).toBe(TIMING.dwellEnd);
    expect(dwell(1)).toBe(TIMING.dwellVia);
  });
});
