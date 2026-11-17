// K205 / K234 / K276 contract test: the reference game through game-store (defineGame), engine-core step undo and timing
// (replacement, duration, state checks), turn-flow, card-zones, card-language (pack and `when` triggers), prompt-host
// forced answers, paced-view, the automa as a sim-pool Bot, campaign, sim-pool, replay-cli, saves, settings and app-frame.
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseHash, routeHref } from '../kit/app-frame/index.ts';
import { allEffects, applyAction, createGame, replay, setInvariantChecking, sumEffects, type AnswerAction } from '../kit/engine-core/index.ts';
import { autoAnswer } from '../kit/prompt-host/index.ts';
import { expectVerbs, validateEffect } from '../kit/card-language/index.ts';
import { validateWhen } from '../kit/card-language/when.ts';
import { cardsIn, hiddenFrom, moveCard, type Zoned } from '../kit/card-zones/index.ts';
import { createGameStore } from '../kit/game-store/index.ts';
import { flowOf } from '../kit/turn-flow/index.ts';
import { automaLines } from '../kit/automa/index.ts';
import { addCount, emptyLog, record } from '../kit/campaign/index.ts';
import { viewLeaks } from '../kit/opponent/index.ts';
import { checkGoldens, recordGames, replayGames } from '../kit/replay-cli/golden.ts';
import type { Io } from '../kit/replay-cli/replay.ts';
import { DriverRng, legalAnswers, playOne, runGames, type GameSpec } from '../kit/sim-pool/index.ts';
import { gameResult, logLines } from '../kit/table-panels/index.ts';
import { BONUS, BOTS, cardText, CONTENT, GAME, hashState, LIMIT, REF, SEATS, startOf, STEPS, VERBS, viewOf, WORDS, type RefState } from '../src/engine/api.ts';
import { automaDriver, simGame, specs } from '../src/engine/sim.ts';
import { campaignNow, game, INITIAL, nextScenario, saves, startCampaign, startGame, useSettings } from '../src/ui/store.ts';

setInvariantChecking(true);
const mine = (seed: string) => createGameStore(REF, { seat: '0', seed, undo: 'free' });
type Store = ReturnType<typeof mine>;
const pilot = (s: RefState): string[] => {
  const p = s.prompt;
  if (p === null) throw new Error('no prompt');
  return [...(REF.opponent?.(viewOf(s, p.seat), p, new DriverRng(`pilot|${String(p.id)}`)) ?? [])];
};
const play = (st: { get(): { state: RefState; error: string | null }; answer(p: readonly string[], id: number): boolean }): void => {
  const s = st.get().state;
  if (!st.answer(pilot(s), s.prompt?.id ?? 0)) throw new Error(st.get().error ?? 'refused');
};
const toEnd = (st: Store): void => {
  for (let i = 0; i < 300 && st.get().state.result === null; i++) play(st);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-'));
const lines: string[] = [];
const io: Io = { out: (l) => lines.push(l), err: (l) => lines.push(l), read: (p) => fs.readFileSync(p, 'utf8'), write: (p, t) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, t);
  }, exists: (p) => fs.existsSync(p), list: (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []), load: (p) => import(p) };

// a fresh game at seat 0's draw prompt, with the named cards moved: `hand:0` gets `hand`, `play:1` gets `play1`, then life set
function arranged(o: { hand?: string[]; play1?: string[]; life?: [number, number] }): [RefState, (d: string) => string] {
  const { options, rules } = REF.start('arr');
  const s = structuredClone(createGame(GAME, options, rules, CONTENT).state) as RefState & Zoned & { life: Record<string, number> };
  const ids: Record<string, string> = {};
  const take = (d: string, to: string): void => {
    const c = cardsIn(s, 'deck').find((x) => CONTENT.cards[x] === d) ?? '';
    ids[d] = c;
    moveCard(s, c, to);
  };
  for (const d of o.hand ?? []) take(d, 'hand:0');
  for (const d of o.play1 ?? []) take(d, 'play:1');
  if (o.life) s.life = { 0: o.life[0], 1: o.life[1] };
  return [s, (d) => ids[d] ?? ''];
}
const answer = (s: RefState, picks: string[]): RefState => {
  return applyAction(GAME, s, { kind: 'answer', promptId: s.prompt?.id ?? 0, picks }, CONTENT).state;
};
// from the draw prompt: decline the draw, then play `c`
const playCard = ([s, id]: [RefState, (d: string) => string], d: string): RefState => answer(answer(s, ['no']), [id(d)]);

