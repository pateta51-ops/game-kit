// replay.ts on the fake counter game of engine-core: a save or a record replays headlessly; it fails (exit 1) when an
// action is refused, a per-action hash or the final hash differs, and refuses (exit 2) what is not a log, a missing file,
// an engine that does not load and bad usage. The recorded text format round-trips, one action per line.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSave, hashState } from '../engine-core/index';
import { CONTENT, COUNTER, playGame, RULES, type Counter } from '../engine-core/fake/counter';
import { logText, parseLog, replayFile, run, type Io, type ReplayEngine, type ReplayLog } from './replay';

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
