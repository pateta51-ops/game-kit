import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CONTENT } from '../engine-core/fake/counter.ts';
import { playOne, runGames } from '../sim-pool/index.ts';
import { noOpponent } from './simulation.cli.fixture.ts';

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
