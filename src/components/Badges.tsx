import type { LineDef, Stop } from '../lib/network';
import { network } from '../lib/network';

/** Pick black or white text for legibility on a line colour. */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.3 ? '#111' : '#fff';
}

export function LineBadge({ line, size = 'md' }: { line: LineDef; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`line-badge line-badge--${size}`}
      style={{ background: line.color, color: textOn(line.color) }}
      title={line.name}
    >
      {line.badge}
    </span>
  );
}

export function CodePill({ stop }: { stop: Stop }) {
  const line = network.lineById.get(stop.lineId)!;
  return (
    <span
      className={`code-pill${stop.status !== 'open' || line.status !== 'open' ? ' code-pill--muted' : ''}`}
      style={{ background: line.color, color: textOn(line.color) }}
      title={`${line.name}${stop.status !== 'open' ? ` (${stop.status})` : ''}`}
    >
      {stop.code}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  if (status === 'open') return null;
  return <span className={`status-tag status-tag--${status}`}>{status}</span>;
}
