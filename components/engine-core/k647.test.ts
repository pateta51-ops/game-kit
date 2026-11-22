// K647: cases of older engines restated on a fake game: lasting effects, numbers with parts, state checks, and four
// kernel rules (answers, game over, the only answer taken, undo by step). Each title starts with the case it restates
// (letter of the engine, number in its list). "today" in a title pins what the kit does where the case's expectation
// fails or is one of two readings.
import { describe, expect, it } from 'vitest';
import {
  addEffect, addStep, applyAction, askOrTake, bar, canUndoStep, draftOf, effectsOf, enumerateAnswers, extendStep, hashState, newSteps, numberParts,
  simultaneously, sourceLeft, spendEffect, sumEffects, undoStep, validateAction, would,
  type Ctx, type GameRules, type NumberModifier, type StateCheck, type TimingConfig,
} from './index.ts';
import { add, answer, pickOne, playGame, put, said, say, startPlay, zoneOf, type Play, type PlayRules, type PlayState } from './fake/casesK647.ts';

type G = GameRules<Play>;
const go = (g: G, rules?: PlayRules) => {
  const s = startPlay(g, rules);
  return applyAction(g, s, answer(s, 'go'), null).state;
};
const pick = (g: G, s: PlayState, ...ids: string[]): PlayState => applyAction(g, s, answer(s, ...ids), null).state;
const ids = (s: PlayState) => s.prompt?.options.map((o) => o.id);
const checks = (...c: StateCheck<Play>[]): Partial<TimingConfig<Play>> => ({ checkpoint: { checks: c } });
const CP = { kind: 'timing.checkpoint' };
const n = (s: PlayState, k: string): number | undefined => s.n[k];
const DONE = { done: true };
const refusal = (r: { readonly ok: boolean; readonly error?: string }): string => (r.ok ? 'accepted' : r.error ?? '');

describe('S B23: a capacity granted by a lasting ability (K647)', () => {
  const limit: StateCheck<Play> = {
    name: 'limit',
    run: (ctx) => {
      add(ctx, 'checks');
      const post = ctx.s.z['post'] ?? [];
      if (post.length <= 1 + sumEffects(ctx.s, 'room')) return;
      say(ctx, `which leaves ${post.join(',')}`);
      ctx.ask(pickOne('leave', post), { kind: 'leave' });
    },
  };
  // the game queues the check only when a move changed a zone; the kit runs a check only where one is queued
  const move = (ctx: Ctx<Play>, card: string, to: string): boolean => {
    if (zoneOf(ctx.s, card) === to) return false;
    put(ctx, card, to);
    return true;
  };
  const game = (step: (ctx: Ctx<Play>) => boolean) =>
    playGame(checks(limit), {
      play: (ctx) => {
        addEffect(ctx, { kind: 'room', source: 'annex', target: 'post', value: 1, duration: { while: 'sourceInPlay' } });
        if (step(ctx)) ctx.then(CP);
      },
      leave: (ctx, t) => put(ctx, t.answer?.[0] ?? '', 'discard'),
    });
  const Z = { z: { post: ['a', 'b'], board: ['annex'] } };

  it('S B23 the grant ends the moment its source leaves; the limit check then asks at once which card goes', () => {
    const g = game((ctx) => {
      sourceLeft(ctx, 'annex');
      return move(ctx, 'annex', 'discard');
    });
    const s1 = go(g, Z);
    expect(s1.prompt).toMatchObject({ kind: 'leave', min: 1, max: 1 });
    expect(ids(s1)).toEqual(['a', 'b']);
    expect(said(s1)).toEqual(['which leaves a,b']);
    expect(effectsOf(s1, 'room')).toEqual([]);
    const s2 = pick(g, s1, 'a');
    expect(s2.z['post']).toEqual(['b']);
    expect(zoneOf(s2, 'a')).toBe('discard');
    expect(said(s2)).toEqual(['which leaves a,b']);
    expect(n(s2, 'checks')).toBe(2);
    expect(s2.result).toEqual(DONE);
  });

  it('S B23 a move that changes nothing queues no check (passes; the game supplies queuing only on a change)', () => {
    const s = go(game((ctx) => move(ctx, 'a', 'post')), Z);
    expect(s.prompt).toBeNull();
    expect(said(s)).toEqual([]);
    expect(n(s, 'checks')).toBeUndefined();
    expect(s.z['post']).toEqual(['a', 'b']);
    expect(s.result).toEqual(DONE);
  });

  it('S B23 a new card joins first, then the check asks among all of them', () => {
    const g = game((ctx) => move(ctx, 'c', 'post'));
    const s1 = go(g, Z);
    expect(ids(s1)).toEqual(['a', 'b', 'c']);
    const s2 = pick(g, s1, 'c');
    expect(s2.z['post']).toEqual(['a', 'b']);
    expect(zoneOf(s2, 'c')).toBe('discard');
  });

  it('S B23 the last holder cannot be removed willingly (passes; the game supplies the barred option)', () => {
    const g = playGame({}, {
      play: (ctx) => {
        const post = ctx.s.z['post'] ?? [];
        ctx.ask({ ...pickOne('remove', ['keep']), options: [{ id: 'keep', enabled: true }, ...post.map((c) => (post.length === 1 ? bar(c, 'lastHolder') : { id: c, enabled: true }))] }, { kind: 'leave' });
      },
      leave: (ctx, t) => put(ctx, t.answer?.[0] ?? '', 'discard'),
    });
    const s1 = go(g, { z: { post: ['a'] } });
    expect(s1.prompt?.options.find((o) => o.id === 'a')).toMatchObject({ enabled: false, reason: 'lastHolder' });
    expect(refusal(validateAction(s1, answer(s1, 'a')))).toMatch(/^NOT_LEGAL/);
    const s2 = go(g, { z: { post: ['a', 'b'] } });
    expect(pick(g, s2, 'a').z['post']).toEqual(['b']);
  });
});

