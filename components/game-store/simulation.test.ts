import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CONTENT, type Counter } from '../engine-core/fake/counter.ts';
import { bySeat, openCheckpoint, playOne, randomDriver, runGames, runResumable } from '../sim-pool/index.ts';
import { definition, noOpponent } from './simulation.cli.fixture.ts';
import { simGameOf } from './sim.ts';

const module = new URL('./simulation.cli.fixture.ts', import.meta.url);
const run = (driver: string) => spawnSync(process.execPath, [
  fileURLToPath(module), '--games', '2', '--workers', '2', '--driver', driver,
], { encoding: 'utf8' });

it.each(['gredey', '', 'constructor'])('rejects unregistered CLI driver %j before play', (driver) => {
  const result = run(driver);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stdout).toMatch(/available.*custom.*legacy.*opponent.*random/i);
  expect(result.stdout).not.toMatch(/actions checked/);
});

it.each([['random', 'random'], ['opponent', 'opponent'], ['custom', 'weighted'], ['legacy', 'weighted']])(
  'runs registered %s and records the resolved driver %s',
  async (driver, resolvedDriver) => {
    const specs = Array.from({ length: 2 }, (_, index) => ({ index, seed: `registered-${String(index)}`, driver }));
    for (const record of await runGames({ module: module.href, specs }, 2)) {
      expect(record).toMatchObject({ driver, resolvedDriver });
      expect(record.error).toBeUndefined();
      expect(record.result).not.toBeNull();
    }
    expect(run(driver).status).toBe(0);
  },
);

it('rejects an unavailable opponent and refuses a mixed batch before any setup', async () => {
  const spec = { index: 0, seed: 'never-setup-0', driver: 'opponent' };
  expect(playOne(noOpponent, CONTENT, spec).error).toMatch(/opponent.*available.*random/i);
  const records: unknown[] = [];
  const played = (record: unknown) => { records.push(record); };
  for (const workers of [1, 2]) {
    await expect(runGames({
      module: module.href, specs: [{ ...spec, driver: 'random' }, { ...spec, index: 1, driver: 'gredey' }],
    }, workers, played)).rejects.toThrow(/gredey/);
  }
  expect(records).toEqual([]);
});

it('records the canonical registration when the aliased driver has an empty name', () => {
  const unnamed = bySeat<Counter>({}, randomDriver<Counter>());
  const game = simGameOf(definition, { drivers: { grouped: unnamed }, aliases: { legacy: 'grouped' } });
  expect(playOne(game, CONTENT, { index: 0, seed: 'grouped', driver: 'legacy' })).toMatchObject({
    driver: 'legacy', resolvedDriver: 'grouped',
  });
});

it('refuses to return historical successes for invalid registrations on resume', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'driver-preflight-'));
  try {
    const file = join(dir, 'resume.jsonl');
    const requested = { index: 0, seed: 'historical', driver: 'gredey' };
    openCheckpoint(file, 'compatible').append({ ...requested, actions: 3, hash: 'historical', result: { winner: 0 } });
    const original = readFileSync(file, 'utf8');
    const pending = [1, 2].map((index) => ({ index, seed: `pending-${String(index)}`, driver: 'random' }));
    for (const specs of [[requested], [requested, ...pending]]) {
      await expect(runResumable({ module: module.href, specs }, 2, file, 'compatible')).rejects.toThrow(/gredey/);
      expect(readFileSync(file, 'utf8')).toBe(original);
    }

    const cached = { ...requested, driver: 'random' };
    openCheckpoint(file, 'compatible').append({ ...cached, actions: 3, hash: 'historical', result: { winner: 0 } });
    const beforeValidation = readFileSync(file, 'utf8');
    await expect(runResumable({ module: module.href, specs: [cached], view: true }, 2, file, 'compatible'))
      .rejects.toThrow(/checkpoint lacks executed view checks/);
    expect(readFileSync(file, 'utf8')).toBe(beforeValidation);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
