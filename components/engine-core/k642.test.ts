// K642: rules of older engines about triggers and the queue, restated on a fake game (`fake/timingK642.ts`).
import { describe, expect, it } from 'vitest';
import { draftOf, enteredPlay, would, type Ctx, type OccurrenceInput, type PendingTrigger, type TriggerCandidate } from './index.ts';
import { add, go, list, note, num, pick, queueGame, setList, type Q, type QEvent, type QState } from './fake/timingK642.ts';

const TRIGGERS = { kind: 'timing.triggers' };
const types = (events: readonly QEvent[], ...of: string[]): string[] => events.filter((e) => of.includes(e.type)).map((e) => `${e.type}:${e.what ?? String(e.n)}`);
const targets = (s: QState): (string | undefined)[] => (s.timing?.pending ?? []).map((p) => p.occurrences[0]?.keys.target);
const idFor = (s: QState, target: string): string => String(s.timing?.pending?.find((p) => p.occurrences[0]?.keys.target === target)?.id);

describe('a card and its own entering (K642)', () => {
  it('K642 a card whose ability answers cards entering play answers its own entering, once', () => {
    const g = queueGame({
      happen: (ctx, o) => {
        setList(ctx, 'play', [...list(ctx.s, 'play'), o.keys.target ?? '']);
        enteredPlay(ctx, o.keys.target ?? '');
      },
      triggersFor: (s, o) => (o.kind === 'enter' ? list(s, 'play').filter((c) => c === 'herald').map((c) => ({ ability: 'draw', source: c, player: 'p1' })) : []),
      resolveTrigger: (ctx) => add(ctx, 'drawn', 1),
    }, (ctx) => {
      ctx.then(TRIGGERS);
      would(ctx, [{ kind: 'enter', keys: { player: 'p1', target: 'herald' } }]);
    });
    const s = go(g).state;
    expect(list(s, 'play')).toEqual(['herald']);
    expect(num(s, 'drawn')).toBe(1);
    expect(s.timing?.pending).toEqual([]);
    expect(s.result).toEqual({ done: true });
  });

  it('K642 "when this enters play, add another" chains in entry order from the pile that owns the slot; never for a unit already in play; a later arrival step with no empty slot adds nothing', () => {
    const enter = (s: QState, pile: string): OccurrenceInput[] => {
      const top = list(s, pile)[0];
      return top === undefined ? [] : [{ kind: 'enter', keys: { target: top, other: pile } }];
    };
    const g = queueGame({
      happen: (ctx, o) => {
        const pile = o.keys.other ?? '';
        setList(ctx, pile, list(ctx.s, pile).slice(1));
        setList(ctx, 'row', [...list(ctx.s, 'row'), o.keys.target ?? '']);
        enteredPlay(ctx, o.keys.target ?? '');
      },
      triggersFor: (_s, o) => (o.kind === 'enter' && (o.keys.target ?? '').startsWith('zib') ? [{ ability: 'another', source: o.keys.target ?? '', player: 'none' }] : []),
      resolveTrigger: (ctx, t) => {
        note(ctx, `another:${t.source}`);
        const more = enter(ctx.s, t.occurrences[0]?.keys.other ?? '');
        if (more.length > 0) would(ctx, more);
      },
    }, (ctx) => ctx.then({ kind: 'arrive' }, TRIGGERS, { kind: 'arrive' }, TRIGGERS), {
      arrive: (ctx) => {
        note(ctx, 'arrive');
        if (list(ctx.s, 'row').length < Math.max(1, num(ctx.s, 'slots'))) would(ctx, enter(ctx.s, 'near'));
      },
    });
    const old = go(g, { n: { slots: 2 }, lists: { near: ['plain', 'spare'], row: ['zib0'] } }).state;
    expect(list(old, 'row')).toEqual(['zib0', 'plain']);
    expect(list(old, 'near')).toEqual(['spare']);
    expect(old.trace).toEqual(['arrive', 'arrive']);
    const s = go(g, { lists: { near: ['zib1', 'zib2', 'plain', 'spare'], far: ['other'], row: [] } }).state;
    expect(list(s, 'row')).toEqual(['zib1', 'zib2', 'plain']);
    expect(list(s, 'near')).toEqual(['spare']);
    expect(list(s, 'far')).toEqual(['other']);
    expect(s.trace).toEqual(['arrive', 'another:zib1', 'another:zib2', 'arrive']);
    expect(s.result).toEqual({ done: true });
  });
});

