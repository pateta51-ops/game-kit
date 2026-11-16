import 'fake-indexeddb/auto';
import { del, entries, get, set, setMany } from 'idb-keyval';
import { describe, expect, it, vi } from 'vitest';
import { createGame, newHistory, OLDER_BUILD, DAMAGED, recordAction, type History } from '../engine-core';
import { CONTENT, COUNTER, playGame, randomAnswer, RULES, type Counter } from '../engine-core/fake/counter';
import { keepStorage, makeSaves, SAVE_CLOCK_MAX_AHEAD_MS, type SavesConfig } from './index';
import { makeKv, type KvBackend } from './kv';

let db = 0;
let clock = Date.UTC(2026, 10, 15, 12, 0, 0);
const cfg = (more: Partial<SavesConfig<Counter>> = {}): SavesConfig<Counter> => ({
  game: COUNTER,
  content: CONTENT,
  database: `test-saves-${String(db++)}`,
  filePrefix: 'neutral-game',
  now: () => new Date((clock += 1000)),
  ...more,
});

/** A history of `n` actions of the seeded random game. */
function played(seed: string, n: number): History<Counter> {
  let h = newHistory<Counter>({ seed }, RULES);
  let state = createGame(COUNTER, { seed }, RULES, CONTENT).state;
  for (let i = 0; i < n && state.result === null; i++) {
    const r = recordAction(COUNTER, h, randomAnswer(state, seed), CONTENT);
    h = r.history;
    state = r.state as typeof state;
  }
  return h;
}