describe('W B16: one action meets two defeat conditions with different rewards (K647)', () => {
  const defeat: StateCheck<Play> = {
    name: 'defeat',
    run: (ctx) => {
      if (zoneOf(ctx.s, 'u') !== 'row') return false;
      const met = [(ctx.s.n['A'] ?? 0) >= 3 ? 'R1' : '', (ctx.s.n['B'] ?? 0) >= 1 ? 'R2' : ''].filter((x) => x !== '');
      if (met.length === 0) return false;
      if (met.length === 1) {
        put(ctx, 'u', 'gone');
        add(ctx, met[0] as string);
        return true;
      }
      ctx.ask(pickOne('reward', met), { kind: 'reward' });
      return false;
    },
  };
  const g = playGame({
    ...checks(defeat),
    happen: (ctx) => {
      add(ctx, 'A', ctx.s.n['pieceA'] ?? 0);
      add(ctx, 'B', ctx.s.n['pieceB'] ?? 0);
    },
  }, {
    play: (ctx) => void would(ctx, [{ kind: 'place', keys: { target: 'u' } }]),
    reward: (ctx, t) => {
      put(ctx, 'u', 'gone');
      add(ctx, t.answer?.[0] ?? '');
    },
  });

  it('W B16 a piece meeting both conditions: one prompt with the two rewards; the one picked is given, never both', () => {
    const rules = { n: { pieceA: 3, pieceB: 1 }, z: { row: ['u'] } };
    const s1 = go(g, rules);
    expect(s1.prompt).toMatchObject({ kind: 'reward', min: 1, max: 1 });
    expect(ids(s1)).toEqual(['R1', 'R2']);
    const a = pick(g, s1, 'R1');
    expect([n(a, 'R1'), n(a, 'R2'), zoneOf(a, 'u'), a.prompt, a.result]).toEqual([1, undefined, 'gone', null, DONE]);
    const b = pick(g, s1, 'R2');
    expect([n(b, 'R1'), n(b, 'R2'), zoneOf(b, 'u'), b.prompt, b.result]).toEqual([undefined, 1, 'gone', null, DONE]);
  });

  it('W B16 one condition met: no prompt, its reward only (passes; the game supplies the reward options)', () => {
    const s = go(g, { n: { pieceA: 3, pieceB: 0 }, z: { row: ['u'] } });
    expect([n(s, 'R1'), n(s, 'R2'), zoneOf(s, 'u'), s.prompt, s.result]).toEqual([1, undefined, 'gone', null, DONE]);
  });
});

