import { network, type LineDef, type Station } from '../lib/network';
import type { Mode } from '../data/network';
import { CodePill, LineBadge, StatusTag } from './Badges';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'KTM', label: 'KTM · Keretapi Tanah Melayu' },
  { mode: 'LRT', label: 'LRT · Light Rapid Transit' },
  { mode: 'MRT', label: 'MRT · Mass Rapid Transit' },
  { mode: 'KLIA', label: 'KLIA' },
  { mode: 'Monorail', label: 'Monorail' },
  { mode: 'BRT', label: 'BRT · Bus Rapid Transit' },
];

interface Props {
  selected: LineDef | null;
  onSelect: (line: LineDef | null) => void;
  onOpenStation: (s: Station) => void;
}

export function LineExplorer({ selected, onSelect, onOpenStation }: Props) {
  if (selected) return <LineDetail line={selected} onBack={() => onSelect(null)} onOpenStation={onOpenStation} />;

  return (
    <section className="panel" aria-labelledby="lines-title">
      <h2 id="lines-title" className="panel__title">Lines</h2>
      {MODES.map(({ mode, label }) => (
        <div key={mode} className="mode-group">
          <h3 className="mode-group__title">{label}</h3>
          <div className="line-grid">
            {network.lines
              .filter((l) => l.mode === mode)
              .map((line) => {
                const stops = network.stopsByLine.get(line.id)!;
                const open = stops.filter((s) => s.status === 'open').length;
                return (
                  <button
                    key={line.id}
                    type="button"
                    className="line-card"
                    style={{ '--line': line.color } as React.CSSProperties}
                    onClick={() => onSelect(line)}
                  >
                    <LineBadge line={line} />
                    <span className="line-card__text">
                      <span className="line-card__name">
                        {line.name} <StatusTag status={line.status} />
                      </span>
                      <span className="line-card__meta">
                        {line.nameMs !== line.name && <>{line.nameMs} · </>}
                        {line.loop ? 'Loop' : `${stops[0].name} – ${stops[stops.length - 1].name}`} · {open} stations
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}

function LineDetail({ line, onBack, onOpenStation }: { line: LineDef; onBack: () => void; onOpenStation: (s: Station) => void }) {
  const stops = network.stopsByLine.get(line.id)!;
  return (
    <section className="panel" aria-labelledby="line-title" style={{ '--line': line.color } as React.CSSProperties}>
      <button type="button" className="back" onClick={onBack}>← All lines</button>
      <div className="line-detail__head">
        <LineBadge line={line} />
        <div>
          <h2 id="line-title" className="panel__title">
            {line.name} <StatusTag status={line.status} />
          </h2>
          <p className="muted">{line.nameMs} · {line.mode}</p>
        </div>
      </div>
      {line.note && <p className="notice">{line.note}</p>}
      <ol className={`stop-list${line.loop ? ' stop-list--loop' : ''}`}>
        {stops.map((stop) => {
          const st = network.stations.get(stop.stationId)!;
          const others = st.stops.filter((s) => s.lineId !== line.id);
          const walks = st.connections.flatMap((id) => network.stations.get(id)!.stops);
          return (
            <li key={stop.code} className={`stop${stop.status !== 'open' ? ' stop--muted' : ''}`}>
              <span className="stop__dot" aria-hidden />
              <button type="button" className="stop__main" onClick={() => onOpenStation(st)}>
                <CodePill stop={stop} />
                <span className="stop__name">{stop.name}</span>
                <StatusTag status={stop.status} />
              </button>
              {(others.length > 0 || walks.length > 0) && (
                <span className="stop__transfers">
                  {others.map((s) => <CodePill key={s.code} stop={s} />)}
                  {walks.length > 0 && (
                    <span className="walk" title="Connecting station (walk)">
                      🚶{walks.map((s) => <CodePill key={s.code} stop={s} />)}
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {line.loop && <p className="muted">↻ The line continues from {stops[stops.length - 1].name} back to {stops[0].name}.</p>}
    </section>
  );
}
