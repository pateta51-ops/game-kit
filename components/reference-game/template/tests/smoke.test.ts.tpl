// K205 / K234 contract test: the reference game through game-store (defineGame), engine-core step undo, card-zones,
// card-language with the standard pack, prompt-host forced answers, paced-view, the opponent seat, sim-pool, replay-cli,
// saves, settings and app-frame, played headless.
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHash, routeHref } from '../kit/app-frame/index.ts';
import { replay, setInvariantChecking, type AnswerAction } from '../kit/engine-core/index.ts';
import { autoAnswer } from '../kit/prompt-host/index.ts';
import { expectVerbs, validateEffect } from '../kit/card-language/index.ts';
import { hiddenFrom } from '../kit/card-zones/index.ts';
import { createGameStore } from '../kit/game-store/index.ts';
import { viewLeaks } from '../kit/opponent/index.ts';
import { checkGoldens, recordGames, replayGames } from '../kit/replay-cli/golden.ts';
import type { Io } from '../kit/replay-cli/replay.ts';
import { playOne, runGames, type GameSpec } from '../kit/sim-pool/index.ts';
import { gameResult, logLines } from '../kit/table-panels/index.ts';
import { cardText, CONTENT, greedyPicks, hashState, REF, RULES, SEATS, VERBS, viewOf, WORDS, type RefState } from '../src/engine/api.ts';
import { simGame, specs } from '../src/engine/sim.ts';
import { game, saves, useSettings } from '../src/ui/store.ts';

setInvariantChecking(true);
const mine = (seed: string) => createGameStore(REF, { seat: '0', seed, undo: 'free' });
type Store = ReturnType<typeof mine>;
const play = (st: Store): void => {
  const s = st.get().state;
  if (s.prompt === null) throw new Error('no prompt');
  if (!st.answer(greedyPicks(viewOf(s, s.prompt.seat), s.prompt), s.prompt.id)) throw new Error(st.get().error ?? 'refused');
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-'));
const lines: string[] = [];
const io: Io = { out: (l) => lines.push(l), err: (l) => lines.push(l), read: (p) => fs.readFileSync(p, 'utf8'), write: (p, t) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, t);
  }, exists: (p) => fs.existsSync(p), list: (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []), load: (p) => import(p) };