describe('W B17: a lowered requirement defeats at once (K647)', () => {
  const blanked = (s: PlayState): string[] => ((s.n['off:Q'] ?? 0) > 0 ? ['Q'] : []);
  const need = (s: PlayState): number => 2 + sumEffects(s, 'need', undefined, { blanked });
  const defeat: StateCheck<Play> = {
    name: 'defeat',
    run: (ctx) => {
      if (zoneOf(ctx.s, 'u') !== 'row' || (ctx.s.n['held'] ?? 0) < need(ctx.s)) return;
      put(ctx, 'u', 'gone');
      say(ctx, `defeated at ${String(need(ctx.s))}`);
      return true;
    },
  };
  const game = (kind: string) =>
    playGame({
      ...checks(defeat),
      happen: (ctx, o) => {
        if (o.kind === 'lower') addEffect(ctx, { kind: 'need', source: 'spell', target: 'u', value: -1, duration: { until: 'endOfTurn' } });
        if (o.kind === 'raise') addEffect(ctx, { kind: 'need', source: 'spell', target: 'u', value: 1, duration: { until: 'endOfTurn' } });
        if (o.kind === 'off') add(ctx, 'off:Q');
      },
    }, {
      play: (ctx) => {
        addEffect(ctx, { kind: 'need', source: 'Q', target: 'u', value: 1, duration: { while: 'sourceInPlay' } });
        would(ctx, [{ kind, keys: { target: 'u' } }]);
      },
    });
  const R = { n: { held: 2 }, z: { row: ['u'] } };

  it('W B17 "-1 this turn" on a requirement of 3 holding 2 defeats it at once, with no piece placed', () => {
    const s = go(game('lower'), R);
    expect([zoneOf(s, 'u'), n(s, 'held'), said(s), s.result]).toEqual(['gone', 2, ['defeated at 2'], DONE]);
  });
  it('W B17 switching off the source of the raise does the same', () => {
    const s = go(game('off'), R);
    expect([zoneOf(s, 'u'), n(s, 'held'), said(s), s.result]).toEqual(['gone', 2, ['defeated at 2'], DONE]);
  });
  it('W B17 a "+1" is not met by the same pieces', () => {
    const s = go(game('raise'), R);
    expect([zoneOf(s, 'u'), said(s), s.result]).toEqual(['row', [], DONE]);
  });
});

describe('W B18: a status ends in the middle of a phase (K647)', () => {
  const blanked = (s: PlayState): string[] => effectsOf(s, 'stun').map((e) => e.target ?? '');
  const g = playGame({}, {
    play: (ctx) => {
      addEffect(ctx, { kind: 'dmg', source: 'U1', value: 1, duration: { while: 'sourceInPlay' } });
      addEffect(ctx, { kind: 'stun', source: 'trap', target: 'U1', value: 0, duration: { until: 'used', uses: 1 } });
      ctx.then({ kind: 'act', id: 'U1' }, { kind: 'act', id: 'U2' });
    },
    act: (ctx, t) => {
      const u = t.id ?? '';
      const stun = effectsOf(ctx.s, 'stun', (e) => e.target === u)[0];
      if (stun !== undefined) {
        say(ctx, `${u} does not attack`);
        spendEffect(ctx, stun.id);
        return;
      }
      const d = 1 + sumEffects(ctx.s, 'dmg', undefined, { blanked });
      add(ctx, 'hits', d);
      say(ctx, `${u} deals ${String(d)}`);
    },
  });

  it('W B18 a switched-off unit does not attack; its status ends after its own turn; the next unit gets its lasting bonus', () => {
    const s = go(g);
    expect(said(s)).toEqual(['U1 does not attack', 'U2 deals 2']);
    expect(n(s, 'hits')).toBe(2);
    expect(effectsOf(s, 'stun')).toEqual([]);
  });
});

describe('W B21: a block silences pieces already there and goes with the card (K647)', () => {
  const total = (s: PlayState, card: string): number =>
    [1, 2].reduce((t, v) => t + (effectsOf(s, 'block', (e) => e.target === card && e.value === v).length > 0 ? 0 : v * (s.n[`${card}:${String(v)}`] ?? 0)), 0);
  const inSlot = (s: PlayState, slot: string): string => s.z[slot]?.[0] ?? '';
  const g = playGame({}, {
    play: (ctx) => {
      const note = (): void => say(ctx, `slot1 ${String(total(ctx.s, inSlot(ctx.s, 'slot1')))} slot2 ${String(total(ctx.s, inSlot(ctx.s, 'slot2')))}`);
      note();
      addEffect(ctx, { kind: 'block', source: 'b1', target: 'T', value: 1, duration: { until: 'game' } });
      note();
      addEffect(ctx, { kind: 'block', source: 'b2', target: 'T', value: 2, duration: { until: 'game' } });
      note();
      put(ctx, 'T', 'slot2');
      put(ctx, 'X', 'slot1');
      note();
    },
  });

  it('W B21 pieces on the card when a block starts count nothing from then on; the block belongs to the card, not the slot (passes; the game supplies the total)', () => {
    const s = go(g, { n: { 'T:1': 1, 'T:2': 1, 'X:1': 1 }, z: { slot1: ['T'], slot2: ['X'] } });
    expect(said(s)).toEqual(['slot1 3 slot2 1', 'slot1 2 slot2 1', 'slot1 0 slot2 1', 'slot1 1 slot2 0']);
  });
});

