// Replay and saves (same inputs, same hash), Safe and Free undo with the refusal reasons, no undo after game over, save
// migration; end to end on the fake counter game with fixed seeds.
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  canUndo,
  createGame,
  createSave,
  draftOf,
  GameOver,
  type Ctx,
  DAMAGED,
  exportSave,
  hashState,
  importSave,
  migrateSave,
  newHistory,
  OLDER_BUILD,
  recordAction,
  redo,
  replay,
  restoreSave,
  stateAt,
  undo,
  type AnswerAction,
  type History,
  type RawSave,
  type SaveFormat,
} from './index.ts';
import { CONTENT, COUNTER, playGame, RULES, type Counter, type CounterState } from './fake/counter.ts';

type Action = AnswerAction;
const content = CONTENT;
const rules = RULES;
const options = (seed: string) => ({ seed });
const hs = (s: CounterState | null): string => hashState(s);

describe('replay and saves', () => {
  it('50 random games: replaying each save gives the same final hash', () => {
    for (let i = 1; i <= 50; i += 1) {
      const o = options(`p${String(i)}`);
      const g = playGame(o.seed);
      const save = createSave(COUNTER, { options: o, rules, actions: g.actions, undoUsed: false, savedAt: 't' }, content);
      const back = importSave(COUNTER, exportSave(save), content);
      expect(back.ok).toBe(true);
      if (back.ok) expect(hashState(back.state)).toBe(hashState(g.state));
    }
  });

  it('the same seed and actions give the same hash; another seed another game', () => {
    expect(hashState(playGame('same').state)).toBe(hashState(playGame('same').state));
    expect(playGame('same').actions).toEqual(playGame('same').actions);
    expect(hashState(playGame('same').state)).not.toBe(hashState(playGame('other').state));
    // the fixed seeds reach both endings: a win, and a loss thrown as GameOver from an empty pile
    const ends = new Set(Array.from({ length: 50 }, (_, i) => playGame(`e${String(i)}`, { target: 30 }).state.result?.kind));
    expect([...ends].sort()).toEqual(['lost', 'won']);
  });

  it('a damaged, older or altered save is refused, never thrown', () => {
    const o = options('p1');
    const g = playGame(o.seed);
    const save = createSave(COUNTER, { options: o, rules, actions: g.actions, undoUsed: true, savedAt: 't' }, content);
    expect(save.undoUsed).toBe(true);
    expect(restoreSave(COUNTER, { ...save, version: 0 }, content)).toEqual({ ok: false, error: OLDER_BUILD });
    expect(restoreSave(COUNTER, { ...save, contentHash: 'x' }, content)).toEqual({ ok: false, error: OLDER_BUILD });
    expect(restoreSave(COUNTER, { ...save, finalHash: 'x' }, content)).toEqual({ ok: false, error: OLDER_BUILD });
    expect(restoreSave(COUNTER, { ...save, actions: [{ kind: 'answer', promptId: 99, picks: [] }] }, content)).toEqual(
      {
        ok: false,
        error: DAMAGED,
      },
    );
    // editing the undo flag of an export is caught (it is sealed into finalHash)
    expect(restoreSave(COUNTER, { ...save, undoUsed: false }, content).ok).toBe(false);
    expect(restoreSave(COUNTER, { version: 1 }, content).ok).toBe(false);
    expect(restoreSave(COUNTER, null, content).ok).toBe(false);
    expect(importSave(COUNTER, '{nope', content).ok).toBe(false);
    const bad = replay(COUNTER, o, rules, [{ kind: 'answer', promptId: 99, picks: [] }], content);
    expect(bad.ok).toBe(false);
    expect(bad.failedAt).toBe(0);
    // an illegal history is reported, not thrown
    const broken: History<Counter> = {
      ...newHistory<Counter>(o, rules),
      actions: [{ kind: 'answer', promptId: 99, picks: [] }],
      cursor: 1,
    };
    expect(undo(COUNTER, broken, 'free', content).ok).toBe(false);
    expect(redo(COUNTER, broken, content).ok).toBe(false);
    expect(stateAt(COUNTER, broken, content)).toBeNull();
  });
});

