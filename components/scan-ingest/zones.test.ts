import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// board-layout's ZoneLayout and withZones, copied so scan-ingest needs no board-layout (a game merges with the real one)
type ZoneLayout = { w: number; h: number; zones: Record<string, { r: readonly number[] }> };
const withZones = <T extends ZoneLayout>(L: T, z: Record<string, readonly number[]>): T => ({ ...L, zones: { ...L.zones, ...Object.fromEntries(Object.entries(z).map(([k, r]) => [k, { r }])) } });

test('K427 traced zones JSON is a ZoneLayout that withZones merges into the game layout', () => {
  const traced = JSON.parse(readFileSync(new URL('tests/zones.fixture.json', import.meta.url), 'utf8')) as ZoneLayout;
  const base: ZoneLayout = { w: 1, h: 1, zones: { a: { r: [0, 0, 0.5, 0.5] }, hud: { r: [0, 0.9, 1, 0.1] } } };
  const L = withZones(base, Object.fromEntries(Object.entries(traced.zones).map(([k, z]) => [k, z.r])));
  expect(L.zones.a?.r).toEqual([0.1429, 0.1905, 0.0857, 0.1429]);
  expect(L.zones.hud?.r).toEqual([0, 0.9, 1, 0.1]);
  expect(Object.keys(L.zones)).toHaveLength(10);
  for (const z of Object.values(traced.zones)) expect(z.r).toHaveLength(4);
});
