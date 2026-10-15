# KV Transit Navigator

A small web app for the Klang Valley rail and BRT network: plan a trip, browse lines and look up stations.

Network data is transcribed from the *Klang Valley Transit System Map* designed by **@ziqtofu**. Only factual
data (station names, codes, line order, interchanges) is used – not the map artwork. Unofficial; check Rapid KL /
KTMB for live service information.

## Features

- **Route planner** – fewest transfers / stops between any two stations, with interchange and walking
  (connecting-station) transfers. Share a route as a link, e.g. `/?from=KJ24&to=KG26`.
- **Journey animation** – press Play to watch a train run the planned route, with a walking figure at transfers.
- **Map** – the whole network drawn from real station positions (outer areas pulled in so everything fits).
  Pan, zoom, tap a station to plan from/to it, and watch the train travel your route on the map.
- **Lines** – every line in running order, with transfer badges at each stop.
- **Stations** – codes, lines, neighbouring stops and walking connections.
- The planned **Circle Line** and the suspended **KTM Skypark Link** are in the data and shown in the
  Lines view; the planner leaves them out unless you tick the matching option.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # data checks + routing tests
npm run build    # type-check and build to dist/
```

## Data

All network data lives in [`src/data/network.ts`](src/data/network.ts):

- `LINES` – each line's stops in running order. Stops with the same name merge into one interchange
  station unless given a separate `key`.
- `CONNECTIONS` – separate stations joined by a walkway (e.g. Putra ↔ PWTC).
- Stop status `provisional` (greyed on the map; trains run through without stopping) and `planned` (opens
  with a planned line).

Corrections to apparent misprints on the source map are listed at the top of that file.

Station positions for the map live in [`src/data/coords.ts`](src/data/coords.ts), generated from
OpenStreetMap (© OpenStreetMap contributors, ODbL). Stations not yet built (Circle Line, Sunway BRT stops) are
hand-placed approximations in `scripts/build-coords.ts`. To regenerate after changing the network:

```bash
node scripts/fetch-osm-stations.cjs osm.json
npx vite-node scripts/build-coords.ts osm.json
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New → Project** and import the repository.
3. Vercel detects Vite automatically (build command `npm run build`, output directory `dist`). Click **Deploy**.

Or from the command line: `npx vercel --prod`.
