import { describe, expect, it } from 'vitest';
import {
  begin, campaignRoster, changeCampaignRoster, count, emptyLog, end, linear,
  newCampaign, readLog, readSave, remainingCampaignCards, retry, scheduleCalendarEntry,
  startCalendarDay, type CampaignLog, type Instruction, type Step,
} from './index.ts';

const lessons: Readonly<Record<string, Instruction>> = {
  provision: { id: 'provision', text: 'Take two supplies.', cite: 'synthetic 1', ops: [{ op: 'add', key: 'supplies', n: 2 }] },
  trade: {
    id: 'trade', text: 'Decide whether to trade.', cite: 'synthetic 2', when: { count: 'supplies', atLeast: 2 },
    choose: [
      { id: 'keep', label: 'Keep supplies', ops: [] },
      { id: 'spend', label: 'Spend one', ops: [{ op: 'add', key: 'supplies', n: -1 }] },
    ],
  },
  entrance: { id: 'entrance', text: 'Await the party.', cite: 'synthetic 3', inGame: { effect: 'once inside' } },
};
const dayTwo = () => scheduleCalendarEntry(scheduleCalendarEntry(emptyLog(), 2, 'provision'), 2, 'trade');
const box = { lantern: 1, rope: 2 };
const seats = () => changeCampaignRoster(emptyLog(), [
  { kind: 'join', player: 'north', deck: ['lantern'] },
  { kind: 'join', player: 'south', deck: ['rope'] },
], { box });
const json = (l: CampaignLog): unknown => JSON.parse(JSON.stringify(l)) as unknown;

describe('K595 campaign calendar', () => {
  it('commits a day in recorded order, preserves other days, and processes each day once after JSON load', () => {
    const queued = scheduleCalendarEntry(dayTwo(), 4, 'provision');
    const first = startCalendarDay(queued, 2, lessons, { trade: 'spend' });
    expect(first.ran.map(r => r.id)).toEqual(['provision', 'trade']);
    expect(count(first.log, 'supplies')).toBe(1);
    expect(count(queued, 'supplies')).toBe(0);
    const loaded = readLog(json(first.log));
    if (!loaded) throw new Error('fixture log did not load');
    expect(startCalendarDay(loaded, 2, lessons)).toEqual({ log: loaded, ran: [] });
    expect(count(startCalendarDay(loaded, 4, lessons).log, 'supplies')).toBe(3);
    expect(startCalendarDay(startCalendarDay(loaded, 4, lessons).log, 2, lessons).ran).toEqual([]);
  });

  it('returns a choice without consuming the day or its preceding effects', () => {
    const log = dayTwo();
    const waiting = startCalendarDay(log, 2, lessons);
    expect(waiting.log).toBe(log);
    expect(waiting.ran).toEqual([]);
    expect(waiting.ask?.id).toBe('trade');
    expect(count(startCalendarDay(waiting.log, 2, lessons, { trade: 'keep' }).log, 'supplies')).toBe(2);
  });

  it('rejects missing or in-game rules without consuming scheduled entries', () => {
    const missing = scheduleCalendarEntry(emptyLog(), 1, 'missing');
    expect(() => startCalendarDay(missing, 1, lessons)).toThrow(/missing.*instruction|instruction.*missing/);
    expect(() => startCalendarDay(scheduleCalendarEntry(emptyLog(), 1, 'entrance'), 1, lessons)).toThrow(/in.game/);
    expect(startCalendarDay(dayTwo(), 2, lessons, { trade: 'keep' }).ran).toHaveLength(2);
  });

  it('rejects invalid days, duplicate entries, writes to started days, and silently skipping pending days', () => {
    const queued = dayTwo();
    expect(() => scheduleCalendarEntry(queued, 0, 'provision')).toThrow(/day/);
    expect(() => scheduleCalendarEntry(queued, 2, 'provision')).toThrow(/duplicate/);
    expect(() => startCalendarDay(queued, 3, lessons)).toThrow(/pending|skip/);
    const started = startCalendarDay(queued, 2, lessons, { trade: 'keep' }).log;
    expect(() => scheduleCalendarEntry(started, 2, 'entrance')).toThrow(/started/);
    expect(() => startCalendarDay(started, 1.5, lessons)).toThrow(/day/);
  });
});

