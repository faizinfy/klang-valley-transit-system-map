import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildTimeline, isRideSegment, positionAt, routeRows, type Row } from '../lib/journey';
import { network, type Station, type Stop } from '../lib/network';
import type { RideLeg, Route } from '../lib/router';
import { CodePill, LineBadge } from './Badges';

const SPEEDS = [1, 2, 4];
const TRACK_X = 20; // centre of the track, px from the left of the list
const FOLLOW_MARGIN = 72; // keep the train this far above the bottom of the window

function direction(leg: RideLeg): string {
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

const lineColor = (row: Row | undefined) =>
  row?.kind === 'stop' ? network.lineById.get(row.leg.lineId)!.color : undefined;

function describe(row: Row): string | null {
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

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

interface Props {
  route: Route;
  onOpenStation: (s: Station) => void;
}

export function RouteJourney({ route, onOpenStation }: Props) {
  const rows = useMemo(() => routeRows(route), [route]);
  const { segments, total } = useMemo(() => buildTimeline(rows), [rows]);
  const reducedMotion = usePrefersReducedMotion();

  const listRef = useRef<HTMLOListElement>(null);
  const anchorRefs = useRef<(HTMLElement | null)[]>([]);
  const travellerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const [ys, setYs] = useState<number[]>([]);
  const [height, setHeight] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [current, setCurrent] = useState(-1); // row reached; -1 before the first play
  const currentRef = useRef(-1);
  const [announcement, setAnnouncement] = useState('');

  // Measure where each row's track point sits, so the drawing follows the
  // real layout (rows with a line header are taller than plain stops).
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const top = list.getBoundingClientRect().top;
    setYs(anchorRefs.current.slice(0, rows.length).map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top - top + r.height / 2;
    }));
    setHeight(list.offsetHeight);
  }, [rows.length]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const draw = useCallback(
    (follow: boolean) => {
      const el = travellerRef.current;
      if (!el || ys.length !== rows.length) return;
      const { pos, mode, row } = positionAt(segments, timeRef.current);
      const i = Math.floor(pos), f = pos - i;
      const y = ys[i] + ((ys[i + 1] ?? ys[i]) - ys[i]) * f;
      el.style.transform = `translate(${TRACK_X}px, ${y}px)`;
      el.dataset.mode = mode;
      const color = lineColor(rows[i]) ?? lineColor(rows[i + 1]) ?? '#888';
      el.style.setProperty('--train', color);
      if (timeRef.current === 0) return; // not started: park the train, highlight nothing
      if (currentRef.current !== row) {
        currentRef.current = row;
        setCurrent(row);
        const text = describe(rows[row]);
        if (text) setAnnouncement(text);
      }
      if (follow) {
        const r = el.getBoundingClientRect();
        const overshoot = r.bottom - (innerHeight - FOLLOW_MARGIN);
        if (overshoot > 0) scrollBy(0, overshoot);
      }
    },
    [rows, segments, ys],
  );

  useLayoutEffect(() => {
    if (!playing) draw(false);
  }, [draw, playing]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      timeRef.current = Math.min(total, timeRef.current + (now - last) * speed);
      last = now;
      draw(true);
      if (timeRef.current >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total, draw]);

  const finished = current === rows.length - 1 && timeRef.current >= total;
  const play = () => {
    if (finished) {
      timeRef.current = 0;
      currentRef.current = -1;
      setCurrent(-1);
    }
    setPlaying(true);
  };
  const station = (s: Stop) => network.stations.get(s.stationId)!;
  const animate = !reducedMotion;

  return (
    <div className="journey">
      {animate && (
        <div className="journey__controls">
          <button type="button" className="btn btn--primary" onClick={playing ? () => setPlaying(false) : play}>
            {playing ? '❚❚ Pause' : finished ? '↺ Replay' : current >= 0 ? '▶ Resume' : '▶ Play journey'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
            aria-label={`Animation speed ${speed} times. Change speed`}
          >
            {speed}×
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <div className="journey__body">
        <svg className="journey__track" width={TRACK_X * 2} height={height} aria-hidden>
          {ys.length === rows.length &&
            rows.slice(0, -1).map((_, i) =>
              isRideSegment(rows, i) ? (
                <line key={i} x1={TRACK_X} x2={TRACK_X} y1={ys[i]} y2={ys[i + 1]} stroke={lineColor(rows[i])} strokeWidth={6} />
              ) : (
                <line key={i} x1={TRACK_X} x2={TRACK_X} y1={ys[i]} y2={ys[i + 1]} className="journey__walk-line" />
              ),
            )}
          {ys.length === rows.length &&
            rows.map((row, i) =>
              row.kind === 'stop' ? (
                <circle
                  key={i}
                  cx={TRACK_X}
                  cy={ys[i]}
                  r={row.role === 'via' ? 4.5 : 7}
                  className="journey__dot"
                  stroke={lineColor(row)}
                  strokeWidth={row.role === 'via' ? 2.5 : 3.5}
                />
              ) : null,
            )}
        </svg>

        {animate && (
          <div ref={travellerRef} className="traveller" data-mode="train" aria-hidden>
            <svg className="traveller__train" width="18" height="30" viewBox="0 0 18 30">
              <rect x="1" y="1" width="16" height="28" rx="8" fill="var(--train)" stroke="var(--surface)" strokeWidth="2" />
              <rect x="4.5" y="6" width="9" height="6" rx="1.5" fill="#fff" opacity="0.35" />
              <rect x="4" y="17" width="10" height="7" rx="2" fill="#fff" opacity="0.92" />
            </svg>
            <span className="traveller__walker">🚶</span>
          </div>
        )}

        <ol ref={listRef} className="journey__rows">
          {rows.map((row, i) => {
            const state = current < 0 ? '' : i === current ? ' is-current' : i < current ? ' is-passed' : '';
            if (row.kind === 'transfer') {
              const { leg } = row;
              return (
                <li key={i} className={`jrow jrow--transfer${state}`}>
                  <span ref={(el) => (anchorRefs.current[i] = el)} className="jrow__anchor">
                    {leg.type === 'connecting' ? (
                      <>Walk to <strong>{leg.to.name}</strong> (connecting station)</>
                    ) : (
                      <>Change platforms: <CodePill stop={leg.from} /> → <CodePill stop={leg.to} /></>
                    )}
                  </span>
                </li>
              );
            }
            const line = network.lineById.get(row.leg.lineId)!;
            const n = row.leg.stops.length - 1;
            return (
              <li key={i} className={`jrow jrow--${row.role}${state}`}>
                {row.role === 'board' && (
                  <div className="jrow__head">
                    <LineBadge line={line} size="sm" />
                    <span className="jrow__line">{line.name}</span>
                    <span className="jrow__dir">
                      {direction(row.leg)} · {n} {n === 1 ? 'stop' : 'stops'}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  ref={(el) => (anchorRefs.current[i] = el)}
                  className="jrow__anchor jrow__stop"
                  onClick={() => onOpenStation(station(row.stop))}
                >
                  <CodePill stop={row.stop} /> <span className="jrow__name">{row.stop.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
