import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { withZones, zonePct, zoneRect, type ZoneLayout } from '../board-layout/index.ts';

test('K427 traced zones JSON is a ZoneLayout that withZones merges into the game layout', () => {
  const traced = JSON.parse(readFileSync(new URL('tests/zones.fixture.json', import.meta.url), 'utf8')) as ZoneLayout;
  const base: ZoneLayout = { w: 1, h: 1, zones: { a: { r: [0, 0, 0.5, 0.5] }, hud: { r: [0, 0.9, 1, 0.1] } } };
  const L = withZones(base, Object.fromEntries(Object.entries(traced.zones).map(([k, z]) => [k, z.r])));
  expect(zoneRect(L, 'a')).toEqual([0.1429, 0.1905, 0.0857, 0.1429]);
  expect(zoneRect(L, 'hud')).toEqual([0, 0.9, 1, 0.1]);
  expect(Object.keys(L.zones)).toHaveLength(8);
  expect(zonePct(L, 'g').left).toBe('4.29%');
});