describe('a line of effects and a text resolved inside it (K642)', () => {
  // "a": when you gain 3 or fewer wood in one line, gain 1 wood. A line is one batch; "a" answers once per line and is judged on the line's total.
  const wood = (amount: number, source = 'line'): OccurrenceInput => ({ kind: 'gain', keys: { player: 'p1', source }, amount });
  const PENALTY: OccurrenceInput = { kind: 'penalty', keys: { player: 'p2', source: 'line' } };
  const line = (items: readonly OccurrenceInput[]) => queueGame({
    happen: (ctx, o) => {
      if (o.kind === 'gain') {
        add(ctx, 'wood', o.amount ?? 0);
        note(ctx, `gain:${o.keys.source ?? ''}:${String(o.amount)}`);
      }
      if (o.kind === 'penalty') add(ctx, 'penalty', 1);
      if (o.kind === 'play') {
        ctx.then(TRIGGERS);
        would(ctx, [wood(2, 'inner')]);
      }
    },
    triggersFor: (_s, o) => (o.kind === 'gain' && o.keys.source !== 'a' ? [{ ability: 'bonus', source: 'a', player: 'p1', once: 'perInstance' }] : []),
    invalid: (_s, t) => (t.occurrences.reduce((n, o) => n + (o.amount ?? 0), 0) > 3 ? 'above 3' : undefined),
    dropped: (t, why) => ({ type: 'dropped', what: `${t.ability}:${why}` }),
    resolveTrigger: (ctx) => {
      note(ctx, 'bonus');
      would(ctx, [wood(1, 'a')]);
    },
  }, (ctx) => {
    ctx.then(TRIGGERS);
    would(ctx, items);
  });

  it('K642 a line [gain 1, each other player takes a penalty, gain 3] with "when you gain 3 or fewer": 4 gained, the response never resolves', () => {
    const r = go(line([wood(1), PENALTY, wood(3)]));
    expect(num(r.state, 'wood')).toBe(4);
    expect(num(r.state, 'penalty')).toBe(1);
    expect(r.state.trace).toEqual(['gain:line:1', 'gain:line:3']);
    expect(types(r.events, 'dropped')).toEqual(['dropped:bonus:above 3']);
    expect(r.state.timing?.pending).toEqual([]);
  });

  it('K642 a text played inside the line: its own gain is answered at its end; the outer 1 + 3 stays queued and is judged on its total', () => {
    const r = go(line([wood(1), PENALTY, { kind: 'play', keys: { player: 'p1', source: 'line', target: 'inner' } }, wood(3)]));
    expect(r.state.trace).toEqual(['gain:line:1', 'gain:inner:2', 'bonus', 'gain:a:1', 'gain:line:3']);
    expect(num(r.state, 'wood')).toBe(7);
    expect(types(r.events, 'dropped')).toEqual(['dropped:bonus:above 3']);
    expect(r.state.timing?.pending).toEqual([]);
  });
});