describe('save migration (from EBR)', () => {
  const o = options('m1');
  const g = playGame(o.seed);
  const save = createSave(COUNTER, { options: o, rules, actions: g.actions, undoUsed: false, savedAt: 't' }, content);

  it('an old-format save without version or commit loads as version 1, and a newer version is refused', () => {
    const { version: _v, appCommit: _a, ...old } = save;
    const oldFile = old as RawSave;
    const m = migrateSave(oldFile);
    expect(m).toMatchObject({ ok: true, from: 1, save: { version: 1 } });
    expect(oldFile['version']).toBeUndefined(); // pure: the input is not rewritten
    const back = restoreSave(COUNTER, oldFile, content);
    expect(back.ok && hashState(back.state)).toBe(hashState(g.state));
    expect(back.ok && back.save.version).toBe(1);
    const { version: _only, ...noVersion } = save;
    const v1 = restoreSave(COUNTER, noVersion, content);
    expect(v1.ok && [v1.save.version, v1.save.appCommit]).toEqual([1, save.appCommit]);
    const newer = { ...oldFile, version: 2 };
    expect(migrateSave(newer)).toMatchObject({ ok: false, message: expect.stringMatching(/E_SAVE_VERSION/) as unknown });
    expect(restoreSave(COUNTER, newer, content)).toEqual({ ok: false, error: expect.stringMatching(/newer build/) as unknown });
  });

  it('a chain of pure steps brings an older save to the current version; a missing step is an older build', () => {
    const v2: SaveFormat = {
      version: 3,
      appCommit: 'abc',
      steps: { 1: (s) => ({ ...s, note: 'one' }), 2: (s) => ({ ...s, version: 3, two: true }) },
    };
    const m = migrateSave(save as unknown as RawSave, v2);
    expect(m).toMatchObject({ ok: true, from: 1, save: { version: 3, note: 'one', two: true } });
    expect(save.version).toBe(1);
    expect(restoreSave(COUNTER, save, content, v2).ok).toBe(true);
    expect(createSave(COUNTER, { options: o, rules, actions: g.actions, undoUsed: false, savedAt: 't' }, content, v2)).toMatchObject({
      version: 3,
      appCommit: 'abc',
    });
    const gap: SaveFormat = { version: 2 };
    expect(migrateSave(save as unknown as RawSave, gap)).toEqual({ ok: false, message: 'E_SAVE_VERSION: no migration from save version 1.' });
    expect(restoreSave(COUNTER, save, content, gap)).toEqual({ ok: false, error: OLDER_BUILD });
  });
});

/** Adds only (nothing revealed) up to `total` actions, with a draw as action `drawAt`; target high enough to never end. */
const LONG = { target: 1000 };
function build(seed: string, drawAt: number, total: number): Action[] {
  let s: CounterState = createGame(COUNTER, options(seed), LONG, content).state;
  const actions: Action[] = [];
  while (actions.length < total) {
    const p = s.prompt;
    if (p === null) throw new Error('no prompt');
    const a: Action = { kind: 'answer', promptId: p.id, picks: [actions.length === drawAt - 1 ? 'draw' : 'add'] };
    actions.push(a);
    s = applyAction(COUNTER, s, a, content).state;
  }
  return actions;
}