describe('reference game (K205, K234)', () => {
  it('a full game through the store: the automa seat answers itself, each click is paced once; replay gives the same state', () => {
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
    const { options, rules } = REF.start('r1');
    const r = replay(REF.rules, options, rules, st.get().history.actions as AnswerAction[], CONTENT);
    expect(r.ok && hashState(r.state)).toBe(hashState(st.get().state));
    expect(logLines(st.get().state.log, WORDS).length).toBeGreaterThan(0);
    expect(gameResult(st.get().state.life).standings.length).toBe(2);
    for (const s of seen) for (const seat of SEATS) expect(viewLeaks(viewOf(s, seat), hiddenFrom(s, seat))).toEqual([]);
  });

  it('step undo: one undo takes back one click (the forced and the automa answers after it too)', () => {
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
    play(st);
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

  it('card-language: the game verbs have words and examples; every effect and when is valid with the pack', () => {
    expectVerbs({ hit: VERBS.hit, heal: VERBS.heal, boost: VERBS.boost }, [{ op: 'hit', n: 2 }, { op: 'heal', n: 1 }, { op: 'boost', n: 2 }]);
    expect(Object.values(CONTENT.defs).flatMap((d) => (d.effect.length > 0 ? validateEffect(VERBS, d.effect) : []))).toEqual([]);
    expect(validateWhen(VERBS, CONTENT.defs.mend?.when, { kinds: ['damage'], tests: ['mine'] })).toEqual([]);
    expect([cardText('jab'), cardText('mend')]).toEqual(['Deal 2 damage.', 'Stays in play. When you take damage, you may: Heal 1.']);
  });

  it('the opponent decides from its own view: the hidden hand never changes the choice', () => {
    const [s] = arranged({});
    const b = s.zones['hand:0'];
    const other: RefState = { ...s, zones: { ...s.zones, 'hand:0': { ...b, cards: [...(b?.cards ?? [])].reverse() } } as RefState['zones'] };
    expect(viewOf(other, '1')).toEqual(viewOf(s, '1'));
  });

  it('sim-pool: a batch on two workers ends every game, the same as in this thread', async () => {
    const drivers = ['opponent', 'random', 'automa'];
    const list: GameSpec[] = Array.from({ length: 15 }, (_, i) => ({ index: i, seed: `b${String(i)}`, driver: drivers[i % 3] ?? 'random' }));
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

  it('app-frame routes and prompt-host autoAnswer', () => {
    expect(parseHash('#/saves', ['menu', 'setup', 'play', 'settings', 'saves'], 'menu').name).toBe('saves');
    expect(routeHref('play', 'menu')).toBe('#/play');
    const may = { id: 3, kind: 'may', seat: 0, min: 1, max: 1, options: [{ id: 'yes', enabled: false }, { id: 'no', enabled: true }] } as const;
    expect(autoAnswer(may, true)).toEqual(['no']);
  });
});

describe('reference game: timing windows, opponent driver, golden (K239)', () => {
  it('timing: a draw goes through one batch; no window or current occurrence is left open at a prompt', () => {
    const st = mine('t1');
    expect(st.get().state.prompt?.kind).toBe('may');
    expect(st.answer(['yes'], st.get().state.prompt?.id ?? 0)).toBe(true);
    const t = st.get().state.timing;
    expect(st.get().state.log.filter((e) => e.type === 'drew').length).toBe(2);
    expect((t?.occurrences ?? []).every((o) => o.state === 'happened' || o.state === 'cancelled')).toBe(true);
    expect(new Set(t?.batches.map((b) => b.id)).size).toBe(t?.batches.length);
    expect(t?.windows).toEqual([]);
    expect(t?.current ?? null).toBeNull();
  });

  it('opponent driver in sim-pool: every game ends, each acting seat sees only its own view (no hidden id, no rng key)', () => {
    const watched = { ...simGame, view: (s: RefState) => viewOf(s, s.prompt?.seat ?? '0'), secrets: (s: RefState) => hiddenFrom(s, s.prompt?.seat ?? '0'), leakKeys: () => ['rng'] };
    for (const driver of ['opponent', 'random', 'automa']) {
      const r = playOne(watched, CONTENT, { index: 0, seed: `o-${driver}`, driver }, undefined, { view: true });
      expect(r.error, r.error).toBeUndefined();
      expect(r.result).not.toBeNull();
    }
  });

  it('golden: a pinned view digest per action; a moved digest and a changed game are reported', async () => {
    const mod = { simGame, specs, view: (s: RefState) => viewOf(s, '0') };
    const dir = path.join(tmp, 'goldens-view');
    expect(await checkGoldens(mod, dir, io, { update: true }), lines.join('\n')).toBe(0);
    expect(await checkGoldens(mod, dir, io)).toBe(0);
    const file = fs.readdirSync(dir).find((f) => f.endsWith('.digests'));
    if (file === undefined) throw new Error('no digests written');
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    fs.writeFileSync(path.join(dir, file), text.replace(/[0-9a-f]{8}/, (d) => (d === '00000000' ? '11111111' : '00000000')));
    lines.length = 0;
    expect(await checkGoldens(mod, dir, io)).not.toBe(0);
    expect(lines.join('\n')).toMatch(/MOVED|moved/);
    fs.writeFileSync(path.join(dir, file), text);
    const other = { simGame, specs: specs.map((s) => ({ ...s, seed: `x-${s.name}` })), view: mod.view };
    expect(await checkGoldens(other, dir, io)).not.toBe(0);
  });
});

describe('reference game: game systems (K276)', () => {
  it('turn-flow: draw, main and end phases in order per seat; the last round ends the game', () => {
    const [a, id] = arranged({ hand: ['jab'] });
    expect(flowOf(a)).toMatchObject({ round: 1, seat: '0', phase: 'draw' });
    let s = answer(a, ['no']);
    expect(flowOf(s)).toMatchObject({ round: 1, seat: '0', phase: 'main' });
    s = answer(s, [id('jab')]);
    expect(flowOf(s)).toMatchObject({ round: 1, seat: '1', phase: 'draw' });
    expect(s.life[1]).toBe(10 - 2 - 1);
    // life no hit can end: the game runs to the final-round path (round 6, seat 1's end phase)
    const { options, rules } = REF.start('f1');
    let g = createGame(GAME, options, { ...rules, life: { 0: 99, 1: 99 } }, CONTENT).state;
    for (let i = 0; i < 300 && g.result === null; i++) g = answer(g, pilot(g));
    expect(rules.rounds).toBe(6);
    expect(flowOf(g)).toMatchObject({ round: 6, seat: '1', phase: 'end' });
    expect(g.result).not.toBeNull();
    expect(g.life[0] > 0 && g.life[1] > 0).toBe(true);
    expect(g.prompt).toBeNull();
  });

  it('declared trigger: Mend in play, its owner takes damage and may heal 1 (when.ts)', () => {
    let s = playCard(arranged({ hand: ['jab'], play1: ['mend'] }), 'jab');
    expect(s.prompt).toMatchObject({ kind: 'may', seat: '1' });
    expect(s.life[1]).toBe(8);
    s = answer(s, ['yes']);
    expect(s.log.filter((e) => e.type === 'healed').length).toBe(1);
    // healed to 9, then the end-phase strike: 8, and Mend asks again
    expect(s.life[1]).toBe(8);
    expect(s.prompt).toMatchObject({ kind: 'may', seat: '1' });
  });

  it('replacement: Ward in play, damage to its owner is replaced by discarding the Ward; Mend does not trigger', () => {
    const a = arranged({ hand: ['jab'], play1: ['ward', 'mend'] });
    const s = playCard(a, 'jab');
    expect(s.log.some((e) => e.type === 'warded')).toBe(true);
    expect(cardsIn(s, 'discard')).toContain(a[1]('ward'));
    // the Ward took the Jab; the end-phase strike hits (10 - 1) and Mend asks
    expect(s.life[1]).toBe(9);
    expect(s.prompt).toMatchObject({ kind: 'may', seat: '1' });
  });

  it('duration: Rally adds 2 to hits until end of turn; at the turn boundary it ends', () => {
    const s = playCard(arranged({ hand: ['rally'] }), 'rally');
    expect(s.life[1]).toBe(10 - 3);
    expect(flowOf(s)?.seat).toBe('1');
    expect(sumEffects(s, 'boost')).toBe(0);
    expect(allEffects(s).length).toBeGreaterThan(0);
    expect(allEffects(s).every((e) => e.ended === true)).toBe(true);
  });

  it('state checks: a seat at 0 life loses at once; a hand over the limit sheds its last card', () => {
    const dead = playCard(arranged({ hand: ['blow'], life: [10, 3] }), 'blow');
    expect(dead.result).toEqual({ winner: '0' });
    expect(dead.prompt).toBeNull();
    const full = answer(arranged({ hand: ['jab'] })[0], ['yes']);
    expect(cardsIn(full, 'hand:0').length).toBe(LIMIT);
    expect(full.log.filter((e) => e.type === 'shed').length).toBe(2);
  });

  it('automa: the same Bot object answers in game-store and sim-pool, from the view; its mode deck flips and reshuffles', () => {
    const ends = Array.from({ length: 6 }, (_, i) => {
      const st = mine(`m${String(i)}`);
      toEnd(st);
      return st.get().state;
    });
    expect(ends.some((s) => (s.automa?.shuffles ?? 0) > 0)).toBe(true);
    expect(ends.every((s) => s.log.some((e) => e.type === 'flip'))).toBe(true);
    const d = BOTS.normal.last();
    if (d === null) throw new Error('the automa never chose');
    expect(automaLines(d).length).toBeGreaterThan(0);
    // one shared object: a spy on BOTS.normal.choose sees the store's opponent seat and the sim driver
    const spy = vi.spyOn(BOTS.normal, 'choose');
    const st = mine('m2');
    for (let i = 0; i < 2; i++) {
      const s = st.get().state;
      const pk = pilot(s);
      spy.mockClear();
      st.answer(pk, s.prompt?.id ?? 0);
    }
    const fromStore = spy.mock.calls.length;
    expect(fromStore).toBeGreaterThan(0);
    expect(spy.mock.contexts.every((c) => c === BOTS.normal)).toBe(true);
    const at = st.get().state;
    const p = at.prompt;
    if (p === null) throw new Error('no prompt');
    const r = new DriverRng(`same|${String(p.id)}`);
    automaDriver.choose(at, legalAnswers(p, r), r);
    expect(spy.mock.calls.length).toBe(fromStore + 1);
    expect(spy.mock.contexts.at(-1)).toBe(BOTS.normal);
    expect(playOne(simGame, CONTENT, { index: 0, seed: 'spy', driver: 'automa' }).error).toBeUndefined();
    expect(spy.mock.calls.length).toBeGreaterThan(fromStore + 1);
    spy.mockRestore();
  });

  it('campaign: the result of the first scenario changes the set-up of the second', () => {
    expect(STEPS.map((x) => x.id)).toEqual(['first', 'second']);
    const won = startOf('c', { level: 'normal', bots: ['1'], scenario: 'second' }, addCount(record(emptyLog(), 'won-first'), 'bonus', BONUS, 'scenario:first'));
    const lost = startOf('c', { level: 'normal', bots: ['1'], scenario: 'second' }, emptyLog());
    expect(won.rules.life[0] - lost.rules.life[0]).toBe(BONUS);
    startCampaign('c0');
    expect(game.get().state.options.scenario).toBe('first');
    toEnd(game);
    // this seed: the player (seat 0) wins scenario 1
    expect(game.get().state.result).toEqual({ winner: '0' });
    expect(nextScenario('c2')).toBe(true);
    expect(campaignNow()?.position).toMatchObject({ done: ['scenario:first'], resolutions: { 'scenario:first': 'won' } });
    expect(campaignNow()?.log.recorded).toContain('won-first');
    expect(game.get().state.options.scenario).toBe('second');
    expect(game.get().rules.life).toEqual({ 0: 13, 1: 12 });
    toEnd(game);
    expect(nextScenario('c3')).toBe(false);
    expect(campaignNow()?.status).toBe('over');
  });

  it('settings: the obvious-answers toggle is set and read; reset restores the default', () => {
    useSettings.getState().set('obvious', false);
    expect(useSettings.getState().values.obvious).toBe(false);
    useSettings.getState().reset();
    expect(useSettings.getState().values.obvious).toBe(true);
  });

  it('set-up: the chosen seats, scenario and difficulty start the game; the screen answers the human seat', () => {
    startGame({ ...INITIAL, seats: [{ kind: 'automa' }, { kind: 'human' }], scenario: 'second', difficulty: 'hard' }, 'setup');
    const s = game.get().state;
    expect(s.options).toMatchObject({ level: 'hard', bots: ['0'], scenario: 'second' });
    expect(s.prompt?.seat).toBe('1');
    expect(game.get().history.actions.length).toBeGreaterThan(0);
    expect(s.rules.life).toEqual({ 0: 12, 1: 10 });
  });
});
