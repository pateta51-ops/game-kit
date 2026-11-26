import assert from 'node:assert/strict';
import type { CampaignLog, CampaignSave } from '../kit/campaign/index.ts';
import { hashState } from '../kit/engine-core/index.ts';
import { CONFIGS, continueCampaign, finishScenario, newContinuation, restoreContinuation, retryContinuation, serializeContinuation, type ContinuedScenario } from '../src/engine/campaign-continuation.ts';

const finish = (session: ContinuedScenario) => {
  for (let choices = 0; session.store.get().state.result === null && choices < 20; choices++) {
    const prompt = session.store.get().state.prompt;
    assert(prompt);
    const pick = prompt.options.find(option => option.enabled && option.id === 'yes') ?? prompt.options.find(option => option.enabled);
    assert(pick);
    assert(session.store.answer([pick.id], prompt.id));
  }
  assert(session.store.get().state.result, 'scenario did not reach an actual terminal result');
};

const observations = CONFIGS.map(config => {
  const snapshots: string[] = [], rejected: string[] = [];
  const roundTrip = (name: string, campaign: CampaignSave, session?: ContinuedScenario) => {
    const archive = serializeContinuation(config, campaign, session, session ? '2026-01-01T00:00:00.000Z' : undefined);
    const restored = restoreContinuation(config, archive);
    if (session) {
      assert.equal(restored.status, 'playing');
      if (restored.status !== 'playing') throw new Error('active archive lost its scenario');
      assert.deepEqual(restored.session.campaign, campaign);
      assert.equal(hashState(restored.session.store.get().state), hashState(session.store.get().state));
    } else {
      assert.equal(restored.status, 'between');
      if (restored.status !== 'between') throw new Error('idle archive started a scenario');
      assert.deepEqual(restored.campaign, campaign);
    }
    snapshots.push(name);
    return archive;
  };
  const corrupt = (archive: string, name: string, change: (campaign: CampaignSave) => void, session?: ContinuedScenario, expected = /campaign progress/) => {
    const data = JSON.parse(archive) as { campaign: CampaignSave };
    change(data.campaign);
    const before = JSON.stringify(data.campaign);
    assert.throws(() => restoreContinuation(config, JSON.stringify(data)), expected, name);
    assert.throws(() => serializeContinuation(config, data.campaign, session ? { ...session, campaign: data.campaign } : undefined, session ? '2026-01-01T00:00:00.000Z' : undefined), expected, name + ' serialized');
    assert.equal(JSON.stringify(data.campaign), before, 'rejected progress changed its input');
    rejected.push(name);
  };
  const calendarKey = 'game-kit:campaign-between-sessions';
  const calendar = (log: CampaignLog) => {
    const state = log[calendarKey];
    assert(state?.calendar);
    return { state, calendar: state.calendar };
  };
  const corruptCalendar = (archive: string, name: string, change: (campaign: CampaignSave) => void, session?: ContinuedScenario) =>
    corrupt(archive, name, change, session, /campaign calendar/);
  const play = (campaign: CampaignSave, day: number) => {
    const result = continueCampaign(config, campaign, { day, answers: { route: 'rest' } });
    if (result.status !== 'playing') throw new Error('approved continuation did not start');
    return result.session;
  };

  const initial = newContinuation(config, 45);
  const initialArchive = roundTrip('new-campaign', initial);
  const arrival = play(initial, 1);
  roundTrip('active-arrival', arrival.campaign, arrival);
  const activeRetry = retryContinuation(config, arrival.campaign);
  assert.deepEqual(activeRetry.position.done, []);
  assert.equal(activeRetry.history.length, 0);
  roundTrip('retry-active-arrival', activeRetry);
  const playedArrival = play(activeRetry, 1);
  finish(playedArrival);
  const pending = finishScenario(config, playedArrival);
  const pendingArchive = roundTrip('pending-crossing', pending);
  corruptCalendar(pendingArchive, 'ready-without-calendar-effects', save => {
    const { state, calendar: saved } = calendar(save.log);
    save.log[calendarKey] = { ...state, calendar: { ...saved, startedThrough: 2 } };
    save.log.recorded.push('ready');
    save.log.order.push('ready');
  });
  corruptCalendar(pendingArchive, 'reordered-calendar-entries', save => {
    const { state, calendar: saved } = calendar(save.log);
    save.log[calendarKey] = { ...state, calendar: { ...saved, entries: [...saved.entries].reverse() } };
  });
  const arrivalRetry = retryContinuation(config, pending);
  assert.equal(arrivalRetry.history.length, 1, 'retry must retain completed attempt history');
  assert.deepEqual(arrivalRetry.position.done, []);
  assert.deepEqual(arrivalRetry.position.resolutions, {});
  roundTrip('retry-completed-arrival', arrivalRetry);
  const arrivalAgain = play(arrivalRetry, 1);
  roundTrip('active-repeated-arrival', arrivalAgain.campaign, arrivalAgain);
  finish(arrivalAgain);
  const afterRepeatedArrival = finishScenario(config, arrivalAgain);
  assert.deepEqual(afterRepeatedArrival.history.map(attempt => attempt.step.id), ['arrival', 'arrival']);
  roundTrip('repeated-arrival-complete', afterRepeatedArrival);
  const crossing = play(afterRepeatedArrival, 2);
  const crossingArchive = roundTrip('active-crossing', crossing.campaign, crossing);
  corruptCalendar(crossingArchive, 'invalid-route-bonus', save => { save.log.counts['lifeBonus'] = config.restBonus + 1; }, crossing);
  corruptCalendar(crossingArchive, 'route-after-ready', save => {
    save.log.order = ['arrived', 'finished-arrival', 'ready', 'rested'];
  }, crossing);
  corruptCalendar(crossingArchive, 'premature-snapshot-cursor', save => {
    assert(save.attempt);
    const log = save.attempt.logBefore;
    const { state, calendar: saved } = calendar(log);
    log[calendarKey] = { ...state, calendar: { ...saved, startedThrough: 1 } };
  }, crossing);

  corrupt(crossingArchive, 'missing-arrival-completion', save => { save.position.done = []; }, crossing);
  corrupt(crossingArchive, 'premature-crossing-completion', save => { save.position.done.push('scenario:crossing'); }, crossing);
  corrupt(crossingArchive, 'duplicate-completion', save => { save.position.done.push('scenario:arrival'); }, crossing);
  corrupt(crossingArchive, 'active-step-rewind', save => { save.position.step = { kind: 'scenario', id: 'arrival' }; }, crossing);
  corrupt(crossingArchive, 'active-status-over', save => { save.status = 'over'; }, crossing);
  corrupt(crossingArchive, 'attempt-step-rewind', save => { assert(save.attempt); save.attempt.step = { kind: 'scenario', id: 'arrival' }; }, crossing);
  corrupt(crossingArchive, 'attempt-return-detour', save => { assert(save.attempt); save.attempt.step.then = { kind: 'scenario', id: 'arrival' }; }, crossing);
  corrupt(crossingArchive, 'attempt-seed-mismatch', save => { assert(save.attempt); save.attempt.seed++; }, crossing);
  corrupt(crossingArchive, 'missing-history', save => { save.history = []; }, crossing);
  corrupt(crossingArchive, 'unknown-history-step', save => { const first = save.history[0]; assert(first); first.step.id = 'unknown'; }, crossing);
  corrupt(crossingArchive, 'missing-resolution', save => { delete save.position.resolutions['scenario:arrival']; }, crossing);
  corrupt(crossingArchive, 'conflicting-resolution', save => { save.position.resolutions['scenario:arrival'] = save.position.resolutions['scenario:arrival'] === 'won' ? 'lost' : 'won'; }, crossing);
  corrupt(crossingArchive, 'uncompleted-resolution', save => { save.position.resolutions['scenario:crossing'] = 'won'; }, crossing);
  corrupt(initialArchive, 'new-campaign-pretends-over', save => { save.status = 'over'; save.position.step = null; });
  corrupt(pendingArchive, 'pending-step-null', save => { save.position.step = null; });

  const crossingRetry = retryContinuation(config, crossing.campaign);
  assert.deepEqual(crossingRetry.position.done, ['scenario:arrival']);
  roundTrip('retry-active-crossing', crossingRetry);
  const replayedCrossing = play(crossingRetry, 2);
  finish(replayedCrossing);
  const complete = finishScenario(config, replayedCrossing);
  const completeArchive = roundTrip('completed-campaign', complete);
  corruptCalendar(completeArchive, 'inconsistent-retry-stock', save => {
    const crossingAttempt = save.history.find(attempt => attempt.step.id === 'crossing');
    assert(crossingAttempt);
    crossingAttempt.logBefore.counts['supplies'] = 0;
  });
  assert.equal(complete.status, 'over');
  assert.equal(complete.position.step, null);
  corrupt(completeArchive, 'completed-status-active', save => { save.status = 'active'; });
  corrupt(completeArchive, 'reversed-completions', save => { save.position.done.reverse(); });
  corrupt(completeArchive, 'history-rewinds-after-crossing', save => { save.history.reverse(); });
  const completedRetry = retryContinuation(config, complete);
  assert.deepEqual(completedRetry.history.map(attempt => attempt.step.id), ['arrival', 'arrival', 'crossing']);
  assert.deepEqual(completedRetry.position.done, ['scenario:arrival']);
  assert.equal(completedRetry.position.resolutions['scenario:crossing'], undefined);
  roundTrip('retry-completed-crossing', completedRetry);
  const again = play(completedRetry, 2);
  roundTrip('active-repeated-crossing', again.campaign, again);
  finish(again);
  const repeatedComplete = finishScenario(config, again);
  assert.deepEqual(repeatedComplete.history.map(attempt => attempt.step.id), ['arrival', 'arrival', 'crossing', 'crossing']);
  assert.equal(repeatedComplete.status, 'over');
  assert.equal(repeatedComplete.position.step, null);
  roundTrip('repeated-crossing-complete', repeatedComplete);
  return { configuration: config.id, snapshots, rejected, finalStatus: repeatedComplete.status, retainedAttemptHistory: repeatedComplete.history.map(attempt => attempt.step.id) };
});
console.log(JSON.stringify({ status: 'passed', observations }, null, 2));
