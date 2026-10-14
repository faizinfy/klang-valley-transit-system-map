import { AIRPORT_STATIONS, CONNECTIONS, LINES, type LineDef, type StopStatus } from '../data/network';

export type { LineDef } from '../data/network';

export interface Stop {
  code: string;
  lineId: string;
  stationId: string;
  name: string;
  index: number;
  status: StopStatus;
}

export interface Station {
  id: string;
  name: string;
  stops: Stop[];
  connections: string[];
  airport: boolean;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface Network {
  lines: LineDef[];
  lineById: Map<string, LineDef>;
  stations: Map<string, Station>;
  stopByCode: Map<string, Stop>;
  stopsByLine: Map<string, Stop[]>;
}

export function buildNetwork(lines: LineDef[] = LINES, connections = CONNECTIONS): Network {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const stations = new Map<string, Station>();
  const stopByCode = new Map<string, Stop>();
  const stopsByLine = new Map<string, Stop[]>();

  for (const line of lines) {
    const stops: Stop[] = line.stops.map(([code, name, opts], index) => {
      const stationId = opts?.key ?? slugify(name);
      const stop: Stop = { code, lineId: line.id, stationId, name, index, status: opts?.status ?? 'open' };
      let station = stations.get(stationId);
      if (!station) {
        station = { id: stationId, name, stops: [], connections: [], airport: AIRPORT_STATIONS.includes(stationId) };
        stations.set(stationId, station);
      }
      station.stops.push(stop);
      stopByCode.set(code, stop);
      return stop;
    });
    stopsByLine.set(line.id, stops);
  }

  for (const [a, b] of connections) {
    stations.get(a)?.connections.push(b);
    stations.get(b)?.connections.push(a);
  }

  return { lines, lineById, stations, stopByCode, stopsByLine };
}

export const network = buildNetwork();

/** Resolve a station from an id or any of its codes (case-insensitive). */
export function findStation(net: Network, idOrCode: string): Station | undefined {
  return net.stations.get(idOrCode) ?? (net.stopByCode.get(idOrCode.toUpperCase())
    ? net.stations.get(net.stopByCode.get(idOrCode.toUpperCase())!.stationId)
    : undefined);
}

export function primaryCode(station: Station): string {
  return station.stops[0].code;
}

export function stationLines(net: Network, station: Station): LineDef[] {
  const ids = [...new Set(station.stops.map((s) => s.lineId))];
  return ids.map((id) => net.lineById.get(id)!);
}

/** Rank stations by how well their name or codes match a free-text query. */
export function searchStations(net: Network, query: string, limit = 12): Station[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: [number, Station][] = [];
  for (const st of net.stations.values()) {
    const name = st.name.toLowerCase();
    let score = -1;
    if (st.stops.some((s) => s.code.toLowerCase() === q)) score = 0;
    else if (name === q) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.split(/[\s(-]+/).some((w) => w.startsWith(q))) score = 3;
    else if (name.includes(q)) score = 4;
    else if (st.stops.some((s) => s.code.toLowerCase().startsWith(q))) score = 5;
    if (score >= 0) scored.push([score, st]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, s]) => s);
}
