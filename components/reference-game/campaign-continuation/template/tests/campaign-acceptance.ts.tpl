import assert from 'node:assert/strict';
import { campaignRoster, changeCampaignRoster, count, countHistory, has, type CampaignSave } from '../kit/campaign/index.ts';
import { cardsIn } from '../kit/card-zones/index.ts';
import { hashState } from '../kit/engine-core/index.ts';
import { CONFIGS, VARIANT, continueCampaign, editContinuationRoster, finishScenario, newContinuation, restoreContinuation, retryContinuation, serializeContinuation, type ContinuedScenario, type ContinuationLog } from '../src/engine/campaign-continuation.ts';

const expected = {
  'camp-a': { life: 14, bonus: 2, first: { 0: ['jab', 'jab', 'blow', 'ward'], 1: ['jab', 'blow', 'rally', 'rally'] },
    second: { 0: ['jab', 'blow', 'blow', 'mend'], 1: ['jab', 'jab', 'jab', 'ward'] }, free: { jab: 2, blow: 0, rally: 2, ward: 0, mend: 0 } },
  'camp-b': { life: 18, bonus: 4, first: { 0: ['jab', 'blow', 'rally', 'ward'], 1: ['jab', 'jab', 'blow', 'blow'] },
    second: { 0: ['blow', 'blow', 'rally', 'mend'], 1: ['jab', 'rally', 'rally', 'ward'] }, free: { jab: 3, blow: 1, rally: 0, ward: 0, mend: 0 } },
} as const;

const atomic = (save: CampaignSave, action: () => unknown, message: RegExp) => {
  const before = JSON.stringify(save);
  assert.throws(action, message);
  assert.equal(JSON.stringify(save), before, 'refused command partially changed the campaign');
};
const inventory = (session: ContinuedScenario) => {
  const all = Object.values(session.store.get().state.zones).flatMap(zone => zone.cards);
  assert.equal(all.length, 8);
  assert.equal(new Set(all).size, 8);
  assert.deepEqual([...all].sort(), Object.keys(session.definition.content.cards).sort());
};
const hands = (session: ContinuedScenario, wanted: { readonly 0: readonly string[]; readonly 1: readonly string[] }) => {
  assert.equal(cardsIn(session.store.get().state, 'deck').length, 0);
  for (const seat of ['0', '1'] as const) assert.deepEqual(cardsIn(session.store.get().state, 'hand:' + seat).map(id => session.definition.content.cards[id]).sort(), [...wanted[seat]].sort());
  inventory(session);
};
const act = (session: ContinuedScenario) => {
  const prompt = session.store.get().state.prompt;
  assert(prompt, 'no playable prompt');
  assert.equal(prompt.seat, '0', 'automated seat was left for the human');
  const pick = prompt.options.find(option => option.enabled && option.id === 'yes') ?? prompt.options.find(option => option.enabled);
  assert(pick);
  assert.equal(session.store.answer([pick.id], prompt.id), true, session.store.get().error ?? 'human action failed');
  assert.equal(session.store.get().error, null);
  inventory(session);
};
const terminal = (session: ContinuedScenario) => {
  let choices = 0;
  while (session.store.get().state.result === null && choices++ < 20) act(session);
  assert(session.store.get().state.result, 'two-round scenario did not terminate');
  assert(session.store.get().state.log.some(event => event.type === 'played' && event.seat === '0'));
  assert(session.store.get().state.log.some(event => event.type === 'played' && event.seat === '1'));
  return choices;
};