describe('one limited response and two events of one line (K642)', () => {
  // "r": once per turn, double the food on a card you buy.
  const buys = (a: number, b: number) => queueGame({
    happen: (ctx, o) => add(ctx, 'food', o.amount ?? 0),
    triggersFor: () => [{ ability: 'double', source: 'r', player: 'p1', order: a === b ? 'silent' : 'interactive' }],
    invalid: (s) => (num(s, 'used') > 0 ? 'once per turn' : undefined),
    dropped: (t, why) => ({ type: 'dropped', what: `${t.occurrences[0]?.keys.target ?? ''}:${why}` }),
    resolveTrigger: (ctx, t) => {
      add(ctx, 'used', 1);
      add(ctx, 'food', t.occurrences[0]?.amount ?? 0);
      note(ctx, `double:${t.occurrences[0]?.keys.target ?? ''}`);
    },
  }, (ctx) => {
    ctx.then(TRIGGERS);
    would(ctx, [{ kind: 'buy', keys: { player: 'p1', target: 'c1' }, amount: a }, { kind: 'buy', keys: { player: 'p1', target: 'c2' }, amount: b }]);
  });

  it('K642 two purchases carrying 1 and 3: one question naming both; the limit drops the other', () => {
    const g = buys(1, 3);
    const s1 = go(g).state;
    expect(s1.prompt).toMatchObject({ kind: 'timing.order', seat: 'p1', min: 1, max: 1 });
    expect(s1.prompt?.options).toHaveLength(2);
    expect(targets(s1)).toEqual(['c1', 'c2']);
    expect(num(s1, 'food')).toBe(4);
    const r = pick(g, s1, idFor(s1, 'c2'));
    expect(r.state.prompt).toBeNull();
    expect(r.state.trace).toEqual(['double:c2']);
    expect(num(r.state, 'food')).toBe(7);
    expect(types(r.events, 'dropped')).toEqual(['dropped:c1:once per turn']);
    expect(pick(g, s1, idFor(s1, 'c1')).state.n).toMatchObject({ food: 5, used: 1 });
  });

  it('K642 two purchases carrying the same amount: no question, doubled once', () => {
    const r = go(buys(2, 2));
    expect(r.state.result).toEqual({ done: true });
    expect(types(r.events, 'dropped')).toHaveLength(1);
    expect(r.state.n).toMatchObject({ food: 6, used: 1 });
  });
});

describe('a response has a window (K642)', () => {
  // r1 "any turn": not in its owner's pass turn. r2 "your action turn": only there, and not once its end sequence began.
  const window = (cleanup = false) => queueGame({
    happen: (ctx, o) => note(ctx, o.kind),
    triggersFor: (s, o): TriggerCandidate[] => {
      if (o.kind !== 'shuffle') return [];
      const [owner, kind] = list(s, 'turn');
      const mine = owner === 'p1';
      return [
        ...(mine && kind === 'pass' ? [] : [{ ability: 'r1', source: 'r1', player: 'p1' }]),
        ...(mine && kind === 'action' && num(s, 'ending') === 0 ? [{ ability: 'r2', source: 'r2', player: 'p1' }] : []),
      ];
    },
    resolveTrigger: (ctx, t) => note(ctx, t.ability),
  }, (ctx) => {
    ctx.then(TRIGGERS, ...(cleanup ? [{ kind: 'cleanup' }, TRIGGERS] : []));
    would(ctx, [{ kind: 'shuffle', keys: { player: 'p1' } }]);
  }, {
    cleanup: (ctx) => {
      add(ctx, 'ending', 1);
      would(ctx, [{ kind: 'shuffle', keys: { player: 'p1' } }]);
    },
  });
  const offered = (turn: string[], cleanup = false): readonly string[] => go(window(cleanup), { lists: { turn } }).state.trace;

  it('K642 an any-turn response is offered in its owner\'s action turn and the other player\'s turn, not in its owner\'s pass turn', () => {
    expect(offered(['p1', 'action'])).toContain('r1');
    expect(offered(['p2', 'action'])).toContain('r1');
    expect(offered(['p1', 'pass'])).not.toContain('r1');
  });

  it('K642 an own-action-turn response is offered only there, and not once the end sequence of that turn began', () => {
    expect(offered(['p1', 'action'])).toEqual(['shuffle', 'r1', 'r2']);
    expect(offered(['p1', 'pass'])).toEqual(['shuffle']);
    expect(offered(['p2', 'action'])).toEqual(['shuffle', 'r1']);
    const t = offered(['p1', 'action'], true);
    expect(t.filter((x) => x === 'shuffle')).toHaveLength(2);
    expect(t.filter((x) => x === 'r2')).toHaveLength(1);
    expect(t.indexOf('r2')).toBeLessThan(t.lastIndexOf('shuffle'));
  });
});