describe('E B14: units defeated together are ordered once; a defeat they cause is swept after (K647)', () => {
  const doDefeat = (ctx: Ctx<Play>, u: string): void => {
    put(ctx, u, 'discard');
    say(ctx, `defeat ${u}`);
    if (u === 'A') add(ctx, 'dmg:T');
  };
  const defeat: StateCheck<Play> = {
    name: 'defeat',
    run: (ctx) => {
      const dead = (ctx.s.z['play'] ?? []).filter((u) => (ctx.s.n[`dmg:${u}`] ?? 0) >= 1);
      if (dead.length === 0) return false;
      if (dead.length === 1) {
        doDefeat(ctx, dead[0] as string);
        return true;
      }
      ctx.ask({ ...pickOne('order', dead), min: dead.length, max: dead.length, ordered: true }, { kind: 'defeatAll' });
      return false;
    },
  };
  const game = (together: boolean): G => {
    const g: G = playGame({ ...checks(defeat), happen: (ctx, o) => add(ctx, `dmg:${o.keys.target ?? ''}`, o.amount ?? 1) }, {
      play: (ctx) => {
        if (together) simultaneously(ctx, g.handlers, ['A', 'B', 'C'].map((id) => ({ kind: 'hurt', id })));
        else would(ctx, ['A', 'B', 'C'].map((target) => ({ kind: 'hit', keys: { target }, amount: 1 })));
      },
      hurt: (ctx, t) => void would(ctx, [{ kind: 'hit', keys: { target: t.id ?? '' }, amount: 1 }]),
      defeatAll: (ctx, t) => (t.answer ?? []).forEach((u) => doDefeat(ctx, u)),
    });
    return g;
  };
  const Z = { z: { play: ['A', 'B', 'C', 'T'] } };

  it('E B14 three units hit at once: one ordering prompt with 3 options; the answer C, A, B defeats C, A, B, then T', () => {
    const g = game(true);
    const s1 = go(g, Z);
    expect(s1.prompt).toMatchObject({ kind: 'order', min: 3, max: 3, ordered: true });
    expect(ids(s1)).toEqual(['A', 'B', 'C']);
    const s2 = pick(g, s1, 'C', 'A', 'B');
    expect(said(s2)).toEqual(['defeat C', 'defeat A', 'defeat B', 'defeat T']);
    expect(s2.result).toEqual(DONE);
  });

  it('E B14 today: three hits as one batch get a checkpoint after each occurrence: no ordering prompt, A and its sweep go before B is hit (group them with `simultaneously`)', () => {
    const s = go(game(false), Z);
    expect(s.prompt).toBeNull();
    expect(said(s)).toEqual(['defeat A', 'defeat T', 'defeat B', 'defeat C']);
  });
});

describe('E B15: a unit at two defeat thresholds; a unit its own defeat line moved (K647)', () => {
  const TH: Record<string, number> = { U: 2, U2: 1 };
  const line = (ctx: Ctx<Play>, u: string, cause: string): void => {
    say(ctx, `${u} ${cause}`);
    if (u === 'U2') put(ctx, 'U2', 'under:V');
    if (zoneOf(ctx.s, u) === 'play') put(ctx, u, 'discard');
  };
  const defeat: StateCheck<Play> = {
    name: 'defeat',
    run: (ctx) => {
      for (const u of ctx.s.z['play'] ?? []) {
        const at = TH[u] ?? 99;
        const causes = [(ctx.s.n[`dmg:${u}`] ?? 0) >= at ? 'harm' : '', (ctx.s.n[`fav:${u}`] ?? 0) >= at ? 'favour' : ''].filter((x) => x !== '');
        if (causes.length === 1) {
          line(ctx, u, causes[0] as string);
          return true;
        }
        if (causes.length === 2) {
          ctx.ask(pickOne('cause', causes), { kind: 'cause', id: u });
          return false;
        }
      }
      return false;
    },
  };
  const g = playGame({
    ...checks(defeat),
    happen: (ctx, o) => {
      add(ctx, `dmg:${o.keys.target ?? ''}`, o.amount ?? 0);
      if (o.kind === 'both') add(ctx, `fav:${o.keys.target ?? ''}`, o.amount ?? 0);
    },
  }, {
    play: (ctx) => void would(ctx, [{ kind: ctx.s.n['both'] === 1 ? 'both' : 'hit', keys: { target: ctx.s.z['aim']?.[0] ?? '' }, amount: ctx.s.n['amount'] ?? 0 }]),
    cause: (ctx, t) => line(ctx, t.id ?? '', t.answer?.[0] ?? ''),
  });

  it('E B15 a unit at both thresholds: its controller picks the cause and only that line runs (passes; the game supplies the causes)', () => {
    const s1 = go(g, { n: { both: 1, amount: 2 }, z: { play: ['U'], aim: ['U'] } });
    expect(s1.prompt).toMatchObject({ kind: 'cause', min: 1, max: 1 });
    expect(ids(s1)).toEqual(['harm', 'favour']);
    const s2 = pick(g, s1, 'favour');
    expect([said(s2), zoneOf(s2, 'U'), s2.prompt, s2.result]).toEqual([['U favour'], 'discard', null, DONE]);
  });

  it('E B15 a unit its own defeat line moved away is not discarded (passes; the game supplies the "still in play" test)', () => {
    const s = go(g, { n: { amount: 1 }, z: { play: ['U2', 'V'], aim: ['U2'] } });
    expect([said(s), zoneOf(s, 'U2'), s.z['discard'], s.result]).toEqual([['U2 harm'], 'under:V', undefined, DONE]);
  });
});

