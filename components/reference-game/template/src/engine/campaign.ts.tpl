// The campaign (kit campaign): two scenarios in a line; winning the first records it in the log and gives the player 3
// more life in the second. The game reads only the frozen log `begin` hands it.
import { addCount, count, linear, record, type CampaignLog, type Step } from '../../kit/campaign/index.ts';
import { SEATS, type Level, type Ref, type RefState, type Seat } from './rules.ts';

export const STEPS: readonly Step[] = [{ kind: 'scenario', id: 'first' }, { kind: 'scenario', id: 'second' }];
export const NEXT = linear(STEPS);
const SCENARIOS: Readonly<Record<string, { life: number; foe: number; rounds: number }>> = { first: { life: 10, foe: 10, rounds: 6 }, second: { life: 10, foe: 12, rounds: 6 } };
export const BONUS = 3;
export interface Start { readonly level: Level; readonly bots: readonly Seat[]; readonly scenario: string }
export const playerOf = (bots: readonly Seat[]): Seat => SEATS.find((x) => !bots.includes(x)) ?? '0';

export function startOf(seed: string, st: Start, log: CampaignLog): { options: Ref['options']; rules: Ref['rules'] } {
  const sc = SCENARIOS[st.scenario] ?? { life: 10, foe: 10, rounds: 6 };
  const me = playerOf(st.bots);
  const mine = sc.life + count(log, 'bonus');
  return { options: { seed, level: st.level, bots: st.bots, scenario: st.scenario }, rules: { life: { 0: me === '0' ? mine : sc.foe, 1: me === '1' ? mine : sc.foe }, rounds: sc.rounds } };
}
export const logAfter = (log: CampaignLog, s: RefState): CampaignLog =>
  s.result?.winner === playerOf(s.options.bots) ? addCount(record(log, `won-${s.options.scenario}`), 'bonus', BONUS, `scenario:${s.options.scenario}`) : log;
