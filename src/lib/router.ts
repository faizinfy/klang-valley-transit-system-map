import type { Network, Stop } from './network';

export interface RouteOptions {
  /** Use planned lines and stops (e.g. the Circle Line). */
  includePlanned: boolean;
  /** Use suspended lines (e.g. the KTM Skypark Link). */
  includeSuspended: boolean;
}

export const DEFAULT_OPTIONS: RouteOptions = { includePlanned: false, includeSuspended: false };

// Cost units: one stop ridden = 1. Changing lines is penalised so the
// planner prefers fewer transfers unless the detour is long.
const INTERCHANGE_COST = 6;
const CONNECTING_COST = 8;

export interface RideLeg {
  kind: 'ride';
  lineId: string;
  stops: Stop[]; // boarding stop first, alighting stop last
}

export interface TransferLeg {
  kind: 'transfer';
  /** 'interchange' = same station, 'connecting' = walk to another station. */
  type: 'interchange' | 'connecting';
  from: Stop;
  to: Stop;
}

export type Leg = RideLeg | TransferLeg;

export interface Route {
  legs: Leg[];
  stops: number;
  transfers: number;
}

function usable(net: Network, stop: Stop, opts: RouteOptions): boolean {
  const line = net.lineById.get(stop.lineId)!;
  if (line.status === 'planned' && !opts.includePlanned) return false;
  if (line.status === 'suspended' && !opts.includeSuspended) return false;
  if (stop.status === 'provisional') return false;
  if (stop.status === 'planned' && !opts.includePlanned) return false;
  return true;
}

interface Edge {
  to: string; // stop code
  cost: number;
  kind: 'ride' | 'interchange' | 'connecting';
}

function buildGraph(net: Network, opts: RouteOptions): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  const add = (a: string, b: string, cost: number, kind: Edge['kind']) => {
    if (!graph.has(a)) graph.set(a, []);
    graph.get(a)!.push({ to: b, cost, kind });
  };

  // Rides: link consecutive usable stops; trains run through provisional ones.
  for (const line of net.lines) {
    const stops = net.stopsByLine.get(line.id)!.filter((s) => usable(net, s, opts));
    for (const s of stops) graph.set(s.code, graph.get(s.code) ?? []);
    const pairs = stops.length - 1 + (line.loop && stops.length > 2 ? 1 : 0);
    for (let i = 0; i < pairs; i++) {
      const a = stops[i], b = stops[(i + 1) % stops.length];
      add(a.code, b.code, 1, 'ride');
      add(b.code, a.code, 1, 'ride');
    }
  }

  // Transfers: between lines at one station, and walks to connecting stations.
  for (const st of net.stations.values()) {
    const here = st.stops.filter((s) => usable(net, s, opts));
    for (const a of here) {
      for (const b of here) {
        if (a.lineId !== b.lineId) add(a.code, b.code, INTERCHANGE_COST, 'interchange');
      }
      for (const otherId of st.connections) {
        for (const b of net.stations.get(otherId)!.stops) {
          if (usable(net, b, opts)) add(a.code, b.code, CONNECTING_COST, 'connecting');
        }
      }
    }
  }
  return graph;
}

/** Find the best route between two stations (by id), or null if unreachable. */
export function findRoute(
  net: Network,
  fromStationId: string,
  toStationId: string,
  opts: RouteOptions = DEFAULT_OPTIONS,
): Route | null {
  const from = net.stations.get(fromStationId);
  const to = net.stations.get(toStationId);
  if (!from || !to) return null;
  if (from.id === to.id) return { legs: [], stops: 0, transfers: 0 };

  const graph = buildGraph(net, opts);
  const targets = new Set(to.stops.filter((s) => usable(net, s, opts)).map((s) => s.code));
  const dist = new Map<string, number>();
  const prev = new Map<string, { code: string; kind: Edge['kind'] }>();
  const queue: [number, string][] = [];

  for (const s of from.stops) {
    if (!usable(net, s, opts)) continue;
    dist.set(s.code, 0);
    queue.push([0, s.code]);
  }

  // The graph has a few hundred nodes, so a sorted array is fast enough.
  let reached: string | null = null;
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, code] = queue.shift()!;
    if (d > (dist.get(code) ?? Infinity)) continue;
    if (targets.has(code)) {
      reached = code;
      break;
    }
    for (const e of graph.get(code) ?? []) {
      const nd = d + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { code, kind: e.kind });
        queue.push([nd, e.to]);
      }
    }
  }
  if (!reached) return null;

  // Walk back to get the path, then group it into legs.
  const path: { code: string; kind: Edge['kind'] | null }[] = [];
  for (let c: string | undefined = reached; c !== undefined; ) {
    const p = prev.get(c);
    path.unshift({ code: c, kind: p?.kind ?? null });
    c = p?.code;
  }

  const legs: Leg[] = [];
  let ride: RideLeg | null = null;
  for (let i = 0; i < path.length; i++) {
    const stop = net.stopByCode.get(path[i].code)!;
    const kind = path[i].kind;
    if (kind === null) continue;
    if (kind === 'ride') {
      if (!ride) {
        ride = { kind: 'ride', lineId: stop.lineId, stops: [net.stopByCode.get(path[i - 1].code)!] };
        legs.push(ride);
      }
      ride.stops.push(stop);
    } else {
      ride = null;
      legs.push({ kind: 'transfer', type: kind, from: net.stopByCode.get(path[i - 1].code)!, to: stop });
    }
  }

  // Drop transfers at the very start or end (e.g. walking between platforms
  // of the origin station before boarding) – they aren't part of the trip.
  while (legs[0]?.kind === 'transfer' && legs[0].type === 'interchange') legs.shift();
  while (legs.at(-1)?.kind === 'transfer' && (legs.at(-1) as TransferLeg).type === 'interchange') legs.pop();

  const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
  return {
    legs,
    stops: rides.reduce((n, r) => n + r.stops.length - 1, 0),
    transfers: legs.filter((l) => l.kind === 'transfer').length,
  };
}