describe('E B19: a cap per check counts only what the check added (K647)', () => {
  const CAP: NumberModifier = { source: 'U', op: 'cap', amount: 1, of: 'check' };
  const ORDER = { steps: ['add', 'cap'] } as const;
  // one running count per unit of everything added during the check; the cap names `of: 'check'`, so only the check's
  // own additions are capped through the scope of `numberParts`; a side effect's addition is read with `of: 'side'`
  const addCounters = (ctx: Ctx<Play>, unit: string, amount: number, of: string): void => {
    const so = ctx.s.n[`during:${unit}`] ?? 0;
    const v = numberParts(so + amount, unit === 'U' ? [CAP] : [], ORDER, { of }).value - so;
    add(ctx, `counters:${unit}`, v);
    add(ctx, `during:${unit}`, v);
  };
  const g = playGame({}, {
    play: (ctx) => {
      for (const u of ['U', 'V']) {
        addCounters(ctx, u, 2, 'check');
        addCounters(ctx, u, 1, 'side');
      }
    },
  });

  it('E B19 a check adds 2 to a unit capped at 1 per check: 1; a side effect in the same check adds its 1; another unit takes all 2 and the 1 (passes; the game supplies the running count, the kit the `of` scope)', () => {
    const s = go(g);
    expect([n(s, 'counters:U'), n(s, 'counters:V')]).toEqual([2, 3]);
  });
});

describe('E B20: a number counting a pool is read when the total is locked (K647)', () => {
  const PER: NumberModifier = { source: 'card', op: 'add', amount: 1, per: 'coins' };
  const worth = (s: PlayState): number => numberParts(0, [PER], { steps: ['add'] }, { counts: { coins: () => s.n['coins'] ?? 0 } }).value;
  const g = playGame({}, {
    play: (ctx) => {
      add(ctx, 'locked', worth(ctx.s));
      add(ctx, 'coins', -2);
      say(ctx, `locked ${String(ctx.s.n['locked'])} live ${String(worth(ctx.s))}`);
    },
  });

  it('E B20 a card worth 1 per coin, locked at 3 coins, still counts 3 after 2 coins are taken (passes; the game supplies the lock: it keeps the value read at the lock)', () => {
    expect(said(go(g, { n: { coins: 3 } }))).toEqual(['locked 3 live 1']);
  });
});

describe('E B21: a second copy of a unique card discards the first at once (K647)', () => {
  const unique: StateCheck<Play> = {
    name: 'unique',
    run: (ctx) => {
      const copies = (ctx.s.z['play'] ?? []).filter((c) => c.startsWith('lamp#'));
      if (copies.length < 2) return;
      const old = copies[0] as string;
      put(ctx, old, 'discard');
      draftOf(ctx).n = { ...ctx.s.n, [`counters:${old}`]: 0 };
      return true;
    },
  };
  const g = playGame({ ...checks(unique), happen: (ctx, o) => put(ctx, o.keys.target ?? '', 'play') }, {
    play: (ctx) => {
      ctx.then({ kind: 'next' });
      would(ctx, [{ kind: 'enter', keys: { target: 'lamp#2' } }]);
    },
    next: (ctx) => say(ctx, `next step: first copy in ${zoneOf(ctx.s, 'lamp#1') ?? ''}, counters ${String(ctx.s.n['counters:lamp#1'])} and ${String(ctx.s.n['counters:lamp#2'] ?? 0)}`),
  });

  it('E B21 a search puts the second copy into play: the first is in the discard pile before the next step; the new one has fresh counters', () => {
    const s = go(g, { n: { 'counters:lamp#1': 2 }, z: { play: ['lamp#1'], deck: ['lamp#2'] } });
    expect(said(s)).toEqual(['next step: first copy in discard, counters 0 and 0']);
    expect(s.z['play']).toEqual(['lamp#2']);
  });
  it('E B21 the same from the hand (any route)', () => {
    const s = go(g, { n: { 'counters:lamp#1': 2 }, z: { play: ['lamp#1'], hand: ['lamp#2'] } });
    expect(said(s)).toEqual(['next step: first copy in discard, counters 0 and 0']);
    expect([s.z['play'], s.z['hand']]).toEqual([['lamp#2'], []]);
  });
});

