import { COORDS } from '../data/coords';
import type { Row } from './journey';
import type { Network, Stop } from './network';

export type Pt = { x: number; y: number };

// Projection: equirectangular around central KL, then distances from the
// centre are compressed logarithmically so the dense core gets room while
// far-off stops (Tanjung Malim, Seremban, KLIA) still fit on screen.
const CENTRE = { lat: 3.1494, lon: 101.6965 }; // Masjid Jamek
const COS = Math.cos((CENTRE.lat * Math.PI) / 180);
const K = 0.06; // degrees; distances below this stay roughly true to scale
const SCALE = 4000; // map units per (compressed) degree

export function project(lat: number, lon: number): Pt {
  const dx = (lon - CENTRE.lon) * COS;
  const dy = CENTRE.lat - lat;
  const r = Math.hypot(dx, dy);
  if (r === 0) return { x: 0, y: 0 };
  const f = (K * Math.log1p(r / K)) / r;
  return { x: dx * f * SCALE, y: dy * f * SCALE };
}

export interface MapSegment {
  lineId: string;
  from: Stop;
  to: Stop;
  points: Pt[];
}

export interface MapModel {
  pos: Map<string, Pt>; // station id -> position
  segments: MapSegment[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

// Lines whose track doesn't run straight between consecutive stops: draw
// them through these stations (without stopping).
const VIA: Record<string, Record<string, string[]>> = {
  KE: { 'KE1>KE2': ['bandar-tasik-selatan', 'putrajaya-cyberjaya', 'salak-tinggi'] },
};

const OFFSET = 3.2; // map units between parallel lines on shared track

export function buildMapModel(net: Network): MapModel {
  const pos = new Map<string, Pt>();
  for (const id of net.stations.keys()) {
    const c = COORDS[id];
    if (c) pos.set(id, project(c[0], c[1]));
  }

  // Raw segments between consecutive stops (provisional ones included – the
  // track runs through them).
  const raw: MapSegment[] = [];
  for (const line of net.lines) {
    const stops = net.stopsByLine.get(line.id)!;
    const n = stops.length - 1 + (line.loop ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = stops[i], b = stops[(i + 1) % stops.length];
      const via = VIA[line.id]?.[`${a.code}>${b.code}`] ?? [];
      const ids = [a.stationId, ...via, b.stationId];
      raw.push({ lineId: line.id, from: a, to: b, points: ids.map((id) => pos.get(id)!) });
    }
  }

  // Lines sharing the same pair of stations are drawn side by side.
  const key = (s: MapSegment) => [s.from.stationId, s.to.stationId].sort().join('|');
  const groups = new Map<string, MapSegment[]>();
  for (const s of raw) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
  const segments = raw.map((s) => {
    const group = groups.get(key(s))!;
    if (group.length < 2 || s.points.length !== 2) return s;
    const [p, q] = s.points;
    // Use a direction independent of travel direction so offsets agree.
    const flip = s.from.stationId > s.to.stationId ? -1 : 1;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = (-(q.y - p.y) / len) * flip, ny = ((q.x - p.x) / len) * flip;
    const o = (group.indexOf(s) - (group.length - 1) / 2) * OFFSET;
    return { ...s, points: s.points.map((pt) => ({ x: pt.x + nx * o, y: pt.y + ny * o })) };
  });

  const xs = [...pos.values()].map((p) => p.x), ys = [...pos.values()].map((p) => p.y);
  return {
    pos,
    segments,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
  };
}

export function pathD(points: Pt[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
}

/** Points the traveller passes between two consecutive journey rows. */
export function rowPath(net: Network, model: MapModel, rows: Row[], i: number): Pt[] {
  const a = rows[i], b = rows[i + 1];
  const at = (r: Row): Pt => {
    if (r.kind === 'stop') return model.pos.get(r.stop.stationId)!;
    const p = model.pos.get(r.leg.from.stationId)!, q = model.pos.get(r.leg.to.stationId)!;
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };
  if (!b) return [at(a)];
  if (a.kind === 'stop' && b.kind === 'stop' && a.leg === b.leg) {
    // Follow the drawn track, through any provisional stops and waypoints.
    const stops = net.stopsByLine.get(a.leg.lineId)!;
    const line = net.lineById.get(a.leg.lineId)!;
    const pts: Pt[] = [];
    const step = (from: number, to: number) => {
      const fwd = line.loop ? (to - from + stops.length) % stops.length < stops.length / 2 : to > from;
      for (let k = from; k !== to; ) {
        const next = (k + (fwd ? 1 : -1) + stops.length) % stops.length;
        const [s, t] = fwd ? [stops[k], stops[next]] : [stops[next], stops[k]];
        const seg = model.segments.find((g) => g.lineId === line.id && g.from === s && g.to === t)!;
        const p = fwd ? seg.points : [...seg.points].reverse();
        pts.push(...(pts.length ? p.slice(1) : p));
        k = next;
      }
    };
    step(a.stop.index, b.stop.index);
    return pts;
  }
  return [at(a), at(b)];
}

/** Point and heading (radians) at fraction `f` (0..1) of the way along `pts`. */
export function along(pts: Pt[], f: number): { p: Pt; angle: number } {
  if (pts.length < 2) return { p: pts[0], angle: Math.PI / 2 };
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  const total = lens.reduce((s, l) => s + l, 0);
  let d = f * total;
  for (let i = 0; i < lens.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (d <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, d / lens[i]) : 0;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    d -= lens[i];
  }
  return { p: pts[pts.length - 1], angle: 0 };
}
