import { useMemo } from 'react';
import { network, type Station, type Stop } from '../lib/network';
import { findRoute, type RideLeg, type RouteOptions } from '../lib/router';
import { CodePill, LineBadge } from './Badges';
import { StationPicker } from './StationPicker';

interface Props {
  from: Station | null;
  to: Station | null;
  options: RouteOptions;
  onChange: (from: Station | null, to: Station | null) => void;
  onOptions: (o: RouteOptions) => void;
  onOpenStation: (s: Station) => void;
}

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

export function RoutePlanner({ from, to, options, onChange, onOptions, onOpenStation }: Props) {
  const route = useMemo(
    () => (from && to ? findRoute(network, from.id, to.id, options) : null),
    [from, to, options],
  );
  const station = (s: Stop) => network.stations.get(s.stationId)!;

  return (
    <section className="panel" aria-labelledby="planner-title">
      <h2 id="planner-title" className="panel__title">Plan a trip</h2>
      <div className="planner__pickers">
        <StationPicker label="From" value={from} onChange={(s) => onChange(s, to)} />
        <button
          type="button"
          className="swap"
          onClick={() => onChange(to, from)}
          aria-label="Swap origin and destination"
          title="Swap"
        >
          ⇅
        </button>
        <StationPicker label="To" value={to} onChange={(s) => onChange(from, s)} />
      </div>
      <div className="toggles">
        <label>
          <input
            type="checkbox"
            checked={options.includePlanned}
            onChange={(e) => onOptions({ ...options, includePlanned: e.target.checked })}
          />
          Include planned Circle Line
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.includeSuspended}
            onChange={(e) => onOptions({ ...options, includeSuspended: e.target.checked })}
          />
          Include suspended Skypark Link
        </label>
      </div>

      {from && to && !route && (
        <p className="notice">
          No route found. One of these stations may only be served by a planned, provisional or suspended
          line – try the options above.
        </p>
      )}
      {route && route.legs.length === 0 && <p className="notice">You’re already there.</p>}

      {route && route.legs.length > 0 && (
        <div className="route">
          <p className="route__summary">
            <strong>{route.stops}</strong> {route.stops === 1 ? 'stop' : 'stops'} ·{' '}
            <strong>{route.transfers}</strong> {route.transfers === 1 ? 'transfer' : 'transfers'}
          </p>
          <ol className="legs">
            {route.legs.map((leg, i) => {
              if (leg.kind === 'transfer') {
                return (
                  <li key={i} className="leg leg--transfer">
                    <span className="leg__icon" aria-hidden>{leg.type === 'connecting' ? '🚶' : '⇄'}</span>
                    {leg.type === 'connecting' ? (
                      <span>
                        Walk from <strong>{leg.from.name}</strong> to <strong>{leg.to.name}</strong> (connecting
                        station)
                      </span>
                    ) : (
                      <span>
                        Change at <strong>{leg.from.name}</strong>: <CodePill stop={leg.from} /> →{' '}
                        <CodePill stop={leg.to} />
                      </span>
                    )}
                  </li>
                );
              }
              const line = network.lineById.get(leg.lineId)!;
              const board = leg.stops[0], alight = leg.stops[leg.stops.length - 1];
              const middle = leg.stops.slice(1, -1);
              const n = leg.stops.length - 1;
              return (
                <li key={i} className="leg leg--ride" style={{ '--line': line.color } as React.CSSProperties}>
                  <div className="leg__head">
                    <LineBadge line={line} />
                    <span className="leg__line">{line.name}</span>
                    <span className="leg__dir">{direction(leg)}</span>
                  </div>
                  <button type="button" className="leg__stop" onClick={() => onOpenStation(station(board))}>
                    <CodePill stop={board} /> {board.name}
                  </button>
                  {middle.length > 0 ? (
                    <details className="leg__middle">
                      <summary>
                        {n} {n === 1 ? 'stop' : 'stops'}
                      </summary>
                      <ul>
                        {middle.map((s) => (
                          <li key={s.code}>
                            <CodePill stop={s} /> {s.name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <p className="leg__middle leg__middle--plain">1 stop</p>
                  )}
                  <button type="button" className="leg__stop" onClick={() => onOpenStation(station(alight))}>
                    <CodePill stop={alight} /> {alight.name}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="fineprint">
            Stop counts skip provisional stations. Timings and fares aren’t on the source map, so they aren’t shown.
          </p>
        </div>
      )}
    </section>
  );
}