describe('E B24: a check started inside another check (K647)', () => {
  const H: G['handlers'] = {
    play: (ctx) => {
      ctx.then({ kind: 'after' });
      would(ctx, [{ kind: 'check', keys: { source: 'c1' } }]);
    },
    rest: (ctx) => say(ctx, 'c1 finishes'),
    after: (ctx) => say(ctx, `extra effects after c1: ${String(effectsOf(ctx.s, 'extra').length)}`),
  };
  const g = playGame({
    happen: (ctx, o) => {
      if (o.keys.source === 'c1') {
        addEffect(ctx, { kind: 'extra', source: 'c1', value: 1, duration: { until: 'endOfBatch', batch: o.batch, ifCancelled: 'expire' } });
        ctx.then({ kind: 'rest' });
        would(ctx, [{ kind: 'check', keys: { source: 'c2' } }]);
        return;
      }
      const cost = 1 + sumEffects(ctx.s, 'extra');
      add(ctx, 'cost', cost);
      say(ctx, `c2 fails, costs ${String(cost)}`);
    },
  }, H);

  it('E B24 recipe: counting only the batch itself (`duration.batch === occ.batch`), the inner check costs no extra; the outer finishes once; its effect ends with it (passes; the game supplies the filter)', () => {
    const own = playGame({
      happen: (ctx, o) => {
        if (o.keys.source === 'c1') {
          addEffect(ctx, { kind: 'extra', source: 'c1', value: 1, duration: { until: 'endOfBatch', batch: o.batch, ifCancelled: 'expire' } });
          ctx.then({ kind: 'rest' });
          would(ctx, [{ kind: 'check', keys: { source: 'c2' } }]);
          return;
        }
        const cost = 1 + sumEffects(ctx.s, 'extra', (e) => 'batch' in e.duration && e.duration.batch === o.batch);
        add(ctx, 'cost', cost);
        say(ctx, `c2 fails, costs ${String(cost)}`);
      },
    }, H);
    const s = go(own);
    expect(said(s)).toEqual(['c2 fails, costs 1', 'c1 finishes', 'extra effects after c1: 0']);
    expect(n(s, 'cost')).toBe(1);
  });
  it('E B24 today: an effect lasting until the outer batch ends also counts during the inner batch (the game filters by `duration.batch`); the rest holds', () => {
    const s = go(g);
    expect(said(s)).toEqual(['c2 fails, costs 2', 'c1 finishes', 'extra effects after c1: 0']);
    expect(n(s, 'cost')).toBe(2);
  });
});

