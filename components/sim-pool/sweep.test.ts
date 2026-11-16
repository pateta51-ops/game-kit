import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONTENT, type Counter } from '../engine-core/fake/counter.ts';
import { grid, playOne, runGames, spread, sweep, type GameSpec, type SimGame, type SimRecord } from './index.ts';
import { simGame } from './fake/game.ts';

const module = new URL('./fake/game.ts', import.meta.url).href;
const leaky = new URL('./fake/leaky.ts', import.meta.url).href;
const specs = (n: number): GameSpec[] => Array.from({ length: n }, (_, i) => ({ index: i, seed: `s${String(i)}`, driver: 'random' }));
const dir = mkdtempSync(path.join(tmpdir(), 'sim-sweep-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('a seed in a pool worker and alone', () => {
  it('plays the same game: after other games on a shared worker, on a worker of its own, and in this thread', async () => {
    const pool = await runGames({ module, specs: specs(12) }, 3);
    const alone = await runGames({ module, specs: specs(12), fresh: true }, 3);
    expect(alone).toEqual(pool);
    const one = specs(12).slice(7, 8);
    expect(await runGames({ module, specs: one, fresh: true }, 1)).toEqual([pool[7]]);
    expect(await runGames({ module, specs: one }, 1)).toEqual([pool[7]]);
    expect((await runGames({ module, specs: specs(12).reverse() }, 2)).map((r) => r.hash)).toEqual(pool.map((r) => r.hash));
  });

  it('`fresh` shows a game whose module keeps something between games', async () => {
    const pool = await runGames({ module: leaky, specs: specs(12) }, 2);
    const alone = await runGames({ module: leaky, specs: specs(12), fresh: true }, 2);
    expect(alone.map((r) => r.hash)).not.toEqual(pool.map((r) => r.hash));
    expect(await runGames({ module: leaky, specs: specs(12), fresh: true }, 3)).toEqual(alone);
  });
});

describe('the observation hook', () => {
  it('sees every open prompt before the driver answers, with a new observation per game, and hands it to the summary', () => {
    const game: SimGame<Counter, { prompts: number }, { prompts: number }> = {
      ...simGame,
      observation: () => ({ prompts: 0 }),
      onPrompt: (seen, state, answers) => {
        expect(state.prompt).not.toBeNull();
        expect(answers.length).toBeGreaterThan(0);
        seen.prompts += 1;
      },
      summary: (_s, _a, _c, seen) => ({ prompts: seen.prompts }),
    };
    for (const spec of specs(4)) {
      const r = playOne(game, CONTENT, spec);
      expect(r.actions).toBeGreaterThan(0);
      expect(r.summary?.prompts).toBe(r.actions);
    }
  });
});

describe('the grid sweep', () => {
  it('lists every combination of the axes, and the spread of a list', () => {
    expect(grid({ a: [1, 2], b: ['x', 'y'] })).toEqual([{ a: 1, b: 'x' }, { a: 1, b: 'y' }, { a: 2, b: 'x' }, { a: 2, b: 'y' }]);
    expect(spread([1, 2, 3])).toEqual({ mean: 2, sd: 1, se: 1 / Math.sqrt(3) });
    expect(spread([5])).toEqual({ mean: 5, sd: 0, se: 0 });
  });

  it('plays the same seeds in every cell, resumes, and writes a CSV row per cell with the spread', async () => {
    const out = path.join(dir, 'sweep.csv');
    const options = {
      module,
      cells: grid({ target: [4, 12] }),
      games: 6,
      driver: 'random',
      metrics: { adds: (r: SimRecord<{ adds: number }>) => r.summary?.adds ?? 0, actions: (r: SimRecord) => r.actions },
      workers: 2,
      file: path.join(dir, 'sweep.jsonl'),
      label: 'v1',
      out,
    };
    const a = await sweep<{ adds: number }>(options);
    expect(a.records.map((r) => [r.seed, r.settings?.['target']])).toEqual([4, 12].flatMap((t) => Array.from({ length: 6 }, (_, i) => [`sweep-${String(i)}`, t])));
    expect(a.cells.map((c) => [c.cell, c.games, c.failed])).toEqual([[{ target: 4 }, 6, 0], [{ target: 12 }, 6, 0]]);
    expect(a.cells[1]?.stats['actions']).toEqual(spread(a.records.slice(6).map((r) => r.actions)));
    expect((a.cells[1]?.stats['actions']?.mean ?? 0) > (a.cells[0]?.stats['actions']?.mean ?? 0)).toBe(true);
    const lines = readFileSync(out, 'utf8').trim().split('\n');
    expect(lines[0]).toBe('target,games,failed,adds,adds_sd,adds_se,actions,actions_sd,actions_se');
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith('4,6,0,')).toBe(true);
    expect(`${lines.join('\n')}\n`).toBe(a.csv);
    const played: SimRecord[] = [];
    const b = await sweep<{ adds: number }>({ ...options, onRecord: (r) => played.push(r) });
    expect(played).toHaveLength(0);
    expect(b.csv).toBe(a.csv);
  });

  it('counts a failed game and leaves it out of the spread', async () => {
    const b = await sweep({ module: new URL('./fake/broken.ts', import.meta.url).href, cells: [{ note: 'a,b' }], games: 2, driver: 'random', metrics: { actions: (r) => r.actions }, workers: 2, file: path.join(dir, 'broken.jsonl'), label: 'v1' });
    expect(b.cells[0]).toMatchObject({ games: 0, failed: 2 });
    expect(b.csv).toBe('note,games,failed,actions,actions_sd,actions_se\n"a,b",0,2,,,\n');
  });
});
