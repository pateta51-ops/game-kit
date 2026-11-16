import { describe, expect, it } from 'vitest';
import { slots, withZones, zone, zonePct, zoneRect, zonesOf, type ZoneLayout } from './index.ts';

const L: ZoneLayout = { w: 1000, h: 500, zones: { box: { r: [100, 50, 400, 200] }, 'box.2': { r: [150, 100, 100, 50] }, 'box.10': { r: [0, 0, 1, 1] }, 'box.1': { r: [0, 0, 1, 1] }, 'box.1.text': { r: [0, 0, 1, 1] }, boxx: { r: [0, 0, 1, 1] } } };

describe('zones (K28)', () => {
  it('places a zone in stage pixels, padded', () => {
    expect(zone(L, 'box', 10)).toEqual({ position: 'absolute', left: 90, top: 40, width: 420, height: 220 });
    expect(zoneRect(L, 'missing')).toEqual([0, 0, 0, 0]);
  });
  it('places a zone as percent of the stage or of a parent zone', () => {
    expect(zonePct(L, 'box')).toEqual({ position: 'absolute', left: '10%', top: '10%', width: '40%', height: '40%' });
    expect(zonePct(L, 'box.2', 'box', 10)).toEqual({ position: 'absolute', left: '15%', top: '25%', width: '25%', height: '25%' });
  });
  it('lists a numbered family in number order', () => {
    expect(slots(L, 'box')).toEqual(['box.1', 'box.2', 'box.10']);
  });
  it('moves zones without touching the source', () => {
    const M = withZones(L, { box: [0, 0, 5, 5], extra: [1, 2, 3, 4] });
    expect(zoneRect(M, 'box')).toEqual([0, 0, 5, 5]);
    expect(zoneRect(M, 'extra')).toEqual([1, 2, 3, 4]);
    expect(zoneRect(L, 'box')).toEqual([100, 50, 400, 200]);
  });
  it('turns parsed board spaces into a zone layout', () => {
    expect(zonePct(zonesOf({ nodes: { A: [10, 10, 50, 50] } }, 100, 100), 'A').width).toBe('50%');
  });
});
