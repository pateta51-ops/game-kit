import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createGame, newHistory, OLDER_BUILD, DAMAGED, recordAction, type History } from '../engine-core';
import { CONTENT, COUNTER, playGame, randomAnswer, RULES, type Counter } from '../engine-core/fake/counter';
import { keepStorage, makeSaves, type SavesConfig } from './index';
import type { KvBackend } from './kv';

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
