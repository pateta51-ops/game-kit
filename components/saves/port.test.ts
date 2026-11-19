import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DAMAGED, kernelPort, newHistory, OLDER_BUILD, recordAction, type History } from '../engine-core/index.ts';
import { CONTENT, COUNTER, randomAnswer, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { makeSaves, type SavesConfig } from './index.ts';

// K403: saves over an engine port give the same saves, errors and hashes as over a GameRules
let db = 0;
let clock = Date.UTC(2026, 10, 15, 12, 0, 0);
const port = kernelPort(COUNTER, CONTENT, { options: (seed) => ({ seed }), gameRules: RULES });
const cfg = (more: Partial<SavesConfig<Counter>> = {}): SavesConfig<Counter> => ({
  game: COUNTER,
  content: CONTENT,
  database: `test-port-${String(db++)}`,
  filePrefix: 'neutral-game',
  now: () => new Date((clock += 1000)),
  ...more,
});
const viaPort = (more: Partial<SavesConfig<Counter>> = {}) => makeSaves<Counter>(cfg({ game: port, ...more }));
function played(seed: string, n: number): History<Counter> {
  let h = newHistory<Counter>({ seed }, RULES);
  let state = port.settle(port.start(seed));
  for (let i = 0; i < n && state.result === null; i++) {
    const r = recordAction(COUNTER, h, randomAnswer(state, seed), CONTENT);
    h = r.history;
    state = r.state as typeof state;
  }
  return h;
}

describe('K403 saves over an engine port', () => {
  it('writes, autosaves and restores to the same final hash as the GameRules path', async () => {
    const a = makeSaves(cfg());
    const b = viaPort();
    const h = played('a', 6);
    await b.writeAutosave(h, 'Current game');
    const got = (await b.readAutosave())!;
    expect(got[1].save.finalHash).toBe(a.saveOf(h).finalHash);
    const r = b.restore(got[1]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(b.historyOf(r.save)).toEqual({ ...h, actions: h.actions.slice(0, h.cursor) });
    expect(a.restore({ name: 'x', save: got[1].save }).ok).toBe(true);
  });

  it('the save holds the seed, the content hash and the answers in order', () => {
    const s = viaPort().saveOf(played('b', 4));
    expect(s.options).toEqual({ seed: 'b' });
    expect(s.contentHash).toBe(COUNTER.contentHash(CONTENT));
    expect(s.actions).toHaveLength(4);
  });

  it('keeps the autosave slots and prunes older ones', async () => {
    const s = viaPort({ autosaves: 2 });
    for (const n of [1, 2, 3]) await s.writeAutosave(played('c', n), `t${String(n)}`);
    expect((await s.listAutosaves()).map(([, v]) => v.name)).toEqual(['t3', 't2']);
  });

  it('export then import round-trips to the same state hash', async () => {
    const s = viaPort();
    const key = await s.saveNamed('Mine', played('e', 6));
    const stored = (await s.get(key))!;
    const r = await s.importNamed(s.exportText(stored), 'Copy');
    expect(r.ok).toBe(true);
    if (r.ok) expect((await s.get(r.key))?.save).toEqual(stored.save);
    expect(await makeSaves(cfg()).importNamed(s.exportText(stored), 'Rules')).toMatchObject({ ok: true });
  });

  it('gives the GameRules path errors: not a save, damaged, edited flag, other content, refused answer', async () => {
    const a = makeSaves(cfg());
    const s = viaPort();
    const save = s.saveOf(played('f', 4));
    const same = async (text: string) => expect(await s.importNamed(text, 'x')).toEqual(await a.importNamed(text, 'x'));
    await same('not json');
    await same(JSON.stringify({ ...save, actions: 'no' }));
    await same(JSON.stringify({ ...save, undoUsed: !save.undoUsed }));
    await same(JSON.stringify({ ...save, finalHash: 'x' }));
    await same(JSON.stringify({ ...save, version: 0 }));
    await same(JSON.stringify({ ...save, contentHash: 'x' }));
    await same(JSON.stringify({ ...save, actions: [...save.actions, { kind: 'answer', promptId: 999, picks: ['nope'] }] }));
    expect(await s.importNamed('{"a":1}', 'x')).toEqual({ ok: false, error: DAMAGED });
    expect(await s.listNamed()).toEqual([]);
    const other = viaPort({ database: 'other', contentHash: () => 'v2' });
    expect(other.restore({ name: 'o', save })).toEqual({ ok: false, error: OLDER_BUILD });
  });

  it('a broken history is never saved', () => {
    const h = played('h', 2);
    expect(() => viaPort().saveOf({ ...h, actions: [{ kind: 'answer', promptId: 999, picks: ['nope'] }], cursor: 1 })).toThrow();
  });
});