describe('saved games', () => {
  it('autosave after an action restores the same game (same final hash)', async () => {
    const s = makeSaves(cfg());
    const h = played('a', 5);
    await s.writeAutosave(h, 'Current game');
    const got = await s.readAutosave();
    expect(got?.[1].name).toBe('Current game');
    const r = s.restore(got![1]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(s.historyOf(r.save)).toEqual({ ...h, actions: h.actions.slice(0, h.cursor) });
  });

  it('one slot by default: a new autosave replaces the old; with autosaves 3 the newest three stay, newest first', async () => {
    const one = makeSaves(cfg());
    await one.writeAutosave(played('a', 2), 'x');
    await one.writeAutosave(played('a', 3), 'y');
    expect((await one.listAutosaves()).map(([, v]) => v.name)).toEqual(['y']);
    const three = makeSaves(cfg({ autosaves: 3 }));
    for (const n of [1, 2, 3, 4, 5]) await three.writeAutosave(played('b', n), `t${String(n)}`);
    expect((await three.listAutosaves()).map(([, v]) => v.name)).toEqual(['t5', 't4', 't3']);
    await three.clearAutosaves();
    expect(await three.readAutosave()).toBeUndefined();
  });

  it('an undone tail is not saved: the save holds the actions up to the cursor', () => {
    const s = makeSaves(cfg());
    const h = { ...played('c', 4), cursor: 2 };
    expect(s.saveOf(h).actions).toHaveLength(2);
  });

  it('named saves list newest first and stay apart from the autosaves; remove deletes one', async () => {
    const s = makeSaves(cfg());
    const k1 = await s.saveNamed('First', played('d', 1));
    await s.saveNamed('Second', played('d', 2));
    await s.writeAutosave(played('d', 3), 'auto');
    expect((await s.listNamed()).map(([, v]) => v.name)).toEqual(['Second', 'First']);
    await s.remove(k1);
    expect((await s.listNamed()).map(([, v]) => v.name)).toEqual(['Second']);
    expect(await s.listAutosaves()).toHaveLength(1);
  });

  it('export then import gives the same save; the file name carries the game prefix and the time', async () => {
    const s = makeSaves(cfg());
    const key = await s.saveNamed('Mine', played('e', 6));
    const stored = (await s.get(key))!;
    expect(s.exportName(stored)).toMatch(/^neutral-game-\d{4}-\d\d-\d\d-\d\d-\d\d\.json$/);
    const r = await s.importNamed(s.exportText(stored), 'Copy');
    expect(r.ok).toBe(true);
    if (r.ok) expect((await s.get(r.key))?.save).toEqual(stored.save);
  });

  it('import refuses what is not a save, a damaged save and an edited undo flag, with the reason, and stores nothing', async () => {
    const s = makeSaves(cfg());
    const save = s.saveOf(played('f', 4));
    expect(await s.importNamed('not json', 'x')).toEqual({ ok: false, error: 'This is not a save file.' });
    expect(await s.importNamed(JSON.stringify({ ...save, actions: 'no' }), 'x')).toEqual({ ok: false, error: DAMAGED });
    expect(await s.importNamed(JSON.stringify({ ...save, undoUsed: !save.undoUsed }), 'x')).toEqual({ ok: false, error: OLDER_BUILD });
    expect(await s.listNamed()).toEqual([]);
  });

  it('a save from another build (other content) is reported as older, never thrown', async () => {
    const database = `test-saves-${String(db++)}`;
    const a = makeSaves(cfg({ database }));
    await a.saveNamed('Old', played('g', 3));
    const b = makeSaves(cfg({ database, content: { cards: CONTENT.cards + 1 } }));
    const [[, stored]] = (await b.listNamed()) as [[string, never]];
    expect(b.restore(stored)).toEqual({ ok: false, error: OLDER_BUILD });
  });

  it('a broken history is never saved', () => {
    const s = makeSaves(cfg());
    const h = played('h', 2);
    expect(() => s.saveOf({ ...h, actions: [{ kind: 'answer', promptId: 999, picks: ['nope'] }], cursor: 1 })).toThrow();
  });

  it('golden: a fixed game saves with the recorded final hash (replay stays deterministic)', () => {
    const s = makeSaves(cfg());
    const { actions } = playGame('golden');
    const save = s.saveOf({ options: { seed: 'golden' }, rules: RULES, actions, cursor: actions.length, undoUsed: false });
    expect(save.finalHash).toMatchInlineSnapshot(`"829428b84ca2453f"`);
    expect(save.actions).toHaveLength(actions.length);
  });

  it('IndexedDB refused (a private window): saves last in memory for the page', async () => {
    const no = (): Promise<never> => Promise.reject(new Error('blocked'));
    const backend: KvBackend = { entries: no, get: no, set: no, del: no };
    const s = makeSaves(cfg({ backend }));
    await s.writeAutosave(played('i', 2), 'mem');
    expect((await s.readAutosave())?.[1].name).toBe('mem');
  });
});

describe('autosave clock', () => {
  const at = (iso: string) => () => new Date(iso);
  const name = () => `test-saves-${String(db++)}`;
  const newestAt = async (s: ReturnType<typeof makeSaves<Counter>>) => (await s.readAutosave())?.[1].save.savedAt;

  it('Continue: an autosave written after another is the latest, though the wall clock stepped back', async () => {
    const database = name();
    let t = '2026-11-06T03:13:58.800Z';
    const visit = () => makeSaves(cfg({ database, autosaves: 9, now: () => new Date(t) }));
    await visit().writeAutosave(played('a', 1), 'b');
    t = '2026-11-06T03:13:58.400Z'; // the next page, the clock back
    const s = visit();
    await s.writeAutosave(played('a', 2), 'a');
    expect((await s.readAutosave())?.[1].name).toBe('a');
    expect(await newestAt(s)).toBe('2026-11-06T03:13:58.801Z');
    t = '2026-11-06T03:13:58.000Z';
    // autosaves fired together in the same millisecond keep their order
    await Promise.all([s.writeAutosave(played('a', 3), 'c'), s.writeAutosave(played('a', 4), 'd')]);
    expect((await s.listAutosaves()).map(([, v]) => `${v.name} ${v.save.savedAt.slice(17)}`)).toEqual([
      'd 58.803Z',
      'c 58.802Z',
      'a 58.801Z',
      'b 58.800Z',
    ]);
  });

  it('a stored clock that is not a time is ignored; a save time that is not one is now', async () => {
    for (const bad of ['x', Number.NaN, Number.POSITIVE_INFINITY, -5, 9e15, null]) {
      const database = name();
      const raw = makeKv<unknown>(database, 'saves');
      await raw.put('save-clock', bad);
      const s = makeSaves(cfg({ database, now: at('2026-11-06T03:00:00.000Z') }));
      await s.writeAutosave(played('a', 1), 'a');
      expect(await newestAt(s)).toBe('2026-11-06T03:00:00.000Z');
      expect(await makeKv<unknown>(database, 'saves').get('save-clock')).toBe(Date.parse('2026-11-06T03:00:00.000Z'));
    }
    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-06T04:00:00.000Z'));
    const s = makeSaves(cfg({ now: () => new Date(Number.NaN) }));
    await s.writeAutosave(played('a', 1), 'a');
    spy.mockRestore();
    expect(await newestAt(s)).toBe('2026-11-06T04:00:00.000Z');
  });

  it('a stored clock more than a day ahead of now is ignored; one less than a day ahead still orders', async () => {
    expect(SAVE_CLOCK_MAX_AHEAD_MS).toBe(86_400_000);
    const now = at('2026-11-06T04:00:00.000Z');
    let database = name();
    await makeKv<unknown>(database, 'saves').put('save-clock', Date.parse('2026-11-07T04:00:00.001Z')); // 24 h and 1 ms ahead
    let s = makeSaves(cfg({ database, now }));
    await s.writeAutosave(played('a', 1), 'a');
    expect(await newestAt(s)).toBe('2026-11-06T04:00:00.000Z');
    database = name();
    await makeKv<unknown>(database, 'saves').put('save-clock', Date.parse('2026-11-07T03:00:00.000Z')); // 23 h ahead
    s = makeSaves(cfg({ database, now }));
    await s.writeAutosave(played('a', 1), 'b');
    expect(await newestAt(s)).toBe('2026-11-07T03:00:00.001Z');
  });

  it('an autosave and the clock are written in one transaction', async () => {
    const writes: string[][] = [];
    const backend: KvBackend = {
      entries,
      get,
      del,
      set: (k, v, st) => (writes.push([k]), set(k, v, st)),
      setMany: (es, st) => (writes.push(es.map(([k]) => k)), setMany(es, st)),
    };
    const database = name();
    const key = await makeSaves(cfg({ database, backend, now: at('2026-11-06T03:13:58.400Z') })).writeAutosave(played('a', 1), 'a');
    expect(writes).toEqual([['save-clock', key]]);
    expect(await makeKv<unknown>(database, 'saves').get('save-clock')).toBe(Date.parse('2026-11-06T03:13:58.400Z'));
  });
});

describe('autosave clock: tabs, old backends, reset, first clock', () => {
  const name = () => `test-saves-${String(db++)}`;
  const stamps = async (s: ReturnType<typeof makeSaves<Counter>>) =>
    (await s.listAutosaves()).map(([, v]) => `${v.name} ${v.save.savedAt.slice(17)}`);

  it('two tabs on one database: each autosave is later than the other tab\'s', async () => {
    const database = name();
    let t = '2026-11-06T03:13:58.800Z';
    const tab = () => makeSaves(cfg({ database, autosaves: 9, now: () => new Date(t) }));
    const a = tab();
    const b = tab();
    await a.writeAutosave(played('a', 1), 'a1');
    await b.writeAutosave(played('a', 2), 'b1');
    await a.writeAutosave(played('a', 3), 'a2');
    t = '2026-11-06T03:13:58.000Z';
    await b.writeAutosave(played('a', 4), 'b2');
    expect(await stamps(a)).toEqual(['b2 58.803Z', 'a2 58.802Z', 'b1 58.801Z', 'a1 58.800Z']);
  });

  it('a backend without setMany: the clock is written first, then the slot; a failed slot write is reported and leaves the clock ahead', async () => {
    const writes: string[] = [];
    let fail = false;
    const backend: KvBackend = {
      entries,
      get,
      del,
      set: (k, v, st) => (writes.push(k), fail && k !== 'save-clock' ? Promise.reject(new Error('full')) : set(k, v, st)),
    };
    const database = name();
    const errors: unknown[] = [];
    const visit = () =>
      makeSaves(cfg({ database, backend, autosaves: 9, now: () => new Date('2026-11-06T03:00:00.000Z'), onError: (e) => errors.push(e) }));
    const s = visit();
    const k1 = await s.writeAutosave(played('a', 1), 'one');
    expect(writes).toEqual(['save-clock', k1]);
    expect(await stamps(visit())).toEqual(['one 00.000Z']);
    fail = true;
    await s.writeAutosave(played('a', 2), 'two');
    expect(errors).toHaveLength(1);
    expect(await stamps(s)).toEqual(['two 00.001Z', 'one 00.000Z']); // in memory for this page
    fail = false;
    const next = visit();
    expect(await stamps(next)).toEqual(['one 00.000Z']);
    await next.writeAutosave(played('a', 3), 'three');
    expect(await stamps(next)).toEqual(['three 00.002Z', 'one 00.000Z']);
  });

  it('data.clear drops the clock: an autosave after a reset in the same page is stamped now', async () => {
    let t = '2026-11-06T03:00:05.000Z';
    const s = makeSaves(cfg({ now: () => new Date(t) }));
    await s.writeAutosave(played('a', 1), 'old');
    await s.data.clear();
    t = '2026-11-06T03:00:00.000Z';
    await s.writeAutosave(played('a', 2), 'new');
    expect(await stamps(s)).toEqual(['new 00.000Z']);
  });

  it('no stored clock: the first autosave is later than the latest stored one, unless that is over a day ahead', async () => {
    for (const [old, want] of [
      ['2026-11-06T03:00:05.000Z', 'new 05.001Z'],
      ['2026-11-08T03:00:05.000Z', 'new 00.000Z'],
    ] as const) {
      const database = name();
      await makeSaves(cfg({ database, now: () => new Date(old) })).writeAutosave(played('a', 1), 'old');
      await makeKv<unknown>(database, 'saves').remove('save-clock');
      const s = makeSaves(cfg({ database, autosaves: 9, now: () => new Date('2026-11-06T03:00:00.000Z') }));
      await s.writeAutosave(played('a', 2), 'new');
      expect(await stamps(s)).toContain(want);
      if (want === 'new 05.001Z') expect((await s.readAutosave())?.[1].name).toBe('new');
    }
  });
});

describe('rename', () => {
  it('renames a named save (trimmed), keeps its save; an empty name, an autosave or an unknown key changes nothing', async () => {
    const s = makeSaves(cfg());
    const key = await s.saveNamed('First', played('r', 2));
    const before = (await s.get(key))!;
    expect(await s.rename(key, '  Second ')).toBe(true);
    expect(await s.get(key)).toEqual({ name: 'Second', save: before.save });
    expect(await s.rename(key, '   ')).toBe(false);
    expect(await s.rename('named:nope', 'x')).toBe(false);
    const auto = await s.writeAutosave(played('r', 3), 'auto');
    expect(await s.rename(auto, 'x')).toBe(false);
    expect((await s.listNamed()).map(([, v]) => v.name)).toEqual(['Second']);
    expect((await s.readAutosave())?.[1].name).toBe('auto');
  });
});

describe('keepStorage', () => {
  it('already kept: true without asking; else asks persist(); missing or throwing: false', async () => {
    let asked = 0;
    const sm = (persisted: boolean, grant: boolean) =>
      ({ persisted: () => Promise.resolve(persisted), persist: () => (asked++, Promise.resolve(grant)) }) as unknown as StorageManager;
    expect(await keepStorage(sm(true, false))).toBe(true);
    expect(asked).toBe(0);
    expect(await keepStorage(sm(false, true))).toBe(true);
    expect(await keepStorage(sm(false, false))).toBe(false);
    expect(asked).toBe(2);
    expect(await keepStorage(undefined)).toBe(false);
    expect(await keepStorage({ persist: () => Promise.reject(new Error('x')) } as unknown as StorageManager)).toBe(false);
  });
});