describe('results that happen together (K642)', () => {
  const results = (cands: readonly TriggerCandidate[]) => queueGame({
    triggersFor: () => cands,
    priority: { r1: 1, r2: 2, default: 10 },
    resolveTrigger: (ctx, t) => {
      note(ctx, t.ability);
      if (t.ability === 'draw3') {
        setList(ctx, 'hand', [...list(ctx.s, 'hand'), ...list(ctx.s, 'bag').slice(0, 3)]);
        setList(ctx, 'bag', list(ctx.s, 'bag').slice(3));
      } else if (t.ability === 'addP') setList(ctx, 'bag', [...list(ctx.s, 'bag'), 'P']);
      else add(ctx, t.ability, 1);
    },
  }, (ctx) => {
    ctx.then(TRIGGERS);
    would(ctx, [{ kind: 'defeat', keys: { player: 'p1', target: 'u1' } }]);
  });
  const DRAW_ADD: TriggerCandidate[] = [{ ability: 'draw3', source: 'u1', player: 'p1', order: 'interactive' }, { ability: 'addP', source: 'u1', player: 'p1', order: 'interactive' }];
  const byAbility = (s: QState, ability: string): string => String(s.timing?.pending?.find((p) => p.ability === ability)?.id);

  it('K642 "draw 3 from the bag" and "add a piece to the bag" together, bag of 1: the player is asked the order, and the order changes the outcome', () => {
    const g = results(DRAW_ADD);
    const s1 = go(g, { lists: { bag: ['x'], hand: [] } }).state;
    expect(s1.prompt).toMatchObject({ kind: 'timing.order', seat: 'p1' });
    expect(s1.prompt?.options).toHaveLength(2);
    const drawFirst = pick(g, s1, byAbility(s1, 'draw3')).state;
    expect(drawFirst.trace).toEqual(['draw3', 'addP']);
    expect(drawFirst.lists).toEqual({ bag: ['P'], hand: ['x'] });
    const addFirst = pick(g, s1, byAbility(s1, 'addP')).state;
    expect(addFirst.trace).toEqual(['addP', 'draw3']);
    expect(addFirst.lists).toEqual({ bag: [], hand: ['x', 'P'] });
  });

  it('K642 two plain gains together, with ranks from the game: no question, printed order (their keys sort the other way)', () => {
    const s = go(results([{ ability: 'stone', source: 'u1', player: 'p1', order: { auto: 'r1' } }, { ability: 'ash', source: 'u1', player: 'p1', order: { auto: 'r2' } }])).state;
    expect(s.result).toEqual({ done: true });
    expect(s.trace).toEqual(['stone', 'ash']);
    expect(s.n).toMatchObject({ stone: 1, ash: 1 });
  });

  const UNRANKED: TriggerCandidate[] = [{ ability: 'stone', source: 'u1', player: 'p1', order: 'silent' }, { ability: 'ash', source: 'u1', player: 'p1', order: 'silent' }];
  it.fails('K642 two plain gains together, no ranks from the game: no question, printed order', () => {
    expect(go(results(UNRANKED)).state.trace).toEqual(['stone', 'ash']);
  });

  it('K642 today: two plain gains together, no ranks from the game: no question, resolved by ability key, not in printed order', () => {
    const s = go(results(UNRANKED)).state;
    expect(s.result).toEqual({ done: true });
    expect(s.trace).toEqual(['ash', 'stone']);
  });

  // Two units defeated at once, each rewarding one piece of the same stock.
  const rewards = queueGame({
    happen: (ctx, o) => note(ctx, `defeat:${o.keys.target ?? ''}`),
    triggersFor: (s, o) => [{ ability: 'reward', source: o.keys.target ?? '', player: 'p1', order: num(s, 'stock') < 2 ? 'interactive' : 'silent' }],
    resolveTrigger: (ctx, t) => {
      if (num(ctx.s, 'stock') > 0) {
        add(ctx, 'stock', -1);
        add(ctx, 'held', 1);
        ctx.emit({ type: 'gained', what: t.source });
      } else ctx.emit({ type: 'unavailable', what: t.source });
    },
  }, (ctx) => {
    ctx.then(TRIGGERS);
    would(ctx, [{ kind: 'defeat', keys: { player: 'p1', target: 'u1' } }, { kind: 'defeat', keys: { player: 'p1', target: 'u2' } }]);
  });

  it('K642 two rewards competing for the last piece of a stock: the player is asked the order; the second gets nothing and no substitute', () => {
    const s1 = go(rewards, { n: { stock: 1, otherStock: 5 } }).state;
    expect(s1.prompt).toMatchObject({ kind: 'timing.order', seat: 'p1' });
    expect(targets(s1)).toEqual(['u1', 'u2']);
    const r = pick(rewards, s1, idFor(s1, 'u2'));
    expect(types(r.events, 'gained', 'unavailable')).toEqual(['gained:u2', 'unavailable:u1']);
    expect(r.state.n).toEqual({ stock: 0, otherStock: 5, held: 1 });
    expect(types(pick(rewards, s1, idFor(s1, 'u1')).events, 'gained', 'unavailable')).toEqual(['gained:u1', 'unavailable:u2']);
  });

  it.fails('K642 two units defeated at once as one batch, rewards competing: both units are defeated in the order the player chose', () => {
    const s1 = go(rewards, { n: { stock: 1 } }).state;
    expect(pick(rewards, s1, idFor(s1, 'u2')).state.trace).toEqual(['defeat:u2', 'defeat:u1']);
  });

  it('K642 today: two units defeated at once as one batch are defeated in batch order, before the order question; only the rewards follow the answer', () => {
    const s1 = go(rewards, { n: { stock: 1 } }).state;
    expect(s1.trace).toEqual(['defeat:u1', 'defeat:u2']);
    expect(s1.prompt?.kind).toBe('timing.order');
    const r = pick(rewards, s1, idFor(s1, 'u2'));
    expect(r.state.trace).toEqual(['defeat:u1', 'defeat:u2']);
    expect(types(r.events, 'gained', 'unavailable')).toEqual(['gained:u2', 'unavailable:u1']);
  });

  // The same two units, each defeat queued as an ordered result of the one hit that met both conditions.
  it('K642 two units defeated at once, each defeat queued as a result of the hit: defeated and rewarded in the order the player chose', () => {
    const g = queueGame({
      triggersFor: (s, o) => [{ ability: 'defeat', source: o.keys.target ?? '', player: 'p1', order: num(s, 'stock') < 2 ? 'interactive' : 'silent' }],
      resolveTrigger: (ctx, t) => {
        note(ctx, `defeat:${t.source}`);
        if (num(ctx.s, 'stock') > 0) {
          add(ctx, 'stock', -1);
          ctx.emit({ type: 'gained', what: t.source });
        } else ctx.emit({ type: 'unavailable', what: t.source });
      },
    }, (ctx) => {
      ctx.then(TRIGGERS);
      would(ctx, [{ kind: 'hit', keys: { player: 'p1', target: 'u1' } }, { kind: 'hit', keys: { player: 'p1', target: 'u2' } }]);
    });
    const s1 = go(g, { n: { stock: 1 } }).state;
    expect(s1.prompt).toMatchObject({ kind: 'timing.order', seat: 'p1' });
    expect(s1.trace).toEqual([]);
    const r = pick(g, s1, idFor(s1, 'u2'));
    expect(r.state.trace).toEqual(['defeat:u2', 'defeat:u1']);
    expect(types(r.events, 'gained', 'unavailable')).toEqual(['gained:u2', 'unavailable:u1']);
  });

  it('K642 two rewards from a stock that holds enough: no question, both gained', () => {
    const r = go(rewards, { n: { stock: 2 } });
    expect(r.state.result).toEqual({ done: true });
    expect(types(r.events, 'gained', 'unavailable')).toEqual(['gained:u1', 'gained:u2']);
  });
});