describe('E B25: once the game-ending check fired (K647)', () => {
  const end: StateCheck<Play> = {
    name: 'end',
    run: (ctx) => {
      if ((ctx.s.n['wounds'] ?? 0) >= 3 && ctx.s.n['doomed'] === undefined) {
        add(ctx, 'doomed');
        say(ctx, 'ends at the end of the turn');
        return true;
      }
      if (ctx.s.n['hand'] === 0 || ctx.s.n['cannotDraw'] === 1) {
        say(ctx, 'ends now');
        draftOf(ctx).result = { ended: 'now' };
        return true;
      }
      return false;
    },
  };
  const g = playGame({
    ...checks(end),
    happen: (ctx, o) => add(ctx, o.kind === 'lose' ? 'hand' : 'wounds', o.kind === 'lose' ? -1 : 1),
    triggersFor: (_s, o) => (o.kind === 'lose' ? [{ ability: 'W', source: 'w', player: 'p1' }] : []),
    resolveTrigger: (ctx) => add(ctx, 'gain'),
  }, {
    play: (ctx) => ctx.then(...(ctx.s.z['script'] ?? []).map((kind) => ({ kind }))),
    lose: (ctx) => void would(ctx, [{ kind: 'lose' }]),
    wound: (ctx) => void would(ctx, [{ kind: 'wound' }]),
    refresh: (ctx) => {
      add(ctx, 'cannotDraw');
      ctx.then(CP);
    },
    step: (ctx) => say(ctx, 'next step'),
    turnEnd: (ctx) => {
      if (ctx.s.n['doomed'] !== 1) return;
      add(ctx, 'lingering');
      say(ctx, 'turn ends');
      draftOf(ctx).result = { ended: 'turnEnd' };
    },
  });

  it('E B25 a response queued when the ending check fires is never offered', () => {
    const s = go(g, { n: { hand: 1 }, z: { script: ['lose', 'step'] } });
    expect([s.result, s.prompt, s.stack, n(s, 'gain'), said(s)]).toEqual([{ ended: 'now' }, null, [], undefined, ['ends now']]);
  });
  it('E B25 a third wound mid-turn: the turn finishes and the game ends at its end, the lasting wound added then (passes; the game supplies the wait)', () => {
    const s = go(g, { z: { script: ['wound', 'wound', 'wound', 'step', 'turnEnd'] } });
    expect([said(s), n(s, 'lingering'), s.result]).toEqual([['ends at the end of the turn', 'next step', 'turn ends'], 1, { ended: 'turnEnd' }]);
  });
  it('E B25 a player who cannot draw at refresh ends the game at once, before the next step', () => {
    const s = go(g, { z: { script: ['refresh', 'step', 'turnEnd'] } });
    expect([said(s), s.result, s.stack, s.prompt]).toEqual([['ends now'], { ended: 'now' }, [], null]);
  });
});

describe('I B13: answers with repeats, a capped list keeping "stop" (K647)', () => {
  const g = (k: number, min: number, max: number) =>
    playGame({}, { play: (ctx) => ctx.ask({ ...pickOne('many', Array.from({ length: k }, (_, i) => `o${String(i)}`)), min, max }, { kind: 'noop' }), noop: () => undefined });

  it('I B13 today: a prompt has no repeats: a repeated pick is refused, and 3 options with 1 to 2 picks list 6 answers, not 9 (cannot be expressed)', () => {
    const s = go(g(3, 1, 2));
    expect(refusal(validateAction(s, answer(s, 'o0', 'o0')))).toMatch(/^BAD_CHOICE: Each option/);
    expect(enumerateAnswers(s)).toHaveLength(6);
  });
  it('I B13 today: the list has no cap: 12 options with 0 to 12 picks list all 4096 answers (cannot be expressed)', () => {
    expect(enumerateAnswers(go(g(12, 0, 12)))).toHaveLength(4096);
  });
  it('I B13 recipe: the game caps the list itself and keeps "stop" in the last place (helpers.md); 12 options and "stop" capped at 512 (passes; the game supplies the cap)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `o${String(i)}`, enabled: true }));
    const gs = playGame({}, { play: (ctx) => ctx.ask({ ...pickOne('many', []), min: 0, max: 12, options: [...many, { id: 'stop', enabled: true, alone: true }] }, { kind: 'noop' }), noop: () => undefined });
    const all = enumerateAnswers(go(gs));
    const stop = all.filter((a) => a.picks.includes('stop'));
    const list = [...all.filter((a) => !a.picks.includes('stop')).slice(0, 512 - stop.length), ...stop];
    expect(all).toHaveLength(4097);
    expect(list).toHaveLength(512);
    expect(list.at(-1)?.picks).toEqual(['stop']);
    expect(list.slice(0, -1).some((a) => a.picks.includes('stop'))).toBe(false);
  });
});

describe('I B14: the game ending in the middle of an effect drops everything scheduled (K647)', () => {
  const g = playGame({}, {
    play: (ctx) => ctx.then({ kind: 'take' }, { kind: 'gain' }, { kind: 'choose' }),
    take: (ctx) => {
      add(ctx, 'pile', -1);
      if (ctx.s.n['pile'] !== 0) return;
      say(ctx, 'collapse');
      draftOf(ctx).result = { ended: 'collapse' };
      ctx.then({ kind: 'gain' });
      ctx.ask(pickOne('late', ['x']), { kind: 'gain' });
    },
    gain: (ctx) => add(ctx, 'wood', 2),
    choose: (ctx) => ctx.ask(pickOne('choose', ['a', 'b']), { kind: 'gain' }),
  });

  it('I B14 the last penalty card ends the game at once: no wood, no prompt, an empty stack, the log ends there; then and ask do nothing after', () => {
    const s = go(g, { n: { pile: 1 } });
    expect([s.result, n(s, 'wood'), s.prompt, s.stack]).toEqual([{ ended: 'collapse' }, undefined, null, []]);
    expect(s.log.at(-1)).toMatchObject({ type: 'said', text: 'collapse' });
    expect(refusal(validateAction(s, answer(s, 'x')))).toMatch(/^GAME_OVER/);
  });
});

