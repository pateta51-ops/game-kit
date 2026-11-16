// K205 contract test: the reference game through engine-core, sim-pool, replay-cli, saves, settings, app-frame and prompt-host.
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHash, routeHref } from '../kit/app-frame/index';
import { replay, setInvariantChecking, type AnswerAction } from '../kit/engine-core/index';
import { autoAnswer } from '../kit/prompt-host/index';
import { expectVerbs, validateEffect } from '../kit/card-language/index';
import { checkGoldens, recordGames, replayGames } from '../kit/replay-cli/golden';
import type { Io } from '../kit/replay-cli/replay';
import { playOne, runGames, type GameSpec } from '../kit/sim-pool/index';
import { applyAction, cardText, CONTENT, createGame, GAME, greedyPicks, hashState, newHistory, recordAction, RULES, VERBS, viewOf, type History, type Ref, type RefState } from '../src/engine/api';
import { simGame, specs } from '../src/engine/sim';
import { saves, useGame, useSettings } from '../src/ui/store';

setInvariantChecking(true);
const greedy = (s: RefState): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? 0, picks: greedyPicks(viewOf(s, s.prompt?.seat ?? 0)) });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-'));
const lines: string[] = [];
const io: Io = { out: (l) => lines.push(l), err: (l) => lines.push(l), read: (p) => fs.readFileSync(p, 'utf8'), write: (p, t) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, t);
  }, exists: (p) => fs.existsSync(p), list: (d) => (fs.existsSync(d) ? fs.readdirSync(d) : []), load: (p) => import(p) };

describe('reference game (K205)', () => {
  it('engine-core: plays to a result; replay of its actions gives the same state', () => {
    let { state } = createGame(GAME, { seed: 'r1' }, RULES, CONTENT);
    const actions: AnswerAction[] = [];
    const kinds = new Set<string>();
    while (state.result === null && state.prompt !== null) {
      kinds.add(state.prompt.kind);
      const a = greedy(state);
      actions.push(a);
      state = applyAction(GAME, state, a, CONTENT).state;
    }
    expect(state.result).not.toBeNull();
    expect([...kinds]).toEqual(expect.arrayContaining(['may', 'pick']));
    const r = replay(GAME, { seed: 'r1' }, RULES, actions, CONTENT);
    expect(r.ok && hashState(r.state)).toBe(hashState(state));
  });

  it('card-language: every verb has a handler and words; every card effect is valid; the words come from the same data', () => {
    expectVerbs(VERBS, [{ op: 'score', points: 2 }, { op: 'wild', max: 3 }]);
    expect(Object.values(CONTENT.effects).flatMap((e) => validateEffect(VERBS, e))).toEqual([]);
    expect(validateEffect(VERBS, [{ op: 'score', points: 0 }])).not.toEqual([]);
    expect([cardText(0), cardText(4)]).toEqual(['Choose 1 to 3 and score that.', 'Score 4.']);
  });

  it('opponents decide from their own view: the hidden hand never changes the choice', () => {
    const { state } = createGame(GAME, { seed: 'v1' }, RULES, CONTENT);
    const other: RefState = { ...state, hands: [state.hands[0] ?? [], [5, 5, 5]] };
    expect(viewOf(other, 0)).toEqual(viewOf(state, 0));
    expect(greedyPicks(viewOf(other, 0))).toEqual(greedyPicks(viewOf(state, 0)));
  });

  it('sim-pool: a batch on two workers ends every game, the same as in this thread', async () => {
    const list: GameSpec[] = Array.from({ length: 16 }, (_, i) => ({ index: i, seed: `b${String(i)}`, driver: i % 2 ? 'random' : 'greedy' }));
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

  it('saves: save mid-prompt, load, resume the same prompt; autosave and file round-trip', async () => {
    let h: History<Ref> = newHistory<Ref>({ seed: 's1' }, RULES);
    let state = createGame(GAME, { seed: 's1' }, RULES, CONTENT).state;
    while (state.prompt?.kind !== 'may') {
      const r = recordAction(GAME, h, greedy(state), CONTENT);
      h = r.history;
      state = r.state ?? state;
    }
    await saves.saveNamed('mid', h);
    const [key, stored] = (await saves.listNamed())[0] ?? [];
    expect(key).toBeDefined();
    const back = saves.restore(stored ?? { name: '', save: saves.saveOf(h) });
    if (!back.ok) throw new Error(back.error);
    expect(hashState(back.state)).toBe(hashState(state));
    expect(back.state.prompt).toEqual(state.prompt);
    expect(recordAction(GAME, saves.historyOf(back.save), greedy(back.state), CONTENT).ok).toBe(true);
    await saves.writeAutosave(h, 'auto');
    expect((await saves.readAutosave())?.[1].save.actions.length).toBe(h.actions.length);
    const imported = await saves.importNamed(saves.exportText({ name: 'mid', save: saves.saveOf(h) }), 'copy');
    expect(imported.ok).toBe(true);
  });

  it('settings and the store: the chosen seat is the one asked; the other seat answers itself', () => {
    useSettings.getState().set('seat', 1);
    useGame.getState().fresh('seat');
    expect(useGame.getState().state.prompt?.seat).toBe(1);
    expect(useGame.getState().history.actions.length).toBeGreaterThan(0);
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
