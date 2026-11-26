import { expect, it } from 'vitest';
import {
  begin, campaignRoster, changeCampaignRoster, count, emptyLog, end, linear, newCampaign, readSave,
  record, retry, scheduleCalendarEntry, startCalendarDay, type CampaignLog, type Instruction, type Step,
} from '../components/campaign/index.ts';
import { applyAction, createGame, hashState, replay, type AnswerAction } from '../components/engine-core/index.ts';
import { COUNTER, type Counter } from '../components/engine-core/fake/counter.ts';

const bringGear: Instruction = { id: 'gear', text: 'Stock the outpost.', cite: 'synthetic 1', ops: [{ op: 'add', key: 'target', n: 1 }] };
const instructions = { gear: bringGear };
const box = { gear: 2 };
const outpost: Step = { kind: 'scenario', id: 'outpost' };
const summit: Step = { kind: 'scenario', id: 'summit' };

function setup(log: CampaignLog, seed: number) {
  const activeGear = campaignRoster(log).filter(p => p.status === 'active').flatMap(p => p.deck);
  const options = { seed: String(seed) }, rules = { target: count(log, 'target') }, content = { cards: activeGear.length };
  const { state } = createGame(COUNTER, options, rules, content);
  return { state, options, rules, content };
}

it('runs an engine step from the calendar and roster and restores the same scenario inputs on retry', () => {
  let log = changeCampaignRoster(emptyLog(), [{ kind: 'join', player: 'left', deck: ['gear'] }], { box });
  log = startCalendarDay(scheduleCalendarEntry(log, 1, 'gear'), 1, instructions).log;
  const first = begin(newCampaign('expedition', '1', outpost, 47, log));
  const session = setup(first.log, 47);
  const action: AnswerAction = { kind: 'answer', promptId: session.state.prompt?.id ?? 0, picks: ['draw'] };
  const won = applyAction<Counter>(COUNTER, session.state, action, session.content).state;
  expect(session.rules.target).toBe(1);
  expect(session.content.cards).toBe(1);
  expect(won.result).toEqual({ kind: 'won' });
  const nextLog = changeCampaignRoster(record(first.log, 'outpost-held'), [
    { kind: 'join', player: 'right', deck: ['gear'] },
  ], { box });
  const next = end(first.save, { log: nextLog, outcome: 'win' }, linear([outpost, summit]));
  const stored = readSave(JSON.parse(JSON.stringify(next)) as unknown, '1');
  if (!stored) throw new Error('fixture save did not load');
  expect(stored.position.step).toEqual(summit);
  expect(setup(begin(stored).log, 48).content.cards).toBe(2);

  const retried = begin(retry(stored), 47);
  expect(startCalendarDay(retried.log, 1, instructions).ran).toEqual([]);
  const restored = setup(retried.log, 47);
  expect(restored.rules).toEqual(session.rules);
  expect(restored.content).toEqual(session.content);
  const played = replay(COUNTER, restored.options, restored.rules, [action], restored.content);
  expect(played.ok).toBe(true);
  expect(played.hash).toBe(hashState(won));
});
