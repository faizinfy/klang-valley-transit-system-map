import { network, stationLines, type Station } from '../lib/network';
import { CodePill, LineBadge, StatusTag } from './Badges';
import { StationPicker } from './StationPicker';

interface Props {
  station: Station | null;
  onSelect: (s: Station | null) => void;
  onPlan: (s: Station, as: 'from' | 'to') => void;
}

export function StationLookup({ station, onSelect, onPlan }: Props) {
  return (
    <section className="panel" aria-labelledby="station-title">
      <h2 id="station-title" className="panel__title">Find a station</h2>
      <StationPicker label="Station" value={station} onChange={onSelect} />
      {station && <StationDetail station={station} onSelect={onSelect} onPlan={onPlan} />}
    </section>
  );
}

function StationDetail({ station, onSelect, onPlan }: { station: Station; onSelect: (s: Station) => void; onPlan: Props['onPlan'] }) {
  const lines = stationLines(network, station);
  const connections = station.connections.map((id) => network.stations.get(id)!);
  const kind = station.stops.length > 1 ? 'Interchange station' : connections.length ? 'Connecting station' : 'Station';

  return (
    <div className="station">
      <h3 className="station__name">
        {station.name} {station.airport && <span title="Airport terminal">✈️</span>}
      </h3>
      <p className="muted">{kind}</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => onPlan(station, 'from')}>Plan from here</button>
        <button type="button" className="btn" onClick={() => onPlan(station, 'to')}>Plan to here</button>
      </div>

      <h4 className="station__sub">Lines</h4>
      <ul className="station__lines">
        {lines.map((line) => {
          const stop = station.stops.find((s) => s.lineId === line.id)!;
          const stops = network.stopsByLine.get(line.id)!;
          const neighbour = (d: number) => {
            for (let i = stop.index + d; i >= 0 && i < stops.length; i += d) {
              if (stops[i].status !== 'provisional') return stops[i];
            }
            return line.loop ? stops[d > 0 ? 0 : stops.length - 1] : null;
          };
          const prev = neighbour(-1), next = neighbour(1);
          return (
            <li key={line.id} className="station__line" style={{ '--line': line.color } as React.CSSProperties}>
              <div className="station__line-head">
                <LineBadge line={line} />
                <CodePill stop={stop} />
                <span>{line.name}</span>
                <StatusTag status={line.status === 'open' ? stop.status : line.status} />
              </div>
              <div className="neighbours">
                <span>{prev ? <button type="button" className="link" onClick={() => onSelect(network.stations.get(prev.stationId)!)}>← {prev.name}</button> : <span className="muted">Terminus</span>}</span>
                <span>{next ? <button type="button" className="link" onClick={() => onSelect(network.stations.get(next.stationId)!)}>{next.name} →</button> : <span className="muted">Terminus</span>}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {connections.length > 0 && (
        <>
          <h4 className="station__sub">Walk to</h4>
          <ul className="station__walks">
            {connections.map((c) => (
              <li key={c.id}>
                <button type="button" className="link" onClick={() => onSelect(c)}>🚶 {c.name}</button>{' '}
                <span className="pills">{c.stops.map((s) => <CodePill key={s.code} stop={s} />)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