describe('reference game (K205, K234)', () => {
  it('a full game through the store: the opponent seat answers itself, each click is paced once; replay gives the same state', () => {
    const st = mine('r1');
    const seen: RefState[] = [st.get().state];
    let clicks = 0;
    while (st.get().state.result === null) {
      expect(st.get().state.prompt?.seat).toBe('0');
      play(st);
      clicks += 1;
      seen.push(st.get().state);
      expect(st.get().history.steps.length).toBe(clicks);
      expect(st.get().steps.events.length).toBeGreaterThan(0);
      st.skip();
    }
    const r = replay(REF.rules, { seed: 'r1' }, RULES, st.get().history.actions as AnswerAction[], CONTENT);
    expect(r.ok && hashState(r.state)).toBe(hashState(st.get().state));
    expect(logLines(st.get().state.log, WORDS).length).toBeGreaterThan(0);
    expect(gameResult(st.get().state.scores).standings.length).toBe(2);
    // the opponent never sees hidden cards: no hidden id is in either seat's view at any state of the game
    for (const s of seen) for (const seat of SEATS) expect(viewLeaks(viewOf(s, seat), hiddenFrom(s, seat))).toEqual([]);
  });

  it('step undo: one undo takes back one click (the forced and the opponent answers after it too)', () => {
    const st = mine('u1');
    const before = hashState(st.get().state);
    play(st);
    expect(st.get().history.steps.length).toBe(1);
    expect(st.undo()).toBe(true);
    expect(hashState(st.get().state)).toBe(before);
    expect(st.redo()).toBe(true);
    expect(st.answer(['nope'], (st.get().state.prompt?.id ?? 0) + 5)).toBe(false);
  });

  it('save and load in the middle of a card effect: the same asking-verb prompt is open and answers', async () => {
    const st = mine('s1');
    while (st.get().state.prompt?.kind !== 'may') play(st);
    expect(st.get().state.stack.some((t) => t.kind === 'verb')).toBe(true);
    await saves.saveNamed('mid', st.saved());
    const [, stored] = (await saves.listNamed())[0] ?? [];
    if (stored === undefined) throw new Error('not saved');
    const back = mine('other');
    expect(back.load(stored.save)).toBeNull();
    expect(hashState(back.get().state)).toBe(hashState(st.get().state));
    expect(back.get().state.prompt).toEqual(st.get().state.prompt);
    expect(back.get().history.steps.length).toBe(st.get().history.steps.length);
    play(back);
    expect(back.undo()).toBe(true);
    expect(hashState(back.get().state)).toBe(hashState(st.get().state));
  });

  it('autosave after each answer; export and import', async () => {
    const st = createGameStore(REF, { seat: '0', seed: 'a1', saves });
    play(st);
    await st.autosaved();
    expect((await saves.readAutosave())?.[1].save.actions.length).toBe(st.get().history.actions.length);
    expect((await saves.importNamed(saves.exportText({ name: 'mid', save: saves.saveOf(st.saved()) }), 'copy')).ok).toBe(true);
  });

  it('card-language: the game verbs (one asking) have words and examples; every effect is valid with the pack', () => {
    expectVerbs({ score: VERBS.score, wild: VERBS.wild }, [{ op: 'score', points: 2 }, { op: 'wild', max: 3 }]);
    expect(Object.values(CONTENT.effects).flatMap((e) => validateEffect(VERBS, e))).toEqual([]);
    expect(validateEffect(VERBS, [{ op: 'may', then: [{ op: 'draw' }] }])).toEqual([]);
    expect([cardText(0), cardText(4)]).toEqual(['Choose 1 to 3 and score that.', 'Score 4.']);
  });

  it('the opponent decides from its own view: the hidden hand never changes the choice', () => {
    const s = mine('v1').get().state;
    const b = s.zones['hand:1'];
    const other: RefState = { ...s, zones: { ...s.zones, 'hand:1': { ...b, cards: [...(b?.cards ?? [])].reverse() } } as RefState['zones'] };
    expect(viewOf(other, '0')).toEqual(viewOf(s, '0'));
    const p = s.prompt;
    if (p !== null) expect(greedyPicks(viewOf(other, '0'), p)).toEqual(greedyPicks(viewOf(s, '0'), p));
  });

  it('sim-pool: a batch on two workers ends every game, the same as in this thread', async () => {
    const list: GameSpec[] = Array.from({ length: 16 }, (_, i) => ({ index: i, seed: `b${String(i)}`, driver: i % 2 ? 'random' : 'opponent' }));
    const records = await runGames({ module: new URL('../src/engine/sim.ts', import.meta.url).href, specs: list }, 2);
    expect(records.map((r) => r.error ?? r.result !== null)).toEqual(list.map(() => true));
    expect(records.map((r) => r.hash)).toEqual(list.map((s) => playOne(simGame, CONTENT, s).hash));
  }, 60_000);

  it('replay-cli: goldens record and check; recorded games replay hash by hash', async () => {
    const mod = { simGame, specs };
    expect(await checkGoldens(mod, path.join(tmp, 'goldens'), io, { update: true }), lines.join('\n')).toBe(0);
    expect(await checkGoldens(mod, path.join(tmp, 'goldens'), io)).toBe(0);
    const file = path.join(tmp, 'games.json');
    expect(await recordGames(mod, file, io)).toBe(0);
    expect(await replayGames(mod, file, io), lines.join('\n')).toBe(0);
  });

  it('settings and the store: the chosen seat is the one asked; the other seat answers itself', () => {
    useSettings.getState().set('seat', 1);
    game.fresh('seat');
    expect(game.get().state.prompt?.seat).toBe('1');
    expect(game.get().history.actions.length).toBeGreaterThan(0);
    useSettings.getState().reset();
    expect(useSettings.getState().values.seat).toBe(0);
  });

  it('app-frame routes and prompt-host autoAnswer', () => {
    expect(parseHash('#/saves', ['menu', 'play', 'settings', 'saves'], 'menu').name).toBe('saves');
    expect(routeHref('play', 'menu')).toBe('#/play');
    const may = { id: 3, kind: 'may', seat: 0, min: 1, max: 1, options: [{ id: 'yes', enabled: false }, { id: 'no', enabled: true }] } as const;
    expect(autoAnswer(may, true)).toEqual(['no']);
  });
});