describe('what an occurrence tells its responses (K642)', () => {
  it('K642 using 2 charges in one effect is 2 uses: "after you use a charge" resolves twice, with one event of amount 2', () => {
    const g = queueGame({
      happen: (ctx, o) => add(ctx, 'charges', -(o.amount ?? 0)),
      event: (o) => ({ type: 'used', n: o.amount ?? 0 }),
      triggersFor: (_s, o) => Array.from({ length: o.amount ?? 0 }, () => ({ ability: 'draw', source: 'attachment', player: 'p1' })),
      resolveTrigger: (ctx) => add(ctx, 'drawn', 1),
    }, (ctx) => {
      ctx.then(TRIGGERS);
      would(ctx, [{ kind: 'use', keys: { player: 'p1', target: 'tool' }, amount: 2 }]);
    });
    const r = go(g, { n: { charges: 3 } });
    expect(r.state.n).toEqual({ charges: 1, drawn: 2 });
    expect(types(r.events, 'used')).toEqual(['used:2']);
  });

  // "w": after you lose 2 or more in one loss, mark w.
  const loss = (items: readonly OccurrenceInput[], guard = false) => queueGame({
    happen: (ctx, o) => add(ctx, 'hp', -(o.amount ?? 0)),
    ...(guard ? { preventions: () => [{ id: 'guard', prevention: { prevents: 'loss', max: 1 } }] } : {}),
    triggersFor: (_s, o) => ((o.amount ?? 0) >= 2 ? [{ ability: 'mark', source: 'w', player: 'p1' }] : []),
    resolveTrigger: (ctx) => add(ctx, 'marks', 1),
  }, (ctx) => {
    ctx.then(TRIGGERS);
    would(ctx, items);
  });
  const LOSE = (amount: number): OccurrenceInput => ({ kind: 'loss', keys: { player: 'p1' }, amount });

  it('K642 "2 or more in one loss" is judged per instance: two losses of 1 in one batch mark nothing, one loss of 2 marks once', () => {
    expect(go(loss([LOSE(1), LOSE(1)]), { n: { hp: 10 } }).state.n).toEqual({ hp: 8 });
    expect(go(loss([LOSE(2)]), { n: { hp: 10 } }).state.n).toEqual({ hp: 8, marks: 1 });
  });

  it('K642 "2 or more in one loss" is judged on the amount left after prevention: a loss of 2 with 1 prevented marks nothing', () => {
    const g = loss([LOSE(2)], true);
    const s1 = go(g, { n: { hp: 10 } }).state;
    expect(s1.prompt?.kind).toBe('timing.prevent');
    const s2 = pick(g, s1, 'guard').state;
    const s3 = pick(g, s2, 'pass').state;
    expect(s3.result).toEqual({ done: true });
    expect(s3.n).toEqual({ hp: 9 });
    expect(pick(g, s1, 'pass').state.n).toEqual({ hp: 8, marks: 1 });
  });

  it('K642 a change made by a neutral effect is made by no player: "after you add a counter" stays silent, then answers your own', () => {
    const counter = (player?: string) => (ctx: Ctx<Q>): void => {
      would(ctx, [{ kind: 'counter', keys: { target: 'enemy', ...(player === undefined ? {} : { player }) } }]);
    };
    const g = queueGame({
      happen: (ctx, o) => note(ctx, `counter:${o.keys.player ?? 'nobody'}`),
      triggersFor: (_s, o) => (o.keys.player === 'p1' ? [{ ability: 'gain', source: 'w', player: 'p1' }] : []),
      resolveTrigger: (ctx) => note(ctx, 'gain'),
    }, (ctx) => ctx.then({ kind: 'neutral' }, TRIGGERS, { kind: 'mine' }, TRIGGERS), { neutral: counter(), mine: counter('p1') });
    const s = go(g).state;
    expect(s.trace).toEqual(['counter:nobody', 'counter:p1', 'gain']);
    expect(s.result).toEqual({ done: true });
  });
});

