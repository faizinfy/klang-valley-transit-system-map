import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildTimeline, describeRow, positionAt, routeRows, rowColor } from '../lib/journey';
import { along, buildMapModel, pathD, rowPath, type Pt } from '../lib/mapGeometry';
import { network, type Station } from '../lib/network';
import { findRoute, type RouteOptions } from '../lib/router';
import { usePlayer, usePrefersReducedMotion } from '../lib/usePlayer';
import { CodePill } from './Badges';
import { PlayerControls } from './PlayerControls';

const model = buildMapModel(network);

// Label detail by zoom level (screen pixels per map unit).
const ZOOM_LEVELS = [0, 1.4, 3.2];
const MIN_K = 0.15, MAX_K = 14;

type View = { k: number; tx: number; ty: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const shortName = (name: string) => name.replace(/\s*\(.*\)/, '');

// A station joined by a walkway to a same-named one (e.g. the monorail's
// KL Sentral) shares that station's label.
const sharesLabel = (st: Station) =>
  st.connections.some((id) => {
    const other = network.stations.get(id)!;
    return other.name === st.name && other.id < st.id;
  });

// Walkway links between connecting stations, drawn once per pair.
const walkways = [...network.stations.values()].flatMap((st) =>
  st.connections.filter((id) => st.id < id).map((id) => [model.pos.get(st.id), model.pos.get(id)] as const),
).filter((pair): pair is readonly [Pt, Pt] => !!pair[0] && !!pair[1]);

const isMajor = (st: Station) => {
  const multi = new Set(st.stops.map((s) => s.lineId)).size > 1 || st.connections.length > 0;
  const terminus = st.stops.some((s) => {
    const stops = network.stopsByLine.get(s.lineId)!;
    return !network.lineById.get(s.lineId)!.loop && (s.index === 0 || s.index === stops.length - 1);
  });
  return { multi, terminus };
};

interface Props {
  from: Station | null;
  to: Station | null;
  options: RouteOptions;
  onChange: (from: Station | null, to: Station | null) => void;
  onOpenStation: (s: Station) => void;
  onShowSteps: () => void;
}

export function MapView({ from, to, options, onChange, onOpenStation, onShowSteps }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const travellerRef = useRef<SVGGElement>(null);
  const view = useRef<View>({ k: 1, tx: 0, ty: 0 });
  const size = useRef({ w: 0, h: 0 });
  const [level, setLevel] = useState(0);
  const [selected, setSelected] = useState<Station | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = usePrefersReducedMotion();

  const route = useMemo(
    () => (from && to ? findRoute(network, from.id, to.id, options) : null),
    [from, to, options],
  );
  const rows = useMemo(() => (route ? routeRows(route) : []), [route]);
  const paths = useMemo(() => rows.slice(0, -1).map((_, i) => rowPath(network, model, rows, i)), [rows]);
  const { segments, total } = useMemo(() => buildTimeline(rows), [rows]);
  const routeStations = useMemo(
    () => new Set(rows.flatMap((r) => (r.kind === 'stop' ? [r.stop.stationId] : []))),
    [rows],
  );
  // Where you board, alight or change – always labelled.
  const keyStations = useMemo(
    () => new Set(rows.flatMap((r) => (r.kind === 'stop' && r.role !== 'via' ? [r.stop.stationId] : []))),
    [rows],
  );

  // --- traveller -----------------------------------------------------------
  const lastRow = useRef(-1);
  const drawTraveller = useCallback(
    (time: number) => {
      const el = travellerRef.current;
      if (!el || !rows.length) return;
      const { pos, mode, row } = positionAt(segments, time);
      const i = Math.min(Math.floor(pos), rows.length - 1);
      const { p, angle } = paths[i] ? along(paths[i], pos - i) : along([model.pos.get(rowStation(rows[i]))!], 0);
      const k = view.current.k;
      const deg = (angle * 180) / Math.PI;
      el.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${1 / k})`);
      el.dataset.mode = mode;
      el.querySelector('.map-train')?.setAttribute('transform', `rotate(${deg})`);
      el.style.setProperty('--train', rowColor(rows[i]) ?? rowColor(rows[i + 1]) ?? '#888');
      if (time > 0 && row !== lastRow.current) {
        lastRow.current = row;
        const text = describeRow(rows[row]);
        if (text) setAnnouncement(text);
      }
    },
    [rows, segments, paths],
  );
  const player = usePlayer(total, drawTraveller);
  const { redraw } = player;

  // --- pan & zoom ----------------------------------------------------------
  const apply = useCallback(() => {
    const { k, tx, ty } = view.current;
    layerRef.current?.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    svgRef.current?.style.setProperty('--k', String(k));
    const lvl = ZOOM_LEVELS.filter((z) => k >= z).length - 1;
    setLevel((l) => (l === lvl ? l : lvl));
    redraw();
  }, [redraw]);

  // Fit bounds in view. Labels sit to the right of stations, and the zoom
  // buttons are top-right, so leave extra room on the right.
  const fit = useCallback(
    (b: Bounds, pad = 40, padRight = pad) => {
      const { w, h } = size.current;
      if (!w || !h) return;
      const bw = Math.max(b.maxX - b.minX, 1), bh = Math.max(b.maxY - b.minY, 1);
      const availW = Math.max(w - pad - padRight, 40);
      const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(availW / bw, (h - pad * 2) / bh)));
      view.current = { k, tx: pad + availW / 2 - k * (b.minX + bw / 2), ty: h / 2 - k * (b.minY + bh / 2) };
      apply();
    },
    [apply],
  );

  const routeBounds = useMemo<Bounds | null>(() => {
    const pts = paths.flat();
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }, [paths]);
  const fitDefault = useCallback(
    () => (routeBounds ? fit(routeBounds, 48, 130) : fit(model.bounds, 24, 70)),
    [fit, routeBounds],
  );

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => {
      const first = !size.current.w;
      size.current = { w: el.clientWidth, h: el.clientHeight };
      if (first) fitDefault();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitDefault]);

  // Re-frame and rewind when the route changes.
  const { reset } = player;
  useEffect(() => {
    lastRow.current = -1;
    reset();
    fitDefault();
  }, [fitDefault, reset]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = view.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      view.current = { k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
      apply();
    },
    [apply],
  );

  // Pointer gestures: drag to pan, pinch / wheel to zoom.
  const pointers = useRef(new Map<number, Pt>());
  const moved = useRef(0);
  const downTarget = useRef<Element | null>(null);
  useEffect(() => {
    const el = wrapRef.current!;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest('.map-ui')) return;
      el.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, local(e));
      if (pointers.current.size === 1) {
        moved.current = 0;
        downTarget.current = e.target as Element;
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      const pts = [...pointers.current.entries()];
      if (pts.length === 1) {
        view.current.tx += p.x - prev.x;
        view.current.ty += p.y - prev.y;
        moved.current += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
        pointers.current.set(e.pointerId, p);
        apply();
      } else if (pts.length === 2) {
        const other = pts.find(([id]) => id !== e.pointerId)![1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(p.x - other.x, p.y - other.y);
        const mid0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
        const mid1 = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
        view.current.tx += mid1.x - mid0.x;
        view.current.ty += mid1.y - mid0.y;
        moved.current += 10;
        pointers.current.set(e.pointerId, p);
        if (d0 > 0) zoomAt(d1 / d0, mid1.x, mid1.y);
        else apply();
      }
    };
    // Pointer capture retargets the click, so detect taps on stations here.
    const onUp = (e: PointerEvent) => {
      const wasTap = pointers.current.size === 1 && moved.current < 6;
      pointers.current.delete(e.pointerId);
      if (!wasTap || e.type === 'pointercancel') return;
      const id = downTarget.current?.closest<SVGElement>('[data-station]')?.dataset.station;
      setSelected(id ? network.stations.get(id) ?? null : null);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [apply, zoomAt]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const { w, h } = size.current;
    const step = 60;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (view.current.tx += step),
      ArrowRight: () => (view.current.tx -= step),
      ArrowUp: () => (view.current.ty += step),
      ArrowDown: () => (view.current.ty -= step),
      '+': () => zoomAt(1.4, w / 2, h / 2),
      '=': () => zoomAt(1.4, w / 2, h / 2),
      '-': () => zoomAt(1 / 1.4, w / 2, h / 2),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
    apply();
  };

  // --- render --------------------------------------------------------------
  const dim = !!route && route.legs.length > 0;
  const stations = [...network.stations.values()].filter((s) => model.pos.has(s.id));

  return (
    <section className="panel panel--map" aria-labelledby="map-title">
      <div className="map-head">
        <h2 id="map-title" className="panel__title">Network map</h2>
        {route && route.legs.length > 0 ? (
          <div className="map-route">
            <span className="map-route__text">
              <strong>{from!.name}</strong> → <strong>{to!.name}</strong> · {route.stops} stops · {route.transfers}{' '}
              {route.transfers === 1 ? 'transfer' : 'transfers'}
            </span>
            <span className="map-route__actions">
              {!reducedMotion && <PlayerControls player={player} started={player.timeRef.current > 0} />}
              <button type="button" className="btn" onClick={onShowSteps}>Steps</button>
              <button type="button" className="btn" onClick={() => onChange(null, null)} aria-label="Clear route">✕</button>
            </span>
          </div>
        ) : (
          <p className="muted">
            {from && to ? 'No route between these stations with the current options.' : 'Tap a station to plan a trip from or to it. Drag to move, pinch or scroll to zoom.'}
          </p>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <div
        ref={wrapRef}
        className="map"
        tabIndex={0}
        role="application"
        aria-label="Network map. Use arrow keys to pan and plus or minus to zoom."
        onKeyDown={onKeyDown}
      >
        <svg ref={svgRef} className={`map-svg level-${level}${dim ? ' has-route' : ''}`} width="100%" height="100%">
          <g ref={layerRef}>
            <g className="map-lines">
              {walkways.map(([a, b], i) => (
                <line key={`w${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="map-walkway" />
              ))}
              {model.segments.map((s, i) => {
                const line = network.lineById.get(s.lineId)!;
                return (
                  <path
                    key={i}
                    d={pathD(s.points)}
                    stroke={line.color}
                    className={`map-line map-line--${line.status}`}
                  />
                );
              })}
            </g>
            {dim && (
              <g className="map-route-lines">
                {paths.map((pts, i) => {
                  const r = rows[i], n = rows[i + 1];
                  const ride = r.kind === 'stop' && n.kind === 'stop' && r.leg === n.leg;
                  return ride ? (
                    <path key={i} d={pathD(pts)} stroke={rowColor(r)} className="map-route-line" />
                  ) : (
                    <path key={i} d={pathD(pts)} className="map-walk-line" />
                  );
                })}
              </g>
            )}
            <g className="map-stations">
              {stations.map((st) => {
                const p = model.pos.get(st.id)!;
                const { multi, terminus } = isMajor(st);
                const onRoute = routeStations.has(st.id);
                const muted = st.stops.every((s) => s.status !== 'open' || network.lineById.get(s.lineId)!.status !== 'open');
                const color = network.lineById.get(st.stops[0].lineId)!.color;
                const showLabel = dim
                  ? keyStations.has(st.id) || (onRoute && level >= 2)
                  : !sharesLabel(st) && (level >= 2 || terminus || (level >= 1 && multi));
                return (
                  <g
                    key={st.id}
                    className={`map-station${multi ? ' is-interchange' : ''}${onRoute ? ' is-on-route' : ''}${muted ? ' is-muted' : ''}${showLabel ? ' has-label' : ''}${selected?.id === st.id ? ' is-selected' : ''}`}
                    transform={`translate(${p.x} ${p.y})`}
                    data-station={st.id}
                  >
                    <circle className="map-station__hit" r={4} />
                    <circle className="map-station__dot" r={2} stroke={multi ? undefined : color} />
                    {showLabel && <text className="map-station__label">{shortName(st.name)}</text>}
                  </g>
                );
              })}
            </g>
            {dim && !reducedMotion && (
              <g ref={travellerRef} className="map-traveller" data-mode="train">
                <g className="map-train">
                  <rect x={-12} y={-6.5} width={24} height={13} rx={6.5} fill="var(--train)" stroke="#fff" strokeWidth={2} />
                  <rect x={4} y={-3.5} width={5} height={7} rx={1.5} fill="#fff" opacity={0.92} />
                </g>
                <g className="map-walker">
                  <circle r={11} />
                  <text y={5} textAnchor="middle">🚶</text>
                </g>
              </g>
            )}
          </g>
        </svg>

        <div className="map-ui map-zoom">
          <button type="button" onClick={() => zoomAt(1.5, size.current.w / 2, size.current.h / 2)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomAt(1 / 1.5, size.current.w / 2, size.current.h / 2)} aria-label="Zoom out">−</button>
          <button type="button" onClick={fitDefault} aria-label={route ? 'Fit route' : 'Fit network'} title="Fit">⤢</button>
        </div>

        {selected && (
          <div className="map-ui map-card" role="dialog" aria-label={selected.name}>
            <div className="map-card__head">
              <strong>{selected.name}</strong>
              <button type="button" className="map-card__close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </div>
            <span className="pills">{selected.stops.map((s) => <CodePill key={s.code} stop={s} />)}</span>
            <div className="actions">
              <button type="button" className="btn" onClick={() => { onChange(selected, to); setSelected(null); }}>From here</button>
              <button type="button" className="btn" onClick={() => { onChange(from, selected); setSelected(null); }}>To here</button>
              <button type="button" className="btn" onClick={() => onOpenStation(selected)}>Details</button>
            </div>
          </div>
        )}
      </div>
      <p className="fineprint">
        Station positions © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; outer areas
        are drawn closer to the centre so the whole network fits. Planned Circle Line and Sunway BRT stops are approximate.
      </p>
    </section>
  );
}

function rowStation(row: ReturnType<typeof routeRows>[number]): string {
  return row.kind === 'stop' ? row.stop.stationId : row.leg.from.stationId;
}
