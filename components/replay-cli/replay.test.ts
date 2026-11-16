// replay.ts on the fake counter game of engine-core: a save or a record replays headlessly; it fails (exit 1) when an
// action is refused, a per-action hash or the final hash differs, and refuses (exit 2) what is not a log, a missing file,
// an engine that does not load and bad usage. The recorded text format round-trips, one action per line.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSave, hashState } from '../engine-core/index.ts';
import { CONTENT, COUNTER, playGame, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { checkpointDiff, checkpointText, logText, parseLog, replayFile, run, type Checkpoint, type Io, type ReplayEngine, type ReplayLog } from './replay.ts';

const engine: ReplayEngine<Counter> = {
  game: COUNTER,
  content: () => CONTENT,
  describe: (s) => [`counter ${String(s.counter)}`],
};
const g = playGame('cli');
const save = createSave(COUNTER, { options: { seed: 'cli' }, rules: RULES, actions: g.actions, undoUsed: false, savedAt: 't' }, CONTENT);
const saveFile = JSON.stringify(save);
const P = (p: string): string => resolve(p);

function fakeIo(files: Record<string, string>, modules: Record<string, unknown> = {}): Io & { lines: string[]; written: Record<string, string> } {
  const lines: string[] = [];
  const written: Record<string, string> = {};
  const all: Record<string, string> = Object.fromEntries(Object.entries(files).map(([k, v]) => [P(k), v]));
  return {
    lines,
    written,
    out: (line) => lines.push(line),
    err: (line) => lines.push(`ERR ${line}`),
    read: (path) => {
      const text = all[path];
      if (text === undefined) throw new Error(`no file ${path}`);
      return text;
    },
    write: (path, text) => {
      written[path] = text;
    },
    exists: (path) => all[path] !== undefined,
    load: (path) => {
      const m = modules[path];
      return m === undefined ? Promise.reject(new Error('cannot find module')) : Promise.resolve(m);
    },
  };
}

describe('checkpoint goldens (K71)', () => {
  const cp: ReplayEngine<Counter> = { ...engine, checkpoint: (s, c, action) => (action === null ? 'start' : (s.turn + c.cards) % 2 === 0 ? `turn ${String(s.turn)}` : null) };
  const record = async (e: ReplayEngine<Counter>): Promise<string> => {
    const io = fakeIo({ '/g.json': saveFile });
    expect(await replayFile(P('/g.json'), e, io, null, { path: P('/cp.json'), update: true })).toBe(0);
    expect(io.lines.some((l) => l.startsWith('checkpoints: wrote '))).toBe(true);
    return io.written[P('/cp.json')] as string;
  };

  it('--update-golden writes one checkpoint per line; the same replay then matches (exit 0)', async () => {
    const text = await record(cp);
    const points = (JSON.parse(text) as { checkpoints: Checkpoint[] }).checkpoints;
    expect(points[0]).toMatchObject({ name: 'start', at: 0 });
    expect(points.length).toBeGreaterThan(1);
    expect(text.split('\n').length).toBe(points.length + 3);
    expect(checkpointText(points)).toBe(text);
    const io = fakeIo({ '/g.json': saveFile, '/cp.json': text });
    expect(await replayFile(P('/g.json'), cp, io, null, { path: P('/cp.json'), update: false })).toBe(0);
    expect(io.lines).toContain(`checkpoints: ${String(points.length)} match`);
    expect(io.written).toEqual({});
    expect(await run(['/g.json', '--engine', 'eng.ts', '--checkpoints', '/cp.json'], fakeIo({ '/g.json': saveFile, '/cp.json': text }, { 'eng.ts': { engine: cp } }))).toBe(0);
    const up = fakeIo({ '/g.json': saveFile }, { 'eng.ts': { engine: cp } });
    expect(await run(['/g.json', '--engine', 'eng.ts', '--checkpoints', '/cp.json', '--update-golden'], up)).toBe(0);
    expect(up.written[P('/cp.json')]).toBe(text);
  });

  it('a changed hash, a moved, missing or extra checkpoint, a missing or broken golden fail (exit 1), naming the first', async () => {
    const text = await record(cp);
    const points = (JSON.parse(text) as { checkpoints: Checkpoint[] }).checkpoints;
    const check = async (golden: string | null, e = cp): Promise<string[]> => {
      const io = fakeIo(golden === null ? { '/g.json': saveFile } : { '/g.json': saveFile, '/cp.json': golden });
      expect(await replayFile(P('/g.json'), e, io, null, { path: P('/cp.json'), update: false })).toBe(1);
      return io.lines.filter((l) => l.startsWith('CHECKPOINTS'));
    };
    const one = points[1] as Checkpoint;
    expect(await check(checkpointText(points.map((p, i) => (i === 1 ? { ...p, hash: 'beef' } : p))))).toEqual([
      `CHECKPOINTS checkpoint 1 "${one.name}" (after ${String(one.at)} actions): hash beef in the golden, ${one.hash} now`,
    ]);
    expect((await check(checkpointText(points.slice(0, 1))))[0]).toMatch(/checkpoint 1: the golden ends, the replay has/);
    expect((await check(checkpointText([...points, { name: 'late', at: 99, hash: 'x' }])))[0]).toMatch(/"late": the replay ends before it/);
    expect((await check(checkpointText(points.map((p, i) => (i === 1 ? { ...p, at: p.at + 1 } : p)))))[0]).toMatch(/checkpoint 1: golden ".*" after \d+ actions, replay/);
    expect((await check(null))[0]).toMatch(/no golden at .* \(record it with --update-golden\)/);
    expect((await check('nope'))[0]).toMatch(/the golden is not JSON/);
    expect((await check('{}'))[0]).toMatch(/the golden has no checkpoints/);
    expect((await check(text, { ...cp, project: (s) => ({ counter: s.counter }) }))[0]).toMatch(/checkpoint 0 "start"/);
    expect(checkpointDiff(points, points)).toBeNull();
  });

  it('`project` hashes the rule-visible part only; no `checkpoint` in the engine or --update-golden alone is refused (exit 2)', async () => {
    const projected: ReplayEngine<Counter> = { ...cp, project: (s) => ({ counter: s.counter }) };
    const a = await record(projected);
    expect(a).not.toBe(await record(cp));
    const io = fakeIo({ '/g.json': saveFile });
    expect(await replayFile(P('/g.json'), engine, io, null, { path: P('/cp.json'), update: false })).toBe(2);
    expect(await run(['/g.json', '--engine', 'eng.ts', '--update-golden'], fakeIo({ '/g.json': saveFile }, { 'eng.ts': { engine: cp } }))).toBe(2);
    const refused = fakeIo({ '/r.json': JSON.stringify({ ...save, actions: save.actions.map((x, i) => (i === 3 ? { ...x, picks: ['nonsense'] } : x)) }) });
    expect(await replayFile(P('/r.json'), cp, refused, null, { path: P('/cp.json'), update: true })).toBe(1);
    expect(refused.written).toEqual({});
  });
});

describe('replay.ts', () => {
  it('replays a save, reports a matching hash and prints the game lines; exit 0', async () => {
    const io = fakeIo({ '/g.json': saveFile });
    expect(await replayFile(P('/g.json'), engine, io)).toBe(0);
    expect(io.lines[0]).toBe(`${P('/g.json')}: ${String(g.actions.length)} actions, all applied`);
    expect(io.lines[1]).toMatch(/^result \{"kind":"(won|lost)"\}, state hash matches$/);
    expect(io.lines[2]).toBe(`counter ${String(g.state.counter)}`);
    expect(await run(['/g.json', '--engine', 'eng.ts'], fakeIo({ '/g.json': saveFile }, { 'eng.ts': { engine } }))).toBe(0);
  });

  it('a changed hash or a refused action fails the replay (exit 1); another content warns', async () => {
    const tampered = fakeIo({ '/t.json': JSON.stringify({ ...save, finalHash: '0000000000000000' }) });
    expect(await replayFile(P('/t.json'), engine, tampered)).toBe(1);
    expect(tampered.lines[1]).toContain('state hash DIFFERS');
    const flipped = fakeIo({ '/u.json': JSON.stringify({ ...save, undoUsed: true }) });
    expect(await replayFile(P('/u.json'), engine, flipped)).toBe(1);
    const actions = save.actions.map((a, i) => (i === 3 ? { ...a, picks: ['nonsense'] } : a));
    const refused = fakeIo({ '/r.json': JSON.stringify({ ...save, actions }) });
    expect(await replayFile(P('/r.json'), engine, refused)).toBe(1);
    expect(refused.lines[0]).toMatch(/failed at action 3: BAD_CHOICE/);
    const other = fakeIo({ '/o.json': JSON.stringify({ ...save, contentHash: 'ffffffffffffffff' }) });
    await replayFile(P('/o.json'), engine, other);
    expect(other.lines[0]).toMatch(/^warning: the log was made with content ffffffffffffffff/);
  });

  it('records per-action hashes, and a later replay names the first step that differs (from EBR)', async () => {
    const io = fakeIo({ '/g.json': saveFile });
    expect(await replayFile(P('/g.json'), engine, io, P('/rec.json'))).toBe(0);
    const text = io.written[P('/rec.json')] as string;
    const rec = JSON.parse(text) as Required<ReplayLog>;
    expect(rec.hashes).toHaveLength(g.actions.length + 1);
    expect(rec.events).toHaveLength(g.actions.length + 1);
    expect(rec.finalHash).toBe(hashState(g.state));
    expect(rec).not.toHaveProperty('undoUsed');
    expect(await replayFile(P('/rec.json'), engine, fakeIo({ '/rec.json': text }))).toBe(0);
    const hashes = rec.hashes.map((h, i) => (i === 4 ? 'x' : h));
    const diff = fakeIo({ '/d.json': JSON.stringify({ ...rec, hashes }) });
    expect(await replayFile(P('/d.json'), engine, diff)).toBe(1);
    expect(diff.lines).toContain('DIFF first difference after action 4');
    const ev = rec.events.map((h, i) => (i === 2 ? 'x' : h));
    const evDiff = fakeIo({ '/e.json': JSON.stringify({ ...rec, events: ev }) });
    expect(await replayFile(P('/e.json'), engine, evDiff)).toBe(1);
    expect(evDiff.lines).toContain('DIFF first difference after action 2');
    // the same game under other rules differs from the start
    const rules = fakeIo({ '/k.json': JSON.stringify({ ...rec, rules: { target: 99 } }) });
    expect(await replayFile(P('/k.json'), engine, rules)).toBe(1);
    expect(rules.lines).toContain('DIFF first difference after action 0');
  });

  it('--record refuses to write over the log it replays (exit 2)', async () => {
    const io = fakeIo({ '/g.json': saveFile });
    expect(await replayFile(P('/g.json'), engine, io, P('/g.json'))).toBe(2);
    expect(io.written).toEqual({});
    expect(io.lines[0]).toMatch(/would overwrite the log it replays/);
  });

  it('the real command line imports an engine module: a clean replay exits 0, a diverging log names the first action', () => {
    const dir = mkdtempSync(join(tmpdir(), 'replay-cli-'));
    try {
      const cli = (...args: string[]) =>
        spawnSync(process.execPath, [fileURLToPath(new URL('./replay.ts', import.meta.url)), ...args, '--engine', fileURLToPath(new URL('./fake-engine.ts', import.meta.url))], { encoding: 'utf8' });
      writeFileSync(join(dir, 'save.json'), saveFile);
      const clean = cli(join(dir, 'save.json'), '--record', join(dir, 'rec.json'));
      expect(clean.status, clean.stderr).toBe(0);
      expect(clean.stdout).toMatch(/all applied\n.*state hash matches/);
      const rec = JSON.parse(readFileSync(join(dir, 'rec.json'), 'utf8')) as Required<ReplayLog>;
      writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...rec, hashes: rec.hashes.map((h, i) => (i === 3 ? 'x' : h)) }));
      const bad = cli(join(dir, 'bad.json'));
      expect(bad.status).toBe(1);
      expect(bad.stdout).toContain('DIFF first difference after action 3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('the recorded text is the log as JSON, one action per line', () => {
    const log: ReplayLog = { options: { seed: 's' }, rules: RULES, actions: g.actions, finalHash: 'f' };
    expect(JSON.parse(logText(log))).toEqual(log);
    expect(logText(log).split('\n').filter((l) => l.startsWith('    {"kind":"answer"'))).toHaveLength(g.actions.length);
    expect(logText({ ...log, actions: [] })).toContain('  "actions": []');
    expect(JSON.parse(logText({ options: {}, rules: {}, actions: [] }))).toEqual({ options: {}, rules: {}, actions: [] });
  });

  it('migrates a save first: a newer version is refused (exit 2)', async () => {
    expect(parseLog(JSON.stringify({ ...save, version: 9 }))).toMatchObject({ ok: false, message: expect.stringMatching(/E_SAVE_VERSION/) as unknown });
    const { version: _v, ...old } = save;
    expect(await replayFile(P('/old.json'), engine, fakeIo({ '/old.json': JSON.stringify(old) }))).toBe(0);
    expect(await replayFile(P('/new.json'), engine, fakeIo({ '/new.json': JSON.stringify({ ...save, version: 9 }) }))).toBe(2);
  });

  it('takes the engine module from a config file, relative to it', async () => {
    const mod = resolve(P('/cfg'), 'engine.ts');
    const io = fakeIo({ '/g.json': saveFile, '/cfg/replay.json': '{"engine":"engine.ts"}' }, { [mod]: { default: engine } });
    expect(await run(['/g.json', '--config', '/cfg/replay.json'], io)).toBe(0);
    expect(await run(['/g.json', '--config', '/cfg/none.json'], fakeIo({ '/g.json': saveFile }))).toBe(2);
    expect(await run(['/g.json', '--config', '/c.json'], fakeIo({ '/g.json': saveFile, '/c.json': '{}' }))).toBe(2);
  });

  it('refuses what is not a log, a missing file, an engine that does not load and bad usage (exit 2)', async () => {
    expect(parseLog('{').ok).toBe(false);
    expect(parseLog('[]')).toEqual({ ok: false, message: 'not a replay log' });
    expect(parseLog('{"actions":[]}')).toEqual({ ok: false, message: 'the log lacks its options or actions' });
    expect(parseLog(saveFile).ok).toBe(true);
    expect(await replayFile(P('/none.json'), engine, fakeIo({}))).toBe(2);
    expect(await replayFile(P('/x.json'), engine, fakeIo({ '/x.json': 'nope' }))).toBe(2);
    const broken: ReplayEngine<Counter> = { game: COUNTER, content: () => Promise.reject(new Error('no content')) };
    expect(await replayFile(P('/g.json'), broken, fakeIo({ '/g.json': saveFile }))).toBe(2);
    const files = { '/g.json': saveFile };
    expect(await run(['/g.json', '--engine', 'missing.ts'], fakeIo(files))).toBe(2);
    expect(await run(['/g.json', '--engine', 'empty.ts'], fakeIo(files, { 'empty.ts': {} }))).toBe(2);
    for (const args of [[], ['a.json', 'b.json'], ['a.json'], ['--engine'], ['--fast', 'a.json'], ['a.json', '--engine', 'e', '--config', 'c']]) {
      expect(await run(args, fakeIo({})), args.join(' ')).toBe(2);
    }
  });
});
