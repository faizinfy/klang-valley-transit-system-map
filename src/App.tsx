import { useEffect, useRef, useState } from 'react';
import { LineExplorer } from './components/LineExplorer';
import { RoutePlanner } from './components/RoutePlanner';
import { StationLookup } from './components/StationLookup';
import { findStation, network, primaryCode, type LineDef, type Station } from './lib/network';
import type { RouteOptions } from './lib/router';

type Tab = 'plan' | 'lines' | 'station';
const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Route planner' },
  { id: 'lines', label: 'Lines' },
  { id: 'station', label: 'Stations' },
];

interface State {
  tab: Tab;
  from: Station | null;
  to: Station | null;
  line: LineDef | null;
  station: Station | null;
  options: RouteOptions;
}

// State lives in the query string so any view can be shared as a link,
// e.g. ?from=KJ24&to=KG26 or ?tab=lines&line=KJ.
function readUrl(): State {
  const q = new URLSearchParams(location.search);
  const st = (k: string) => (q.get(k) ? findStation(network, q.get(k)!) ?? null : null);
  const tab = (q.get('tab') as Tab) || 'plan';
  return {
    tab: TABS.some((t) => t.id === tab) ? tab : 'plan',
    from: st('from'),
    to: st('to'),
    line: network.lineById.get(q.get('line') ?? '') ?? null,
    station: st('station'),
    options: { includePlanned: q.get('planned') === '1', includeSuspended: q.get('suspended') === '1' },
  };
}

function writeUrl(s: State, replace: boolean) {
  const q = new URLSearchParams();
  if (s.tab !== 'plan') q.set('tab', s.tab);
  if (s.tab === 'plan') {
    if (s.from) q.set('from', primaryCode(s.from));
    if (s.to) q.set('to', primaryCode(s.to));
    if (s.options.includePlanned) q.set('planned', '1');
    if (s.options.includeSuspended) q.set('suspended', '1');
  }
  if (s.tab === 'lines' && s.line) q.set('line', s.line.id);
  if (s.tab === 'station' && s.station) q.set('station', primaryCode(s.station));
  const search = q.toString() ? `?${q}` : '';
  if (search === location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', search || location.pathname);
}

export default function App() {
  const [state, setState] = useState<State>(readUrl);
  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  // The first write only normalises the URL we loaded with (e.g. SP3 -> AG3),
  // so it replaces the history entry instead of adding one.
  const firstWrite = useRef(true);
  useEffect(() => {
    writeUrl(state, firstWrite.current);
    firstWrite.current = false;
  }, [state]);
  useEffect(() => {
    const onPop = () => setState(readUrl());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.tab, state.line, state.station]);

  const openStation = (station: Station) => update({ tab: 'station', station });

  return (
    <div className="app">
      <header className="header">
        <div className="header__inner">
          <div className="brand">
            <span className="brand__logo" aria-hidden>
              <svg viewBox="0 0 32 32" width="32" height="32">
                <rect width="32" height="32" rx="8" fill="currentColor" />
                <circle cx="16" cy="16" r="7" fill="none" stroke="#FF2261" strokeWidth="4" />
              </svg>
            </span>
            <div>
              <h1 className="brand__title">KV Transit Navigator</h1>
              <p className="brand__sub">Klang Valley rail &amp; BRT network</p>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab${state.tab === t.id ? ' is-active' : ''}`}
                aria-current={state.tab === t.id ? 'page' : undefined}
                onClick={() => update({ tab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {state.tab === 'plan' && (
          <RoutePlanner
            from={state.from}
            to={state.to}
            options={state.options}
            onChange={(from, to) => update({ from, to })}
            onOptions={(options) => update({ options })}
            onOpenStation={openStation}
          />
        )}
        {state.tab === 'lines' && (
          <LineExplorer selected={state.line} onSelect={(line) => update({ line })} onOpenStation={openStation} />
        )}
        {state.tab === 'station' && (
          <StationLookup
            station={state.station}
            onSelect={(station) => update({ station })}
            onPlan={(s, as) => update({ tab: 'plan', [as]: s })}
          />
        )}
      </main>

      <footer className="footer">
        Network data transcribed from the <em>Klang Valley Transit System Map</em> designed by{' '}
        <strong>@ziqtofu</strong>. Unofficial – check Rapid KL / KTMB for live service information.
      </footer>
    </div>
  );
}