describe('K595 campaign roster and shared card box', () => {
  it('joins a late player, sits one out, returns them, and retires one with their copies released', () => {
    const start = seats();
    const idle = changeCampaignRoster(start, [{ kind: 'sitOut', player: 'north' }], { box });
    expect(campaignRoster(idle)).toEqual([
      { id: 'north', status: 'sitting-out', deck: ['lantern'] },
      { id: 'south', status: 'active', deck: ['rope'] },
    ]);
    expect(remainingCampaignCards(idle, box)).toEqual({ lantern: 0, rope: 1 });
    const resumed = changeCampaignRoster(idle, [
      { kind: 'return', player: 'north' },
      { kind: 'retire', player: 'south' },
      { kind: 'join', player: 'east', deck: ['rope', 'rope'] },
    ], { box });
    expect(campaignRoster(resumed)).toEqual([
      { id: 'north', status: 'active', deck: ['lantern'] },
      { id: 'south', status: 'retired', deck: [] },
      { id: 'east', status: 'active', deck: ['rope', 'rope'] },
    ]);
    expect(campaignRoster(start)[1]?.deck).toEqual(['rope']);
    expect(remainingCampaignCards(resumed, box)).toEqual({ lantern: 0, rope: 0 });
    expect(() => changeCampaignRoster(resumed, [{ kind: 'join', player: 'south', deck: [] }], { box })).toThrow(/south/);
  });

  it('refuses over-allocation, unknown cards, invalid limits and illegal player state without publishing any edits', () => {
    const initial = seats();
    const snapshot = structuredClone(initial);
    expect(() => changeCampaignRoster(initial, [
      { kind: 'sitOut', player: 'north' }, { kind: 'setDeck', player: 'south', deck: ['lantern'] },
    ], { box })).toThrow(/lantern/);
    expect(() => changeCampaignRoster(initial, [{ kind: 'setDeck', player: 'south', deck: ['missing'] }], { box })).toThrow(/missing/);
    expect(() => remainingCampaignCards(initial, { lantern: 1, rope: 1.5 })).toThrow(/rope/);
    expect(() => changeCampaignRoster(initial, [{ kind: 'return', player: 'north' }], { box })).toThrow(/north/);
    expect(() => changeCampaignRoster(initial, [{ kind: 'retire', player: 'missing' }], { box })).toThrow(/missing/);
    expect(initial).toEqual(snapshot);
  });

  it('commits a deck swap against the final inventory and lets a game add its own policies', () => {
    const initial = seats();
    const exchange = [
      { kind: 'setDeck', player: 'south', deck: ['lantern'] },
      { kind: 'setDeck', player: 'north', deck: ['rope'] },
    ] as const;
    const changed = changeCampaignRoster(initial, exchange, { box });
    expect(campaignRoster(changed).map(p => p.deck)).toEqual([['rope'], ['lantern']]);
    expect(() => changeCampaignRoster(initial, exchange, {
      box, allow: (_before, after) => after[0]?.deck.includes('rope') ? 'north cannot take rope' : undefined,
    })).toThrow(/north cannot take rope/);
    expect(campaignRoster(initial).map(p => p.deck)).toEqual([['lantern'], ['rope']]);
    const externalDeck: string[] = [];
    const joined = changeCampaignRoster(initial, [{ kind: 'join', player: 'later', deck: externalDeck }], { box });
    externalDeck.push('lantern');
    expect(campaignRoster(joined).at(-1)?.deck).toEqual([]);
  });
});

describe('K595 campaign save and step integration', () => {
  it('rejects malformed extension data while an old log keeps its original shape', () => {
    expect(readLog({ ...emptyLog(), betweenSessions: { calendar: { startedThrough: 0, entries: 'invalid' } } })).toBeUndefined();
    expect(readLog({ ...emptyLog(), betweenSessions: { roster: [{ id: 'north', status: 'retired', deck: ['rope'] }] } })).toBeUndefined();
    const old = { ...emptyLog(), gameNote: 'retained' };
    expect(readLog(json(old))).toEqual(old);
    expect(campaignRoster(old)).toEqual([]);
  });

  it('refuses a saved attempt or historical retry with malformed between-session state', () => {
    const scenario: Step = { kind: 'scenario', id: 'outpost' };
    const base = newCampaign('expedition', '1', scenario, 7);
    const started = begin(base).save;
    const broken = {
      step: scenario, seed: 7,
      logBefore: { ...emptyLog(), betweenSessions: { calendar: { startedThrough: 0, entries: 'invalid' } } },
    };
    expect(readSave({ ...started, attempt: broken }, '1')).toBeUndefined();
    expect(readSave({ ...base, history: [broken] }, '1')).toBeUndefined();
    expect(readSave(JSON.parse(JSON.stringify(started)) as unknown, '1')).toEqual(started);
  });

  it('starts a date before a normal step and does not apply it again after save, retry, or deterministic replay', () => {
    const scenario: Step = { kind: 'scenario', id: 'outpost' };
    const next: Step = { kind: 'scenario', id: 'ridge' };
    const initial = scheduleCalendarEntry(
      changeCampaignRoster(emptyLog(), [{ kind: 'join', player: 'north', deck: ['rope'] }], { box }),
      2, 'provision',
    );
    const day = startCalendarDay(initial, 2, lessons);
    const opener = newCampaign('expedition', '1', scenario, 7, day.log);
    const step = begin(opener);
    expect(Object.isFrozen(campaignRoster(step.log)[0]?.deck)).toBe(true);
    const finished = end(step.save, {
      log: changeCampaignRoster(step.log, [{ kind: 'join', player: 'south', deck: ['lantern'] }], { box }),
    }, linear([scenario, next]));
    expect(finished.position.step).toEqual(next);
    const loaded = readSave(JSON.parse(JSON.stringify(finished)) as unknown, '1');
    if (!loaded) throw new Error('fixture save did not load');
    const retried = retry(loaded);
    expect(retried.position.step).toEqual(scenario);
    expect(campaignRoster(retried.log).map(p => p.id)).toEqual(['north']);
    expect(startCalendarDay(retried.log, 2, lessons).ran).toEqual([]);
    expect(count(retried.log, 'supplies')).toBe(2);
    expect(startCalendarDay(initial, 2, lessons).log).toEqual(day.log);
  });
});