const observations = CONFIGS.map(config => {
  const want = expected[config.id];
  const initial = newContinuation(config, 45);
  const original = JSON.stringify(initial);
  atomic(initial, () => continueCampaign(config, initial, { day: 2 }), /day does not match/);
  const outOfOrder = { ...initial, position: { ...initial.position, step: { kind: 'scenario' as const, id: 'crossing' } } };
  atomic(outOfOrder, () => continueCampaign(config, outOfOrder, { day: 2 }), /campaign progress/);
  const first = continueCampaign(config, initial, { day: 1 });
  assert.equal(first.status, 'playing');
  if (first.status !== 'playing') throw new Error('arrival did not start');
  assert.deepEqual(first.ran, ['arrival']);
  assert.deepEqual(first.session.players, { 0: 'lead', 1: 'partner' });
  hands(first.session, want.first);
  assert.equal(JSON.stringify(initial), original);
  atomic(first.session.campaign, () => finishScenario(config, first.session), /actual terminal result/);
  const arrivalChoices = terminal(first.session);
  let pending = finishScenario(config, first.session);
  assert.equal(pending.position.step?.id, 'crossing');
  assert.equal(pending.history.length, 1);
  assert(has(pending.log, 'finished-arrival'));
  const journalBefore = (pending.log as ContinuationLog).journal;
  const gameFields = (pending.log as ContinuationLog).betweenSessions;

  pending = editContinuationRoster(config, pending, [{ kind: 'sitOut', player: 'partner' }, { kind: 'return', player: 'reserve' }]);
  assert.deepEqual(campaignRoster(pending.log).map(player => [player.id, player.status]), [['lead', 'active'], ['partner', 'sitting-out'], ['reserve', 'active']]);
  assert.deepEqual(campaignRoster(pending.log).find(player => player.id === 'partner')?.deck, config.decks.partner, 'absence released copies');
  atomic(pending, () => editContinuationRoster(config, pending, [{ kind: 'return', player: 'lead' }]), /not sitting out/);
  atomic(pending, () => editContinuationRoster(config, pending, [{ kind: 'sitOut', player: 'lead' }]), /active lead/);
  const exchangedLead = config.decks.lead.map(card => card === 'ward' ? 'mend' : card);
  const exchangedReserve = config.decks.reserve.map(card => card === 'mend' ? 'ward' : card);
  atomic(pending, () => editContinuationRoster(config, pending, [{ kind: 'setDeck', player: 'lead', deck: exchangedLead }]), /another copy of mend/);
  pending = editContinuationRoster(config, pending, [{ kind: 'setDeck', player: 'lead', deck: exchangedLead }, { kind: 'setDeck', player: 'reserve', deck: exchangedReserve }]);
  const upgraded = [...exchangedLead];
  upgraded[upgraded.indexOf('jab')] = 'blow';
  atomic(pending, () => editContinuationRoster(config, pending, [{ kind: 'setDeck', player: 'lead', deck: upgraded }]), /another copy of blow/);
  const between = restoreContinuation(config, serializeContinuation(config, pending));
  assert.equal(between.status, 'between');
  if (between.status !== 'between') throw new Error('between-session save became a live scenario');
  assert.deepEqual(between.campaign, pending);
  pending = between.campaign;
  const edits = [{ kind: 'retire' as const, player: 'partner' }, { kind: 'setDeck' as const, player: 'lead', deck: upgraded }];
  const beforeChoice = JSON.stringify(pending);
  for (const answers of [{}, { route: 'unknown' }]) {
    const waiting = continueCampaign(config, pending, { day: 2, answers, edits });
    assert.equal(waiting.status, 'choice');
    if (waiting.status !== 'choice') throw new Error('required route did not block continuation');
    assert.equal(waiting.ask.id, 'route');
    assert.equal(waiting.campaign, pending);
    assert.equal(JSON.stringify(pending), beforeChoice, 'unresolved choice partially committed');
    assert.equal(count(pending.log, 'supplies'), 0);
    assert.equal(campaignRoster(pending.log).find(player => player.id === 'partner')?.status, 'sitting-out');
  }
  atomic(pending, () => continueCampaign(config, pending, { day: 2, answers: { route: 'rest' }, edits: [{ kind: 'setDeck', player: 'lead', deck: ['ward', 'ward', 'jab', 'jab'] }] }), /another copy of ward/);
  const pressed = continueCampaign(config, pending, { day: 2, answers: { route: 'press' }, edits });
  assert.equal(pressed.status, 'playing');
  if (pressed.status !== 'playing') throw new Error('press route did not start');
  assert.equal(pressed.session.store.get().state.life[0], want.life - want.bonus);
  assert.equal(count(pressed.session.campaign.log, 'lifeBonus'), 0);
  act(pressed.session);
  const second = continueCampaign(config, pending, { day: 2, answers: { route: 'rest' }, edits });
  assert.equal(second.status, 'playing');
  if (second.status !== 'playing') throw new Error('crossing did not start');
  assert.equal(second.calendar, 'processed');
  assert.deepEqual(second.ran, ['stock', 'route', 'ready']);
  assert.deepEqual(second.session.players, { 0: 'lead', 1: 'reserve' });
  assert.equal(second.session.store.get().state.life[0], want.life, 'calendar bonus did not reach live scenario life');
  assert.equal(count(second.session.campaign.log, 'lifeBonus'), want.bonus);
  assert.equal(count(second.session.campaign.log, 'supplies'), 1);
  assert.equal(countHistory(second.session.campaign.log, 'supplies').length, 1);
  assert(has(second.session.campaign.log, 'ready'));
  assert.deepEqual(second.session.free, want.free);
  assert.deepEqual(campaignRoster(second.session.campaign.log).find(player => player.id === 'partner'), { id: 'partner', status: 'retired', deck: [] });
  hands(second.session, want.second);
  const secondStart = hashState(second.session.store.get().state);
  const startLog = structuredClone(second.session.campaign.log);
  atomic(second.session.campaign, () => continueCampaign(config, second.session.campaign, { day: 2, answers: { route: 'rest' } }), /already in progress/);
  const stateBeforeRefusal = hashState(second.session.store.get().state);
  assert.equal(second.session.store.answer(['not-a-card'], second.session.store.get().state.prompt?.id ?? -1), false);
  assert.equal(hashState(second.session.store.get().state), stateBeforeRefusal);
  act(second.session);
  assert(second.session.store.get().state.result !== null || second.session.store.get().state.log.some(event => event.type === 'played' && event.seat === '1'), 'crossing lacked an automated response');
  const archive = serializeContinuation(config, second.session.campaign, second.session, '2026-01-01T00:00:00.000Z');
  const restored = restoreContinuation(config, archive);
  assert.equal(restored.status, 'playing');
  if (restored.status !== 'playing') throw new Error('mid-scenario archive lost live play');
  assert.equal(hashState(restored.session.store.get().state), hashState(second.session.store.get().state));
  assert.deepEqual(restored.session.players, second.session.players);
  assert.deepEqual(restored.session.campaign.log, startLog);
  inventory(restored.session);
  const other = CONFIGS.find(value => value.id !== config.id);
  assert(other);
  assert.throws(() => restoreContinuation(other, archive), /variant or configuration/);
  const raw = JSON.parse(archive) as { variant: string; campaign: CampaignSave };
  assert.throws(() => restoreContinuation(config, JSON.stringify({ ...raw, variant: 'different-variant' })), /variant or configuration/);
  assert.throws(() => restoreContinuation(config, JSON.stringify({ ...raw, campaign: { ...raw.campaign, log: { ...raw.campaign.log, journal: ['changed after scenario start'] } } })), /scenario-start snapshot/);
  const otherSeed = restoreContinuation(config, archive);
  if (otherSeed.status !== 'playing') throw new Error('archive did not restore');
  otherSeed.session.store.fresh('unrelated-seed');
  assert.throws(() => serializeContinuation(config, otherSeed.session.campaign, otherSeed.session, '2026-01-01T00:00:00.000Z'), /setup does not match/);
  const badLog = changeCampaignRoster(raw.campaign.log, [{ kind: 'setDeck', player: 'lead', deck: ['ward', 'ward', 'jab', 'jab'] }], { box: { ...config.box, ward: 10, jab: 20 } });
  assert.throws(() => restoreContinuation(config, JSON.stringify({ ...raw, campaign: { ...raw.campaign, log: badLog } })), /another copy of ward/);
  const oldAttempt = raw.campaign.history[0];
  assert(oldAttempt);
  const badSnapshot = changeCampaignRoster(oldAttempt.logBefore, [{ kind: 'setDeck', player: 'lead', deck: ['ward', 'ward', 'jab', 'jab'] }], { box: { ...config.box, ward: 10, jab: 20 } });
  assert.throws(() => restoreContinuation(config, JSON.stringify({ ...raw, campaign: { ...raw.campaign, history: [{ ...oldAttempt, logBefore: badSnapshot }] } })), /another copy of ward/);
  const crossingChoices = terminal(restored.session);
  const finished = finishScenario(config, restored.session);
  assert.equal(finished.status, 'over');
  assert.equal(finished.history.length, 2);
  assert(has(finished.log, 'finished-crossing'));
  const retried = retryContinuation(config, finished);
  assert.equal(retried.position.step?.id, 'crossing');
  assert.deepEqual(retried.log, startLog, 'retry retained later scenario effects or lost its start snapshot');
  assert.deepEqual((retried.log as ContinuationLog).journal, journalBefore);
  assert.deepEqual((retried.log as ContinuationLog).betweenSessions, gameFields);
  assert.equal(has(retried.log, 'finished-crossing'), false);
  atomic(retried, () => editContinuationRoster(config, retried, [{ kind: 'retire', player: 'partner' }]), /unavailable roster player/);
  atomic(retried, () => continueCampaign(config, retried, { day: 2, edits }), /already processed/);
  const retryPlay = continueCampaign(config, retried, { day: 2 });
  assert.equal(retryPlay.status, 'playing');
  if (retryPlay.status !== 'playing') throw new Error('retry did not start');
  assert.equal(retryPlay.calendar, 'noop');
  assert.deepEqual(retryPlay.ran, []);
  assert.equal(count(retryPlay.session.campaign.log, 'supplies'), 1);
  assert.equal(hashState(retryPlay.session.store.get().state), secondStart, 'retry did not reconstruct the same playable setup');
  hands(retryPlay.session, want.second);
  act(retryPlay.session);
  return { configuration: config.id, configurationDigest: second.session.configDigest, arrivalTerminal: first.session.store.get().state.result,
    crossingTerminal: restored.session.store.get().state.result, arrivalHumanChoices: arrivalChoices, crossingHumanChoices: crossingChoices + 1,
    activePlayers: second.session.players, physicalInstances: 8, calendarOrder: second.ran, retryCalendar: retryPlay.calendar,
    milestone: 'human-card-and-automated-response', restore: 'replayed-matching-state', retry: 'scenario-start-snapshot', controls: 'atomic-refusals-passed' };
});
console.log(JSON.stringify({ version: 1, variant: VARIANT, status: 'passed', observations }, null, 2));
