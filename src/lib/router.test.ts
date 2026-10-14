import { describe, expect, it } from 'vitest';
import { findStation, network } from './network';
import { findRoute, type RideLeg } from './router';

const route = (a: string, b: string, opts?: Parameters<typeof findRoute>[3]) =>
  findRoute(network, findStation(network, a)!.id, findStation(network, b)!.id, opts);
const lines = (r: ReturnType<typeof route>) =>
  r!.legs.filter((l): l is RideLeg => l.kind === 'ride').map((l) => l.lineId);

describe('findRoute', () => {
  it('rides a single line when possible', () => {
    const r = route('KJ1', 'KJ24')!;
    expect(lines(r)).toEqual(['KJ']);
    expect(r.stops).toBe(23);
    expect(r.transfers).toBe(0);
  });

  it('changes lines at an interchange', () => {
    const r = route('KJ24', 'KG26')!; // Kelana Jaya -> Taman Connaught
    expect(lines(r)).toEqual(['KJ', 'KG']);
    expect(r.legs[1]).toMatchObject({ kind: 'transfer', type: 'interchange' });
  });

  it('uses connecting walks', () => {
    const r = route('MR10', 'KJ10')!; // Chow Kit -> KLCC
    expect(r.legs.some((l) => l.kind === 'transfer' && l.type === 'connecting')).toBe(true);
  });

  it('reaches the airport from Gombak', () => {
    const r = route('KJ1', 'KE3')!;
    expect(lines(r).at(-1)).toMatch(/KE|KT/);
  });

  it('skips provisional stops but counts the ride through them', () => {
    const r = route('KB2', 'KB3')!; // Seputeh -> Salak Selatan, past KB2A
    expect(r.stops).toBe(1);
  });

  it('ignores the Circle Line unless planned lines are included', () => {
    const off = route('CC2', 'CC3');
    expect(off).toBeNull();
    const on = route('CC2', 'CC3', { includePlanned: true, includeSuspended: false })!;
    expect(lines(on)).toEqual(['CC']);
  });

  it('wraps around the Circle Line loop', () => {
    const r = route('CC33', 'CC2', { includePlanned: true, includeSuspended: false })!;
    expect(r.stops).toBe(2); // CC33 -> CC1 -> CC2
  });

  it('ignores the suspended Skypark Link by default', () => {
    expect(route('KJ15', 'KS3')).toBeNull();
    const r = route('KJ15', 'KS3', { includePlanned: false, includeSuspended: true })!;
    expect(lines(r)).toEqual(['KS']);
  });

  it('returns an empty route for the same station', () => {
    expect(route('KJ15', 'KA1')).toEqual({ legs: [], stops: 0, transfers: 0 });
  });

  it('links every open station to every other', () => {
    const ids = [...network.stations.values()]
      .filter((s) => s.stops.some((p) => p.status === 'open' && network.lineById.get(p.lineId)!.status === 'open'))
      .map((s) => s.id);
    const from = 'kl-sentral';
    const unreachable = ids.filter((id) => !findRoute(network, from, id));
    expect(unreachable).toEqual([]);
  });
});