describe('undo', () => {
  it('a draw at action 7: Safe undo from action 10 stops after the reveal with its reason, Free reaches 6 and sets undoUsed', () => {
    const seed = 'u1';
    const actions = build(seed, 7, 10);
    const o = options(seed);
    let h: History<Counter> = { ...newHistory<Counter>(o, LONG), actions, cursor: 10 };
    const hashes = new Map<number, string>();
    for (let c = 0; c <= 10; c += 1) hashes.set(c, hs(stateAt(COUNTER, { ...h, cursor: c }, content)));
    // Safe: 10 -> 9 -> 8 -> 7, then refused (the 7th action drew)
    for (const expected of [9, 8, 7]) {
      const r = undo(COUNTER, h, 'safe', content);
      expect(r.ok).toBe(true);
      h = r.history;
      expect(h.cursor).toBe(expected);
      expect(hs(r.state)).toBe(hashes.get(expected));
      expect(h.undoUsed).toBe(false);
    }
    const stop = undo(COUNTER, h, 'safe', content);
    expect(stop.ok).toBe(false);
    expect(stop.error).toBe('A card was drawn');
    expect(canUndo(COUNTER, h, 'safe', content)).toEqual({ ok: false, reason: 'A card was drawn' });
    expect(canUndo(COUNTER, h, 'free', content)).toEqual({ ok: true });
    expect(stop.history).toBe(h);
    expect(hs(stop.state)).toBe(hashes.get(7));
    // without the game's words the reason is the generic one
    expect(undo({ ...COUNTER, revealWords: () => undefined }, h, 'safe', content).error).toBe('Something hidden was revealed');
    // Free: reaches the state before the draw (cursor 6) and marks undoUsed
    const free = undo(COUNTER, h, 'free', content);
    expect(free.ok).toBe(true);
    expect(free.history.cursor).toBe(6);
    expect(free.history.undoUsed).toBe(true);
    expect(hs(free.state)).toBe(hashes.get(6));
    // redo replays the undone action; a new action drops the rest
    const again = redo(COUNTER, free.history, content);
    expect(again.ok).toBe(true);
    expect(hs(again.state)).toBe(hashes.get(7));
    const next = recordAction(COUNTER, free.history, actions[6] as Action, content);
    expect(next.ok).toBe(true);
    expect(next.history.actions).toHaveLength(7);
    expect(redo(COUNTER, next.history, content).ok).toBe(false);
  });

  it('save, load, then undo: the state hash equals the hash before the undone action', () => {
    const o = options('u2');
    const actions = build(o.seed, 7, 10);
    const before = replay(COUNTER, o, LONG, actions.slice(0, 9), content).hash;
    const save = createSave(COUNTER, { options: o, rules: LONG, actions, undoUsed: false, savedAt: 't' }, content);
    const back = importSave(COUNTER, exportSave(save), content);
    if (!back.ok) throw new Error(back.error);
    const h: History<Counter> = { ...newHistory<Counter>(back.save.options, back.save.rules), actions: back.save.actions, cursor: back.save.actions.length, undoUsed: back.save.undoUsed };
    const r = undo(COUNTER, h, 'safe', content);
    expect(r.ok).toBe(true);
    expect(hs(r.state)).toBe(before);
  });

  it('createGame catches a GameOver thrown in setup and returns the state at that instant', () => {
    const ends = {
      ...COUNTER,
      setup: (ctx: Ctx<Counter>) => {
        draftOf(ctx).result = { kind: 'lost' };
        throw new GameOver();
      },
    };
    const r = createGame(ends, options('g'), rules, content);
    expect(r.state.result).toEqual({ kind: 'lost' });
    expect(r.state.prompt).toBeNull();
    expect(Object.isFrozen(r.state)).toBe(true);
  });

  it('a finished game cannot be undone: refused, no state change', () => {
    const o = options('p3');
    const g = playGame(o.seed);
    expect(g.state.result).not.toBeNull();
    const h: History<Counter> = { ...newHistory<Counter>(o, rules), actions: g.actions, cursor: g.actions.length };
    for (const mode of ['safe', 'free'] as const) {
      const r = undo(COUNTER, h, mode, content);
      expect(r.ok).toBe(false);
      expect(r.history).toBe(h);
      expect(hs(r.state)).toBe(hashState(g.state));
    }
    expect(undo(COUNTER, newHistory<Counter>(o, rules), 'free', content).ok).toBe(false);
    expect(canUndo(COUNTER, newHistory<Counter>(o, rules), 'free', content)).toEqual({ ok: false, reason: 'Nothing to undo.' });
  });
});