describe('a forced response waits; an older queued event waits outside a nested window (K642)', () => {
  // The effect of a success: [deal 1 to u, gain 1]. u is defeated at the end of the effect (the sweep): "own" (u's own
  // line: deal 1 elsewhere) and "w" (after a unit is defeated) answer it. "v" answers the older event (the success).
  const g = (held: boolean) => queueGame({
    checkpoint: { checks: [] },
    happen: (ctx, o) => {
      note(ctx, `${o.kind}:${o.keys.target ?? ''}`);
      if (o.kind === 'succeed') ctx.then({ kind: 'deal' }, { kind: 'gain' }, { kind: 'effectEnd' });
      if (o.kind === 'damage') add(ctx, `hp:${o.keys.target ?? ''}`, -(o.amount ?? 0));
    },
    triggersFor: (_s, o): TriggerCandidate[] =>
      o.kind === 'succeed' ? [{ ability: 'v', source: 'v', player: 'p1', timing: 'after' }]
        : o.kind === 'defeat' ? [{ ability: 'own', source: 'u', player: 'p1', timing: 'after' }, { ability: 'w', source: 'w', player: 'p1', timing: 'after' }]
          : [],
    ...(held ? { held: (s: QState, t: PendingTrigger) => s.stack.some((x) => x.kind === 'effectEnd') || (num(s, 'sweep') > 0 && t.batch < num(s, 'sweep')) } : {}),
    resolveTrigger: (ctx, t) => {
      note(ctx, t.ability);
      if (t.ability === 'own') would(ctx, [{ kind: 'damage', keys: { target: 'far' }, amount: 1 }]);
    },
  }, (ctx) => {
    ctx.then({ kind: 'next' });
    would(ctx, [{ kind: 'succeed', keys: { player: 'p1' } }]);
  }, {
    deal: (ctx) => {
      would(ctx, [{ kind: 'damage', keys: { target: 'u' }, amount: 1 }]);
    },
    gain: (ctx) => note(ctx, 'gain'),
    effectEnd: (ctx) => {
      if (num(ctx.s, 'hp:u') > 0) return;
      ctx.then(TRIGGERS, { kind: 'sweepEnd' });
      const b = would(ctx, [{ kind: 'defeat', keys: { target: 'u' } }]);
      draftOf(ctx).n = { ...ctx.s.n, sweep: b };
    },
    sweepEnd: (ctx) => {
      draftOf(ctx).n = { ...ctx.s.n, sweep: 0 };
      ctx.then(TRIGGERS);
    },
    next: (ctx) => note(ctx, 'next'),
  });

  it('K642 order: deal, gain, the defeat with its own responses, then the response to the older event, then the next step', () => {
    const s = go(g(true), { n: { 'hp:u': 1, 'hp:far': 5 } }).state;
    expect(s.trace).toEqual(['succeed:', 'damage:u', 'gain', 'defeat:u', 'own', 'damage:far', 'w', 'v', 'next']);
    expect(s.timing?.pending).toEqual([]);
    expect(s.n).toMatchObject({ 'hp:u': 0, 'hp:far': 4 });
    expect(s.result).toEqual({ done: true });
  });

  it('K642 without the game holding them the response to the older event resolves inside the effect', () => {
    const t = go(g(false), { n: { 'hp:u': 1, 'hp:far': 5 } }).state.trace;
    expect(t.indexOf('v')).toBeLessThan(t.indexOf('gain'));
  });
});
