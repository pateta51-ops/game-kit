import { useSyncExternalStore } from 'react';
import { makeSaves } from '../../kit/saves/index.ts';
import { createSettingsStore, type SettingsSchema } from '../../kit/settings/index.ts';
import { autoAnswer } from '../../kit/prompt-host/index.ts';
import { createGameStore, type GameSnap } from '../../kit/game-store/index.ts';
import { defaultSetup, type Setup, type SetupSpec } from '../../kit/screens/index.ts';
import { begin, emptyLog, end, newCampaign, type CampaignLog, type CampaignSave } from '../../kit/campaign/index.ts';
import { CARD_SETUP, CONTENT, GAME, logAfter, NEXT, playerOf, REF, SEATS, startOf, STEPS, type Level, type Ref, type RefView, type Seat } from '../engine/api.ts';

export const SCHEMA = {
  storageKey: '{{id}}-settings',
  sections: [{ id: 'play', title: 'Play', settings: [{ kind: 'toggle', key: 'obvious', label: 'Answer obvious questions', default: true }] }],
} as const satisfies SettingsSchema;
export const useSettings = createSettingsStore(SCHEMA);
export const saves = makeSaves({ game: GAME, content: CONTENT, database: '{{id}}', filePrefix: '{{id}}' });

export const SPEC: SetupSpec = {
  ...(CARD_SETUP.fixedSeats ? {} : { seats: { min: 2, max: 2, kinds: [{ value: 'human', label: 'Human' }, { value: 'automa', label: 'Automa' }] } }),
  scenarios: CARD_SETUP.fixedSeats ? [{ value: 'first', label: 'First' }] : [{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }],
  difficulties: [{ value: 'normal', label: 'Normal' }, { value: 'easy', label: 'Easy' }, { value: 'hard', label: 'Hard' }],
};
export const INITIAL: Setup = { ...defaultSetup(SPEC), difficulty: CARD_SETUP.level, seats: [{ kind: 'human' }, { kind: 'automa' }] };
let setup = INITIAL;
let log: CampaignLog = emptyLog();
let campaign: CampaignSave | null = null;
const botsOf = (x: Setup): Seat[] => SEATS.filter((_, i) => x.seats[i]?.kind === 'automa');
// the screen answers the first human seat; every other seat is the automa
export const mySeat = (): Seat => playerOf(botsOf(setup));
export const campaignNow = (): CampaignSave | null => campaign;

// the one game store: started from the set-up and the campaign log, forced answers from the setting, the other seat answered by the automa from its own view, autosave
export const game = createGameStore(
  { ...REF, start: (seed) => startOf(seed, { level: (setup.difficulty ?? 'normal') as Level, bots: botsOf(setup), scenario: setup.scenario ?? 'first' }, log), forced: (p) => autoAnswer(p, useSettings.getState().values.obvious) },
  { seat: mySeat, saves, saveName: () => '{{name}}', undo: 'free' },
);
export const useGame = <T = GameSnap<Ref, RefView>>(pick: (s: GameSnap<Ref, RefView>) => T = (s) => s as T): T => useSyncExternalStore(game.subscribe, () => pick(game.get()));

export function startGame(x: Setup, seed = String(Date.now())): void {
  if (CARD_SETUP.fixedSeats && (x.seats.length !== 2 || x.seats[0]?.kind !== 'human' || x.seats[1]?.kind !== 'automa' || x.scenario !== 'first')) throw new Error('This composition requires one human, one automa and the first scenario');
  setup = x;
  campaign = null;
  log = emptyLog();
  game.fresh(seed);
}
const play = (c: CampaignSave, seed: string): void => {
  const b = begin(c);
  campaign = b.save;
  log = b.log;
  setup = { ...setup, scenario: b.save.position.step?.id ?? 'first' };
  game.fresh(seed);
};
export const startCampaign = (seed = String(Date.now())): void => play(newCampaign('{{id}}', '1', STEPS[0] ?? { kind: 'scenario', id: 'first' }, 1), seed);
/** After a scenario ends: its result goes into the log and the next scenario starts from it. False when there is none. */
export function nextScenario(seed = String(Date.now())): boolean {
  const s = game.get().state;
  if (campaign?.attempt === undefined || s.result === null) return false;
  const c = end(campaign, { log: logAfter(log, s), resolution: s.result.winner === mySeat() ? 'won' : 'lost' }, NEXT);
  campaign = c;
  if (c.status !== 'active') return false;
  play(c, seed);
  return true;
}
