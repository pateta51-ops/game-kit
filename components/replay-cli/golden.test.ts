// golden.ts on the fake counter game: golden saves are recorded with a fixed date, checked byte for byte and re-recorded
// by --update-golden; games recorded on one checkout replay on another, hash by hash, content hashes blanked.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { restoreSave, type SaveFile } from '../engine-core/index';
import type { Counter } from '../engine-core/fake/counter';
import * as fake from './fake-golden';
import { blankContentHashes, checkGoldens, GOLDEN_SAVED_AT, goldenGameSpec, playGolden, recordGames, replayGames, run, type CrossGame, type GoldenModule, type GoldenSpec } from './golden';
import type { Io } from './replay';

type Mod = GoldenModule<Counter, { adds: number }>;
const mod: Mod = { simGame: fake.simGame, specs: fake.goldens };
const P = (p: string): string => resolve(p);
const DIR = P('/gold');
const at = (name: string): string => join(DIR, `${name}.json`);

function fakeIo(files: Record<string, string> = {}, modules: Record<string, unknown> = {}, failWrite = false) {
  const lines: string[] = [];
  const written: Record<string, string> = {};
  const io: Io = {
    out: (line) => lines.push(line),
    err: (line) => lines.push(`ERR ${line}`),
    read: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`no file ${path}`);
      return text;
    },
    write: (path, text) => {
      if (failWrite) throw new Error('disk full');
      written[path] = text;
      files[path] = text;
    },
    exists: (path) => files[path] !== undefined,
    list: (dir) =>
      Object.keys(files)
        .filter((f) => f.startsWith(dir))
        .map((f) => f.slice(dir.length + 1)),
    load: (path) => {
      const m = modules[path];
      return m === undefined ? Promise.reject(new Error('cannot find module')) : Promise.resolve(m);
    },
  };
  return { io, lines, written, files };
}

async function recorded(): Promise<Record<string, string>> {
  const f = fakeIo();
  await checkGoldens(mod, DIR, f.io, { update: true });
  return f.files;
}

