// Downloads rail/BRT station locations in the Klang Valley from OpenStreetMap
// (Overpass API). The output feeds scripts/build-coords.cjs.
//
//   node scripts/fetch-osm-stations.cjs <out.json>
//
// Data © OpenStreetMap contributors, ODbL.
const https = require('https');
const fs = require('fs');

const BBOX = '2.35,101.25,3.75,102.0'; // Pulau Sebang .. Tanjung Malim, Port Klang .. Kajang
const query = `[out:json][timeout:120];
(
  node["railway"~"^(station|halt|stop)$"](${BBOX});
  node["public_transport"~"^(station|stop_position)$"]["train"="yes"](${BBOX});
  node["public_transport"~"^(station|stop_position)$"]["light_rail"="yes"](${BBOX});
  node["public_transport"~"^(station|stop_position)$"]["subway"="yes"](${BBOX});
  node["public_transport"~"^(station|stop_position)$"]["monorail"="yes"](${BBOX});
  node["public_transport"="station"]["bus"="yes"](2.95,101.55,3.12,101.65);
);
out body;`;

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/fetch-osm-stations.cjs <out.json>');

const body = 'data=' + encodeURIComponent(query);
const req = https.request(
  'https://overpass-api.de/api/interpreter',
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'kv-transit-navigator' } },
  (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`);
      fs.writeFileSync(out, text);
      console.log(`saved ${JSON.parse(text).elements.length} elements to ${out}`);
    });
  },
);
req.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
req.end(body);