describe('E B17: a forced choice taken without asking gives the same game as asking it (K647)', () => {
  const game = (take: boolean) =>
    playGame({}, {
      play: (ctx) => {
        ctx.then({ kind: 'chosen' });
        const p = { ...pickOne('rescue', ['a']), options: [{ id: 'a', enabled: true }, bar('b', 'noTarget')] };
        if (take) askOrTake(ctx, p);
        else ctx.ask(p);
      },
      chosen: (ctx, t) => say(ctx, `chose ${t.answer?.[0] ?? ''}`),
    });
  const asked = (() => {
    const g = game(false);
    return pick(g, go(g), 'a');
  })();
  const taken = go(game(true));

  it.fails('E B17 (defect, fix row K652: askOrTake advances promptSeq) the game with the only answer taken equals the one where it was asked: the same final hash and events', () => {
    expect(said(taken)).toEqual(['chose a']);
    expect(taken.log).toEqual(asked.log);
    expect(hashState(taken)).toBe(hashState(asked));
  });
  it('E B17 today: the same events and state except `promptSeq`, which counts the prompt asked, so the hashes differ', () => {
    expect(said(taken)).toEqual(['chose a']);
    expect(taken.log).toEqual(asked.log);
    expect(taken.promptSeq).toBe(asked.promptSeq - 1);
    expect(hashState({ ...taken, promptSeq: 0 })).toBe(hashState({ ...asked, promptSeq: 0 }));
    expect(hashState(taken)).not.toBe(hashState(asked));
  });
  it('E B17 K652 a later prompt has the same id whether the earlier single-answer prompt was taken or asked', () => {
    const later = (take: boolean) => {
      const g = playGame({}, {
        play: (ctx) => {
          ctx.then({ kind: 'chosen' });
          const p = { ...pickOne('rescue', ['a']), options: [{ id: 'a', enabled: true }, bar('b', 'noTarget')] };
          if (take) askOrTake(ctx, p);
          else ctx.ask(p);
        },
        chosen: (ctx) => ctx.ask(pickOne('next', ['x', 'y']), { kind: 'noop' }),
        noop: () => undefined,
      });
      const s = go(g);
      return take ? s : pick(g, s, 'a');
    };
    const [t, a] = [later(true), later(false)];
    expect([t.prompt?.kind, a.prompt?.kind]).toEqual(['next', 'next']);
    expect(t.prompt?.id).toBe(a.prompt?.id);
  });
});

describe('E B23: cancel an action until hidden information is revealed (K647)', () => {
  const g = playGame({}, {
    play: (ctx) => ctx.ask(pickOne('target', ['t1']), { kind: 'target' }),
    target: (ctx) => ctx.ask(pickOne('pay', ['coin']), { kind: 'pay' }),
    pay: (ctx) => {
      add(ctx, 'coins', -1);
      ctx.ask(pickOne('commit', ['commit']), { kind: 'commit' });
    },
    commit: (ctx) => {
      ctx.emit({ type: 'did', text: 'drew the challenge', reveal: true });
      ctx.ask(pickOne('after', ['ok']), { kind: 'noop' });
    },
    noop: () => undefined,
  });
  const s0 = startPlay(g, { n: { coins: 3 } });
  const atCommit = ['target', 'pay'].reduce((h, _x) => extendStep(g, h, answer(h.state, h.state.prompt?.options[0]?.id ?? ''), null).history, addStep(g, newSteps<Play>(s0), answer(s0, 'go'), null).history);

  it('E B23 cancelling at the third prompt gives the state before the action back, payment included; after the reveal there is no cancel (passes; the game supplies which answers join the step and the reveal mark)', () => {
    expect([atCommit.state.prompt?.kind, n(atCommit.state, 'coins')]).toEqual(['commit', 2]);
    const back = undoStep(g, atCommit, 'safe', null);
    expect(back.ok).toBe(true);
    expect(hashState(back.history.state)).toBe(hashState(s0));
    expect(n(back.history.state, 'coins')).toBe(3);
    const after = extendStep(g, atCommit, answer(atCommit.state, 'commit'), null).history;
    expect(after.state.prompt?.kind).toBe('after');
    expect(canUndoStep(after, 'safe').ok).toBe(false);
    expect(undoStep(g, after, 'safe', null).ok).toBe(false);
  });
});
