import { describe, expect, it } from 'vitest';
import { COORDS } from '../data/coords';
import { routeRows } from './journey';
import { along, buildMapModel, project, rowPath } from './mapGeometry';
import { findStation, network } from './network';
import { findRoute } from './router';

const model = buildMapModel(network);

describe('map model', () => {
  it('has a position for every station', () => {
    const missing = [...network.stations.keys()].filter((id) => !COORDS[id]);
    expect(missing).toEqual([]);
    expect(model.pos.size).toBe(network.stations.size);
  });

  it('keeps compass directions: north is up, east is right', () => {
    const p = (id: string) => model.pos.get(id)!;
    expect(p('gombak').y).toBeLessThan(p('kl-sentral').y); // Gombak is north
    expect(p('ampang').x).toBeGreaterThan(p('kl-sentral').x); // Ampang is east
    expect(p('pelabuhan-klang').x).toBeLessThan(p('kl-sentral').x); // Port Klang is west
  });

  it('compresses far-away stations more than nearby ones', () => {
    const near = project(3.1594, 101.6965); // ~1.1 km north of the centre
    const far = project(3.6848, 101.5182); // Tanjung Malim, ~63 km
    const dNear = Math.hypot(near.x, near.y), dFar = Math.hypot(far.x, far.y);
    expect(dFar / dNear).toBeLessThan(63 / 1.1 / 3); // squeezed at least 3×
  });

  it('draws lines sharing track side by side', () => {
    const seg = (line: string) =>
      model.segments.find((s) => s.lineId === line && s.from.code === `${line}1` && s.to.code === `${line}2`)!;
    expect(seg('AG').points[0]).not.toEqual(seg('SP').points[0]);
  });

  it('routes the KLIA Express through its real path, not a straight line', () => {
    const ke = model.segments.find((s) => s.from.code === 'KE1' && s.to.code === 'KE2')!;
    expect(ke.points.length).toBe(5);
  });
});

describe('route paths', () => {
  const rowsFor = (a: string, b: string) =>
    routeRows(findRoute(network, findStation(network, a)!.id, findStation(network, b)!.id)!);

  it('follows the track between every pair of rows', () => {
    for (const [a, b] of [['KJ1', 'KE3'], ['MR10', 'KJ10'], ['SA26', 'KB18'], ['KB2', 'KB3']]) {
      const rows = rowsFor(a, b);
      for (let i = 0; i < rows.length - 1; i++) {
        const pts = rowPath(network, model, rows, i);
        expect(pts.length, `${a}->${b} row ${i}`).toBeGreaterThanOrEqual(2);
        expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      }
    }
  });

  it('passes through provisional stops it skips', () => {
    const rows = rowsFor('KB2', 'KB3'); // Seputeh -> Salak Selatan, past KB2A
    expect(rowPath(network, model, rows, 0).length).toBe(3);
  });

  it('interpolates along a path', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(along(pts, 0.25).p).toEqual({ x: 5, y: 0 });
    expect(along(pts, 0.75).p).toEqual({ x: 10, y: 5 });
    expect(along(pts, 0.75).angle).toBeCloseTo(Math.PI / 2);
  });
});
