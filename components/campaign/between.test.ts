import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  it.each(['active', 'attempt', 'history'] as const)('preserves legacy game-owned betweenSessions data in %s', where => {
    const legacy: CampaignLog & { betweenSessions: string[] } = { ...emptyLog(), betweenSessions: ['session recap'] };
    const scenario: Step = { kind: 'scenario', id: 'outpost' };
    const active = newCampaign('expedition', '1', scenario, 7, legacy);
    const attempt = begin(active).save;
    const snapshots = {
      active,
      attempt: { ...attempt, log: emptyLog() },
      history: end(attempt, { log: emptyLog() }, () => null),
    };
    const saved = snapshots[where];
    const loaded = readSave(JSON.parse(JSON.stringify(saved)) as unknown, '1');
    expect(loaded).toEqual(saved);
    if (!loaded) throw new Error('fixture save did not load');
    if (where === 'active') expect(readLog(json(legacy))).toEqual(legacy);
    else expect(retry(loaded).log).toEqual(legacy);
  });

  it('rejects malformed extension data while an old log keeps its original shape', () => {
    const key = 'game-kit:campaign-between-sessions';
    expect(readLog({ ...emptyLog(), [key]: { v: 1, calendar: { startedThrough: 0, entries: 'invalid' } } })).toBeUndefined();
    expect(readLog({ ...emptyLog(), [key]: { v: 1, roster: [{ id: 'north', status: 'retired', deck: ['rope'] }] } })).toBeUndefined();
    expect(readLog({ ...emptyLog(), [key]: { v: 2 } })).toBeUndefined();
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
      logBefore: { ...emptyLog(), 'game-kit:campaign-between-sessions': { v: 1, calendar: { startedThrough: 0, entries: 'invalid' } } },
    };
    expect(readSave({ ...started, attempt: broken }, '1')).toBeUndefined();
    expect(readSave({ ...base, history: [broken] }, '1')).toBeUndefined();
    expect(readSave(JSON.parse(JSON.stringify(started)) as unknown, '1')).toEqual(started);
  });

  it('starts a date before a normal step and does not apply it again after save, retry, or deterministic replay', () => {
    const scenario: Step = { kind: 'scenario', id: 'outpost' };
    const next: Step = { kind: 'scenario', id: 'ridge' };
    const legacy: CampaignLog & { betweenSessions: string[] } = { ...emptyLog(), betweenSessions: ['session recap'] };
    const initial = scheduleCalendarEntry(
      changeCampaignRoster(legacy, [{ kind: 'join', player: 'north', deck: ['rope'] }], { box }),
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
    expect(loaded.log).toMatchObject({ betweenSessions: legacy.betweenSessions });
    const retried = retry(loaded);
    expect(retried.log).toMatchObject({ betweenSessions: legacy.betweenSessions });
    expect(retried.position.step).toEqual(scenario);
    expect(campaignRoster(retried.log).map(p => p.id)).toEqual(['north']);
    expect(startCalendarDay(retried.log, 2, lessons).ran).toEqual([]);
    expect(count(retried.log, 'supplies')).toBe(2);
    expect(startCalendarDay(initial, 2, lessons).log).toEqual(day.log);
  });
});

it('K595 matches a physical-copy count for every small deck pair, box, attendance and edit order', () => {
  const decks = [[], ['lantern'], ['rope'], ['lantern', 'lantern'], ['lantern', 'rope'], ['rope', 'rope']];
  const attendance = [[], ['north'], ['south'], ['north', 'south']];
  for (const absent of attendance) {
    const initial = changeCampaignRoster(seats(), absent.map(player => ({ kind: 'sitOut', player })), { box });
    const snapshot = structuredClone(initial);
    for (const north of decks) for (const south of decks) {
      const cards = [...north, ...south];
      const edits = [
        { kind: 'setDeck', player: 'north', deck: north },
        { kind: 'setDeck', player: 'south', deck: south },
      ] as const;
      for (const lantern of [1, 2]) for (const rope of [1, 2]) {
        const limits = { lantern, rope };
        const free = {
          lantern: lantern - cards.filter(card => card === 'lantern').length,
          rope: rope - cards.filter(card => card === 'rope').length,
        };
        for (const order of [edits, edits.toReversed()]) {
          const apply = () => changeCampaignRoster(initial, order, { box: limits });
          if (free.lantern < 0 || free.rope < 0) {
            expect(apply).toThrow(/shared box/);
          } else {
            const result = apply();
            expect(remainingCampaignCards(result, limits)).toEqual(free);
            expect(campaignRoster(result)).toEqual([
              { id: 'north', status: absent.includes('north') ? 'sitting-out' : 'active', deck: north },
              { id: 'south', status: absent.includes('south') ? 'sitting-out' : 'active', deck: south },
            ]);
          }
          expect(initial).toEqual(snapshot);
        }
      }
    }
  }
});

it('K595 matches the expected day order and effects across permutations and saved replay', () => {
  const rules: Readonly<Record<string, Instruction>> = {
    provision: lessons.provision!,
    reset: { id: 'reset', text: 'Reset supplies.', cite: 'synthetic 4', ops: [{ op: 'set', key: 'supplies', n: 5 }] },
    mark: { id: 'mark', text: 'Mark the camp.', cite: 'synthetic 5', ops: [{ op: 'record', key: 'camp' }] },
  };
  const ids = Object.keys(rules);
  for (const first of ids) for (const last of ids.filter(id => id !== first)) for (const day of [1, 2, 5]) {
    const order = [first, ids.find(id => id !== first && id !== last)!, last];
    const queued = order.reduce((log, id) => scheduleCalendarEntry(log, day, id),
      scheduleCalendarEntry(emptyLog(), day + 1, 'provision'));
    const supplies = order.indexOf('reset') < order.indexOf('provision') ? 7 : 5;
    expect(() => startCalendarDay(queued, day + 1, rules)).toThrow(/pending/);
    const result = startCalendarDay(queued, day, rules);
    expect(result.ran.map(rule => rule.id)).toEqual(order);
    expect(count(result.log, 'supplies')).toBe(supplies);
    expect(result.log.recorded).toEqual(['camp']);
    const loaded = readLog(json(result.log));
    if (!loaded) throw new Error('fixture log did not load');
    expect(startCalendarDay(loaded, day, rules)).toEqual({ log: loaded, ran: [] });
    expect(count(startCalendarDay(loaded, day + 1, rules).log, 'supplies')).toBe(supplies + 2);
  }
});

it('K595 runs the opening campaign from the README', () => {
  const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  const example = /## Use it in 10 lines\s+```ts\r?\n([\s\S]*?)```/.exec(readme)?.[1];
  if (!example) throw new Error('campaign README example missing');
  const output = execFileSync(process.execPath, ['--input-type=module-typescript', '-'], {
    input: example.replaceAll("'../kit/campaign/index'", JSON.stringify(new URL('./index.ts', import.meta.url).href)),
    encoding: 'utf8',
  });
  expect(output.trim()).toBe("[ 'stocked' ]");
});
