import { describe, expect, it } from 'vitest';
import { CONNECTIONS, LINES } from '../data/network';
import { findStation, network, searchStations } from './network';

describe('network data', () => {
  it('has unique stop codes', () => {
    const codes = LINES.flatMap((l) => l.stops.map(([c]) => c));
    const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it('has unique line ids and badges', () => {
    expect(new Set(LINES.map((l) => l.id)).size).toBe(LINES.length);
    expect(new Set(LINES.map((l) => l.badge)).size).toBe(LINES.length);
  });

  it('numbers stops in ascending order along each line', () => {
    const num = (code: string) => {
      const m = code.match(/^[A-Z]+(\d+)([A-Z]?)$/)!;
      return Number(m[1]) + (m[2] ? 0.5 : 0);
    };
    for (const line of LINES) {
      // Each code prefix (e.g. KC, KB) must run monotonically in one direction.
      const byPrefix = new Map<string, number[]>();
      for (const [code] of line.stops) {
        const prefix = code.match(/^[A-Z]+/)![0];
        byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), num(code)]);
      }
      for (const [prefix, nums] of byPrefix) {
        const asc = nums.every((n, i) => i === 0 || n > nums[i - 1]);
        const desc = nums.every((n, i) => i === 0 || n < nums[i - 1]);
        expect(asc || desc, `${line.id}/${prefix}: ${nums.join(',')}`).toBe(true);
      }
    }
  });

  it('only connects stations that exist', () => {
    for (const [a, b] of CONNECTIONS) {
      expect(network.stations.has(a), a).toBe(true);
      expect(network.stations.has(b), b).toBe(true);
    }
  });

  it('never puts two stops of the same line in one station', () => {
    for (const st of network.stations.values()) {
      const lines = st.stops.map((s) => s.lineId);
      expect(new Set(lines).size, st.id).toBe(lines.length);
    }
  });

  it('merges known interchanges', () => {
    const codes = (id: string) => network.stations.get(id)!.stops.map((s) => s.code).sort();
    expect(codes('kl-sentral')).toEqual(['KA1', 'KC1', 'KE1', 'KJ15', 'KS1', 'KT1']);
    expect(codes('titiwangsa')).toEqual(['AG3', 'CC9', 'MR11', 'PY17', 'SP3']);
    expect(codes('bandar-tasik-selatan')).toEqual(['KB4', 'KT2', 'SP15']);
  });

  it('keeps same-named but separate stations apart', () => {
    expect(findStation(network, 'KC6')!.id).not.toBe(findStation(network, 'SP2')!.id);
    expect(findStation(network, 'KB3')!.id).not.toBe(findStation(network, 'SP13')!.id);
  });

  it('searches by name and code', () => {
    expect(searchStations(network, 'kg16')[0].id).toBe('pasar-seni');
    expect(searchStations(network, 'klcc').map((s) => s.id)).toEqual(['klcc', 'persiaran-klcc']);
    expect(searchStations(network, 'sentral').length).toBeGreaterThan(3);
  });
});
