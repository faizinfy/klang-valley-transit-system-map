// Builds src/data/coords.ts: a [lat, lon] for every station in the network.
//
//   npx vite-node scripts/build-coords.ts <osm.json>
//
// <osm.json> comes from scripts/fetch-osm-stations.cjs. Stations are matched
// to OpenStreetMap nodes by name; the code prefix (KJ, SP, KC…) separates
// same-named stations. Stations missing from OSM – the planned Circle Line,
// the Sunway BRT and a few others – use the hand-placed positions in MANUAL.
// Provisional stops with no position are placed between their neighbours.
import fs from 'fs';
import path from 'path';
import { buildNetwork } from '../src/lib/network';

type LatLon = [number, number];

// Approximate positions for stations OSM doesn't have (mostly not built yet).
const MANUAL: Record<string, LatLon> = {
  // Circle Line (planned)
  'bukit-kiara-selatan': [3.136, 101.652],
  'bukit-kiara': [3.15, 101.64],
  'sri-hartamas': [3.163, 101.648],
  'bukit-segambut': [3.178, 101.656],
  'taman-sri-sinar': [3.194, 101.661],
  dutamas: [3.184, 101.67],
  'kampung-puah': [3.193, 101.705],
  'jalan-langkawi': [3.2, 101.715],
  'danau-kota': [3.201, 101.721],
  setapak: [3.192, 101.727],
  rejang: [3.182, 101.732],
  au2: [3.17, 101.748],
  'tasik-ampang': [3.15, 101.76],
  'kampung-pandan': [3.142, 101.752],
  'taman-kencana': [3.122, 101.75],
  'taman-cheras': [3.112, 101.745],
  'jalan-yaacob-latif': [3.1, 101.722],
  'sri-permaisuri': [3.098, 101.716],
  'salak-jaya': [3.096, 101.7],
  'jalan-klang-lama': [3.092, 101.682],
  'pantai-dalam-mrt': [3.0975, 101.668],
  'pantai-permai': [3.105, 101.664],
  'um-universiti-malaya': [3.122, 101.655],
  // Sunway BRT
  'sunway-setia-jaya': [3.0835, 101.6118],
  mentari: [3.078, 101.6105],
  'sunway-lagoon': [3.0705, 101.607],
  sunmed: [3.0665, 101.6085],
  'sunu-monash': [3.0655, 101.603],
  'south-quay-usj-1': [3.059, 101.599],
  // Outside the OSM query box
  rembau: [2.5934, 102.095],
  'pulau-sebang': [2.4639, 102.2286],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/^([a-z]{2,3}\d+[a-z]?\s+)+(?=[a-z])/, '') // leading codes like "KA12 Batang Kali"
    .replace(/mrt station|lrt station/g, '')
    .replace(/[^a-z0-9]/g, '');

interface OsmNode { lat: number; lon: number; tags?: Record<string, string> }

const osmFile = process.argv[2];
if (!osmFile) throw new Error('usage: npx vite-node scripts/build-coords.ts <osm.json>');
const nodes: OsmNode[] = JSON.parse(fs.readFileSync(osmFile, 'utf8')).elements;

const byName = new Map<string, OsmNode[]>();
for (const n of nodes) {
  const names = new Set([n.tags?.name, n.tags?.['name:en'], n.tags?.['name:ms']].filter(Boolean).map((s) => norm(s!)));
  for (const k of names) if (k) byName.set(k, [...(byName.get(k) ?? []), n]);
}
const refPrefixes = (n: OsmNode) =>
  new Set((n.tags?.ref ?? '').split(/[;,\s]+/).map((r) => r.match(/^[A-Z]+/)?.[0]).filter(Boolean) as string[]);

const net = buildNetwork();
const coords = new Map<string, LatLon>();
const sources = new Map<string, 'osm' | 'manual' | 'interpolated'>();

for (const st of net.stations.values()) {
  if (MANUAL[st.id]) {
    coords.set(st.id, MANUAL[st.id]);
    sources.set(st.id, 'manual');
    continue;
  }
  const cands = byName.get(norm(st.name)) ?? [];
  if (!cands.length) continue;
  const prefixes = new Set(st.stops.map((s) => s.code.match(/^[A-Z]+/)![0]));
  const withRef = cands.filter((c) => [...refPrefixes(c)].some((p) => prefixes.has(p)));
  const noRef = cands.filter((c) => refPrefixes(c).size === 0);
  const pick = withRef.length ? withRef : noRef.length ? noRef : cands;
  const lat = pick.reduce((a, c) => a + c.lat, 0) / pick.length;
  const lon = pick.reduce((a, c) => a + c.lon, 0) / pick.length;
  coords.set(st.id, [lat, lon]);
  sources.set(st.id, 'osm');
}

// Place remaining stops evenly between the nearest placed neighbours on their line.
for (let pass = 0; pass < 3; pass++) {
  for (const line of net.lines) {
    const stops = net.stopsByLine.get(line.id)!;
    stops.forEach((stop, i) => {
      if (coords.has(stop.stationId)) return;
      let a = i - 1, b = i + 1;
      while (a >= 0 && !coords.has(stops[a].stationId)) a--;
      while (b < stops.length && !coords.has(stops[b].stationId)) b++;
      if (a < 0 || b >= stops.length) return;
      const [pa, pb] = [coords.get(stops[a].stationId)!, coords.get(stops[b].stationId)!];
      const f = (i - a) / (b - a);
      coords.set(stop.stationId, [pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f]);
      sources.set(stop.stationId, 'interpolated');
    });
  }
}

const missing = [...net.stations.keys()].filter((id) => !coords.has(id));
const count = (k: string) => [...sources.values()].filter((v) => v === k).length;
console.log(`osm ${count('osm')}, manual ${count('manual')}, interpolated ${count('interpolated')}, missing ${missing.length}`);
console.log('interpolated:', [...sources].filter(([, v]) => v === 'interpolated').map(([k]) => k).join(', '));
if (missing.length) {
  console.log('MISSING:', missing.join(', '));
  process.exit(1);
}

// Flag stops far from both neighbours – usually a wrong name match.
for (const line of net.lines) {
  const stops = net.stopsByLine.get(line.id)!;
  const d = (a: LatLon, b: LatLon) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180)) * 111;
  stops.forEach((s, i) => {
    const p = coords.get(s.stationId)!;
    const near = [stops[i - 1], stops[i + 1]].filter(Boolean).map((n) => d(p, coords.get(n.stationId)!));
    if (Math.min(...near) > 6) console.log(`check ${s.code} ${s.name}: ${near.map((k) => k.toFixed(1)).join(' / ')} km to neighbours`);
  });
}

const r = (n: number) => Math.round(n * 1e5) / 1e5;
const lines = [...coords]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, [lat, lon]]) => `  '${id}': [${r(lat)}, ${r(lon)}],${sources.get(id) === 'osm' ? '' : ` // ${sources.get(id)}`}`);
const out = `// Generated by scripts/build-coords.ts – do not edit by hand.
// Station positions [lat, lon]. Data © OpenStreetMap contributors (ODbL),
// except stations marked "manual" (approximate, mostly not yet built) or
// "interpolated" (placed between their neighbours).
export const COORDS: Record<string, [number, number]> = {
${lines.join('\n')}
};
`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'coords.ts'), out);
console.log('wrote src/data/coords.ts');