describe('golden games', () => {
  it('--update-golden writes one save per game with the fixed date; the check then passes and a second update writes nothing', async () => {
    const f = fakeIo();
    expect(await checkGoldens(mod, DIR, f.io, { update: true })).toBe(0);
    expect(Object.keys(f.written).sort()).toEqual([at('g01-adds'), at('g02-draws-long')]);
    const save = JSON.parse(f.written[at('g02-draws-long')] as string) as SaveFile<Counter>;
    expect(save.savedAt).toBe(GOLDEN_SAVED_AT);
    expect(save.options).toEqual({ seed: 'golden-g02-draws-long' });
    expect(save.rules).toEqual({ target: 15 });
    expect(restoreSave(fake.simGame.rules, save, { cards: 6 }).ok).toBe(true);
    const again = fakeIo({ ...f.files });
    expect(await checkGoldens(mod, DIR, again.io)).toBe(0);
    expect(again.lines).toEqual(['2 golden games, 0 failed']);
    expect(await checkGoldens(mod, DIR, again.io, { update: true })).toBe(0);
    expect(again.written).toEqual({});
    const crlf = fakeIo(Object.fromEntries(Object.entries(f.files).map(([k, v]) => [k, v.replace(/\n/g, '\r\n')])));
    expect(await checkGoldens(mod, DIR, crlf.io)).toBe(0);
  });

  it('fails (exit 1) on a missing file, a changed engine, a changed driver, a broken file and a file with no game', async () => {
    const files = await recorded();
    const missing = fakeIo({ [at('g01-adds')]: files[at('g01-adds')] as string });
    expect(await checkGoldens(mod, DIR, missing.io)).toBe(1);
    expect(missing.lines).toEqual(['FAIL g02-draws-long: no golden file (record it with --update-golden)', '2 golden games, 1 failed']);
    expect(await checkGoldens(mod, DIR, missing.io, { only: 'g01' })).toBe(0);
    const engine = fakeIo({ ...files });
    expect(await checkGoldens({ ...mod, simGame: { ...fake.simGame, content: () => ({ cards: 7 }) } }, DIR, engine.io)).toBe(1);
    expect(engine.lines[0]).toMatch(/^FAIL g01-adds: the stored game does not replay \(/);
    const driver = fakeIo({ ...files });
    const specs: GoldenSpec[] = [{ name: 'g01-adds', driver: 'draws' }, fake.goldens[1] as GoldenSpec];
    expect(await checkGoldens({ ...mod, specs }, DIR, driver.io)).toBe(1);
    expect(driver.lines).toHaveLength(2);
    expect(driver.lines[0]).toMatch(/^FAIL g01-adds: the stored game replays, the driver now plays another; first difference at action 0: stored \{.*"add".*\}, now \{.*"draw".*\}$/);
    const whole = JSON.parse(files[at('g01-adds')] as string) as SaveFile<Counter>;
    const n = whole.actions.length;
    const shorter = fakeIo({ ...files, [at('g01-adds')]: JSON.stringify({ ...whole, actions: whole.actions.slice(0, n - 1) }) });
    expect(await checkGoldens(mod, DIR, shorter.io)).toBe(1);
    expect(shorter.lines[0]).toMatch(new RegExp(`^FAIL g01-adds: the stored game does not replay \\(.*\\); first difference at action ${String(n - 1)}: stored the game ended, now \\{.*"add".*\\}$`));
    const longer = fakeIo({ ...files, [at('g01-adds')]: JSON.stringify({ ...whole, actions: [...whole.actions, whole.actions[0]] }) });
    expect(await checkGoldens(mod, DIR, longer.io)).toBe(1);
    expect(longer.lines[0]).toMatch(new RegExp(`first difference at action ${String(n)}: stored \\{.*\\}, now the game ended$`));
    const sealed = fakeIo({ ...files, [at('g01-adds')]: JSON.stringify({ ...whole, finalHash: 'x' }) });
    expect(await checkGoldens(mod, DIR, sealed.io)).toBe(1);
    expect(sealed.lines[0]).toMatch(/; the actions are the same, the options, the rules, the content or the final hash differ$/);
    const stale = fakeIo({ ...files, [at('g09-gone')]: '{}', [join(DIR, 'notes.txt')]: 'x' });
    expect(await checkGoldens(mod, DIR, stale.io)).toBe(1);
    expect(stale.lines[0]).toBe('FAIL g09-gone.json: no golden game of that name');
    const broken = fakeIo({ ...files, [at('g01-adds')]: '{' });
    expect(await checkGoldens(mod, DIR, broken.io)).toBe(1);
    expect(broken.lines[0]).toMatch(/^FAIL g01-adds: not JSON/);
  });

  it('a game that does not end, a failing write and an empty list', async () => {
    const endless = fakeIo();
    expect(await checkGoldens({ ...mod, simGame: { ...fake.simGame, maxActions: 2 } }, DIR, endless.io, { update: true })).toBe(1);
    expect(endless.lines[0]).toBe('FAIL g01-adds: no result after 2 actions');
    expect(endless.written).toEqual({});
    const full = fakeIo({}, {}, true);
    expect(await checkGoldens(mod, DIR, full.io, { update: true })).toBe(1);
    expect(full.lines[0]).toBe('FAIL g01-adds: disk full');
    const none = fakeIo();
    expect(await checkGoldens({ ...mod, specs: [] }, DIR, none.io)).toBe(0);
    expect(none.lines).toEqual(['0 golden games, 0 failed']);
  });
});

describe('record on one checkout, replay on another', () => {
  const REC = P('/rec.json');
  const record = async (opts: { only?: string | null; seedx?: string; cap?: number } = {}): Promise<{ text: string; games: CrossGame[] }> => {
    const f = fakeIo();
    expect(await recordGames(mod, REC, f.io, opts)).toBe(0);
    const text = f.written[REC] as string;
    return { text, games: (JSON.parse(text) as { games: CrossGame[] }).games };
  };
  const replayOf = async (games: CrossGame[], m: Mod = mod, only: string | null = null) => {
    const f = fakeIo({ [REC]: JSON.stringify({ games }) });
    return { code: await replayGames(m, REC, f.io, { only }), lines: f.lines };
  };

  it('records a state hash and an event hash per action, the options as given; the same engine replays them (exit 0)', async () => {
    const { text, games } = await record();
    expect(games.map((x) => x.name)).toEqual(['g01-adds', 'g02-draws-long']);
    for (const x of games) {
      expect(x.hashes).toHaveLength(x.actions.length + 1);
      expect(x.events).toHaveLength(x.actions.length + 1);
      expect(x.stopped).toBeUndefined();
    }
    expect(games[1]).toMatchObject({ options: { seed: 'golden-g02-draws-long' }, rules: { target: 15 }, spec: { index: 1, driver: 'draws' } });
    const f = fakeIo({ [REC]: text });
    expect(await replayGames(mod, REC, f.io)).toBe(0);
    expect(f.lines).toEqual(['2 games, 0 differ']);
  });

  it('names the first action after which the state or the events differ, or that is refused (exit 1)', async () => {
    const { games } = await record();
    const [a, b] = games as [CrossGame, CrossGame];
    const state = await replayOf([{ ...a, hashes: a.hashes.map((h, i) => (i >= 2 ? 'x' : h)) }, b]);
    expect(state).toEqual({ code: 1, lines: ['DIFF g01-adds: state after action 2', '2 games, 1 differ'] });
    const events = await replayOf([a, { ...b, events: b.events.map((h, i) => (i === 1 ? 'x' : h)) }]);
    expect(events.lines[0]).toBe('DIFF g02-draws-long: events of action 1');
    const refused = await replayOf([{ ...a, actions: a.actions.map((x, i) => (i === 1 ? { ...(x as object), picks: ['nonsense'] } : x)) }]);
    expect(refused.lines[0]).toMatch(/^DIFF g01-adds: action 2 refused: /);
    const other = await replayOf(games, { ...mod, simGame: { ...fake.simGame, content: () => ({ cards: 7 }) } });
    expect(other).toEqual({ code: 1, lines: ['DIFF g01-adds: state after action 0', 'DIFF g02-draws-long: state after action 0', '2 games, 2 differ'] });
    expect((await replayOf([{ ...a, hashes: [] }, b], mod, 'g02')).lines).toEqual(['1 games, 0 differ']);
    expect((await replayOf([{ ...a, options: {} }])).lines[0]).toMatch(/^DIFF g01-adds: /);
  });

  it('--seedx plays other games, --cap stops a game early and it still replays, --only picks by name', async () => {
    const plain = await record({ only: 'g01' });
    const x = await record({ only: 'g01', seedx: '-b' });
    expect(plain.games).toHaveLength(1);
    expect((x.games[0] as CrossGame).spec.seed).toBe('golden-g01-adds-b');
    expect((x.games[0] as CrossGame).hashes[0]).not.toBe((plain.games[0] as CrossGame).hashes[0]);
    const capped = await record({ cap: 2 });
    expect(capped.games[0]).toMatchObject({ stopped: 'no result after 2 actions' });
    expect((capped.games[0] as CrossGame).actions).toHaveLength(2);
    expect((await replayOf(capped.games)).code).toBe(0);
  });

  it('a driver that throws stops its game there; a start that throws skips it', async () => {
    const thrower: Mod['simGame'] = {
      ...fake.simGame,
      driver: () => ({
        name: 't',
        reasons: () => [],
        choose: () => {
          throw new Error('no idea');
        },
      }),
    };
    expect(playGolden(thrower, { cards: 6 }, goldenGameSpec({ name: 'n', driver: 't' }))).toMatchObject({ actions: [], stopped: 'stopped at action 0: no idea' });
    const f = fakeIo();
    expect(await recordGames({ ...mod, specs: [{ name: 'bad', driver: 'adds', seed: 'boom' }, ...fake.goldens] }, REC, f.io)).toBe(1);
    expect(f.lines[0]).toBe('FAILED bad: boom');
    expect(f.lines[f.lines.length - 1]).toBe(`recorded 3 games in ${REC} (0 stopped, 1 failed)`);
    const games = (JSON.parse(f.written[REC] as string) as { count: number; games: CrossGame[] }).games;
    expect(games[0]).toMatchObject({ name: 'bad', failed: 'boom' });
    expect(await replayOf(games)).toEqual({ code: 1, lines: ['DIFF bad: was not recorded: boom', '3 games, 1 differ'] });
    const t = fakeIo();
    const tmod: Mod = { ...mod, simGame: thrower };
    expect(await recordGames(tmod, REC, t.io)).toBe(1);
    expect(t.lines[0]).toBe('STOPPED g01-adds: 0 actions, stopped at action 0: no idea');
    expect(t.lines[2]).toBe(`recorded 2 games in ${REC} (2 stopped, 0 failed)`);
    const stopped = (JSON.parse(t.written[REC] as string) as { games: CrossGame[] }).games;
    expect((await replayOf(stopped, tmod)).code).toBe(0);
    expect((await replayOf(stopped)).lines[0]).toBe('DIFF g01-adds: stop: recorded stopped at action 0: no idea, now the game goes on');
  });

  it('a record cut short fails: missing hashes, actions removed from the end, games removed, another stop reason', async () => {
    const { games } = await record();
    const [a, b] = games as [CrossGame, CrossGame];
    const n = a.actions.length;
    const cut = await replayOf([{ ...a, hashes: a.hashes.slice(0, n), events: a.events.slice(0, n) }, b]);
    expect(cut).toEqual({ code: 1, lines: [`DIFF g01-adds: the record is cut short (${String(n)} actions, ${String(n)} state hashes, ${String(n)} event hashes)`, '2 games, 1 differ'] });
    const fewer = await replayOf([{ ...a, actions: a.actions.slice(0, n - 1), hashes: a.hashes.slice(0, n), events: a.events.slice(0, n) }]);
    expect(fewer).toEqual({ code: 1, lines: ['DIFF g01-adds: stop: recorded the game ended, now the game goes on', '1 games, 1 differ'] });
    expect((await replayOf([{ ...a, hashes: undefined } as unknown as CrossGame])).code).toBe(1);
    const lost = fakeIo({ [REC]: JSON.stringify({ count: 2, games: [a] }) });
    expect(await replayGames(mod, REC, lost.io)).toBe(1);
    expect(lost.lines).toEqual(['DIFF the record holds 1 of 2 games', '1 games, 1 differ']);
    const capped = (await record({ cap: 2 })).games[0] as CrossGame;
    expect((await replayOf([{ ...capped, stopped: 'stopped at action 2: no idea' }])).lines[0]).toBe('DIFF g01-adds: stop: recorded stopped at action 2: no idea, now the game goes on');
    const { stopped: _s, ...unmarked } = capped;
    expect((await replayOf([unmarked])).lines[0]).toBe('DIFF g01-adds: stop: recorded the game ended, now the game goes on');
    expect((await replayOf(games, mod, 'zz')).code).toBe(2);
  });

  it('refuses an empty list, a failing write and a file that is not a record (exit 2)', async () => {
    expect(await recordGames({ ...mod, specs: [] }, REC, fakeIo().io)).toBe(2);
    expect(await recordGames(mod, REC, fakeIo({}, {}, true).io)).toBe(2);
    expect(await replayGames(mod, REC, fakeIo().io)).toBe(2);
    expect(await replayGames(mod, REC, fakeIo({ [REC]: 'nope' }).io)).toBe(2);
    expect(await replayGames(mod, REC, fakeIo({ [REC]: '{"games":3}' }).io)).toBe(2);
    expect(await replayGames(mod, REC, fakeIo({ [REC]: 'null' }).io)).toBe(2);
    const empty = fakeIo({ [REC]: '{"games":[]}' });
    expect(await replayGames(mod, REC, empty.io)).toBe(0);
    expect(empty.lines).toEqual(['0 games, 0 differ']);
  });

  it('blanks every content hash, nested escaped JSON included, and nothing else', () => {
    const inner = JSON.stringify({ contentHash: 'w1', z: 2 });
    const v = { contentHash: 'ab,c}9', n: { contentHash: 'zz', keep: 'contentHash' }, k: JSON.stringify({ contentHash: 'q1', inner }) };
    const out = JSON.parse(blankContentHashes(JSON.stringify(v))) as typeof v;
    expect(out.contentHash).toBe('');
    expect(out.n).toEqual({ contentHash: '', keep: 'contentHash' });
    const k = JSON.parse(out.k) as { contentHash: string; inner: string };
    expect(k.contentHash).toBe('');
    expect(JSON.parse(k.inner)).toEqual({ contentHash: '', z: 2 });
    expect(blankContentHashes('{}')).toBe('{}');
  });
});

describe('golden.ts command line', () => {
  const M = P('m.ts');
  const mods = { [M]: fake };

  it('runs the three modes on a loaded module; --games names another list', async () => {
    const f = fakeIo({}, mods);
    expect(await run(['check', '/gold', '--game', 'm.ts', '--update-golden'], f.io)).toBe(0);
    expect(await run(['check', '/gold', '--game', 'm.ts'], f.io)).toBe(0);
    expect(await run(['record', '/rec.json', '--game', 'm.ts', '--games', 'few', '--cap', '3'], f.io)).toBe(0);
    expect((JSON.parse(f.written[P('/rec.json')] as string) as { games: CrossGame[] }).games).toMatchObject([{ name: 'f01', spec: { seed: 'few' } }]);
    expect(await run(['replay', '/rec.json', '--game', 'm.ts', '--only', 'f'], f.io)).toBe(0);
  });

  it('refuses bad usage and a module without a simGame or the list (exit 2)', async () => {
    for (const args of [[], ['check'], ['check', '/gold'], ['play', '/gold', '--game', 'm.ts'], ['check', '/gold', '--game'], ['check', '/gold', '--game', 'm.ts', '--fast'], ['record', '/r.json', '--game', 'm.ts', '--cap', '0'], ['check', '/a', '/b', '--game', 'm.ts'], ['record', '/r.json', '--game', 'm.ts', '--update-golden'], ['replay', '/r.json', '--game', 'm.ts', '--update-golden'], ['check', '/gold', '--game', 'm.ts', '--cap', '3'], ['replay', '/r.json', '--game', 'm.ts', '--cap', '3']]) {
      expect(await run(args, fakeIo({}, mods).io), args.join(' ')).toBe(2);
    }
    expect(await run(['check', '/gold', '--game', 'none.ts'], fakeIo({}, mods).io)).toBe(2);
    expect(await run(['check', '/gold', '--game', 'm.ts', '--games', 'nope'], fakeIo({}, mods).io)).toBe(2);
    expect(await run(['check', '/gold', '--game', 'm.ts'], fakeIo({}, { [M]: { goldens: [] } }).io)).toBe(2);
    const boom = { ...fake, simGame: { ...fake.simGame, content: () => Promise.reject(new Error('no content')) } };
    expect(await run(['check', '/gold', '--game', 'm.ts'], fakeIo({}, { [M]: boom }).io)).toBe(2);
  });

  it('the real command line records the goldens, checks them and replays a record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'golden-cli-'));
    try {
      const cli = (...args: string[]) =>
        spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./golden.ts', import.meta.url)), ...args, '--game', fileURLToPath(new URL('./fake-golden.ts', import.meta.url))], { encoding: 'utf8', timeout: 50_000 });
      expect(cli('check', join(dir, 'gold')).status).toBe(1);
      const up = cli('check', join(dir, 'gold'), '--update-golden');
      expect(up.status, up.stderr).toBe(0);
      expect(existsSync(join(dir, 'gold', 'g01-adds.json'))).toBe(true);
      expect(cli('check', join(dir, 'gold')).stdout).toContain('2 golden games, 0 failed');
      expect(cli('record', join(dir, 'rec.json')).status).toBe(0);
      expect(cli('replay', join(dir, 'rec.json')).stdout).toContain('2 games, 0 differ');
      const rec = JSON.parse(readFileSync(join(dir, 'rec.json'), 'utf8')) as { games: CrossGame[] };
      writeFileSync(join(dir, 'bad.json'), JSON.stringify({ games: rec.games.map((x) => ({ ...x, hashes: x.hashes.map((h, i) => (i === 1 ? 'x' : h)) })) }));
      const bad = cli('replay', join(dir, 'bad.json'));
      expect(bad.status).toBe(1);
      expect(bad.stdout).toContain('DIFF g01-adds: state after action 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
