import { useMemo } from 'react';
import { network, type Station } from '../lib/network';
import { findRoute, type RouteOptions } from '../lib/router';
import { RouteJourney } from './RouteJourney';
import { StationPicker } from './StationPicker';

interface Props {
  from: Station | null;
  to: Station | null;
  options: RouteOptions;
  onChange: (from: Station | null, to: Station | null) => void;
  onOptions: (o: RouteOptions) => void;
  onOpenStation: (s: Station) => void;
}

export function RoutePlanner({ from, to, options, onChange, onOptions, onOpenStation }: Props) {
  const route = useMemo(
    () => (from && to ? findRoute(network, from.id, to.id, options) : null),
    [from, to, options],
  );

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
          <RouteJourney key={`${from!.id}|${to!.id}|${options.includePlanned}|${options.includeSuspended}`} route={route} onOpenStation={onOpenStation} />
          <p className="fineprint">
            Stop counts skip provisional stations. Timings and fares aren’t on the source map, so they aren’t shown.
          </p>
        </div>
      )}
    </section>
  );
}
