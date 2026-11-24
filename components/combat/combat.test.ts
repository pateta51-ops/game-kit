import { describe, expect, it } from 'vitest';
import { describeEffect, effectTasks, expectVerbs, validateEffect, verbHandler } from '../card-language/index.ts';
import { cardPack } from '../card-language/pack.ts';
import { applyAction, draftOf, hashState, replay, type GameRules } from '../engine-core/kernel.ts';
import { cancelBatch, changeOccurrence, PASS, type Replacement, type TimingConfig, would } from '../engine-core/timed.ts';
import { answer, startTimed, timedGame, type Timed } from '../engine-core/fake/timed.ts';
import { combatDamageKind, combatHappen, combatKinds, combatVerbs, healthAdjustment, queueCombat, type CombatPolicy, type CombatStep, type Damage } from './index.ts';

const ATTACK: CombatStep = { op: 'attack', source: 'p1-unit', target: 'p2-unit', player: 'p2', amount: 3 };
const HIT: Damage = { op: 'damage', source: 'p1-unit', target: 'p2-unit', player: 'p2', amount: 6 };
const DEFEAT: CombatStep = { op: 'defeat', source: 'p1-unit', target: 'p2-unit', player: 'p2' };
const RESCUE: Replacement = { id: 1, cls: 1, controller: 'p2', label: 'Rescue it' };

const verbs = combatVerbs<Timed>({
  attack: ({ target }) => `Attack ${target}.`,
  damage: ({ target, amount }) => `Deal ${String(amount)} damage to ${target}.`,
  defeat: ({ target }) => `Defeat ${target}.`,
});
const pack = cardPack<Timed>({ res: {
  get(s, _seat, key) { if (key !== 'health') throw new Error('unknown resource'); return s.hp; },
  set(ctx, _seat, key, n) { if (key !== 'health') throw new Error('unknown resource'); draftOf(ctx).hp = n; },
} });

function battle(steps: readonly CombatStep[], timing: Partial<TimingConfig<Timed>> = {}, overrides: Partial<CombatPolicy<Timed>> = {}): GameRules<Timed> {
  const combat = combatHappen<Timed>({
    attack(_ctx, attack) {
      return attack.amount !== undefined && attack.amount < 5 ? [{ ...attack, op: 'damage', amount: 6 }] : [];
    },
    armor(_ctx, damage) { return damage.damageType === 'ember' ? 1 : 2; },
    applyDamage(ctx, damage, amount) {
      pack.verbs.adjust.run!(ctx, healthAdjustment('health', amount), { seat: damage.player });
      ctx.emit({ type: 'damaged', n: amount, target: damage.target });
      return ctx.s.hp === 0;
    },
    defeat(ctx) { draftOf(ctx).used = { ...ctx.s.used, defeated: 1 + (ctx.s.used.defeated ?? 0) }; },
    ...overrides,
  });
  return timedGame({
    ...timing,
    happen(ctx, occurrence) { if (!combat(ctx, occurrence)) timing.happen?.(ctx, occurrence); },
    event: () => undefined,
  }, {
    verb: verbHandler<Timed>({ ...pack.verbs, ...verbs }),
    chosen(ctx) { ctx.then(...effectTasks(steps), { kind: 'end' }); },
    rescue(ctx) { draftOf(ctx).hp = 1; },
  });
}

const take = (game: GameRules<Timed>, pick = 'hit', state = startTimed(game)) => {
  const action = answer(state, pick);
  return applyAction(game, state, action, null);
};

describe('K550 combat through card verbs and engine timing', () => {
  it('validates and prints data, runs a game-owned lower-wins comparison, and applies armor through real card adjust', () => {
    expectVerbs(verbs, [ATTACK, HIT, DEFEAT]);
    expect(describeEffect(verbs, [HIT])).toBe('Deal 6 damage to p2-unit.');
    expect(validateEffect(verbs, [{ ...HIT, amount: -1 }])).toHaveLength(1);
    const game = battle([ATTACK]);
    const before = startTimed(game);
    const resolved = take(game, 'hit', before);
    expect(before.hp).toBe(10);
    expect(resolved.state.hp).toBe(6);
    expect(resolved.events).toMatchObject([{ type: 'damaged', n: 4, target: 'p2-unit' }]);
    expect(resolved.state.timing?.occurrences).toMatchObject([
      { kind: combatKinds.attack, amount: 3, state: 'happened' },
      { kind: combatKinds.damage, amount: 6, state: 'happened' },
    ]);
    expect(take(battle([{ ...ATTACK, amount: 5 }])).state.hp).toBe(10);
  });

  it('prevents before armor, retains the damage kind, and replays exactly through the prevention prompt', () => {
    const ember: Damage = { ...HIT, damageType: 'ember' };
    const game = battle([ember], {
      preventions: (s, occ) => occ.kind === combatDamageKind('ember') ? [
        { id: 'shield', prevention: { prevents: occ.kind, max: 2, uses: 1 }, used: s.used.shield ?? 0 },
      ] : [],
      onPrevent(ctx) { draftOf(ctx).used = { ...ctx.s.used, shield: 1 }; },
    });
    const starting = startTimed(game);
    const open = take(game, 'hit', starting).state;
    expect(open.prompt?.player).toBe('p2');
    expect(open.hp).toBe(10);
    const closed = take(game, 'shield', open);
    expect(closed.state.hp).toBe(7);
    expect(closed.events).toMatchObject([{ type: 'damaged', n: 3, target: 'p2-unit' }]);
    expect(closed.state.timing?.occurrences).toMatchObject([{ kind: 'combat.damage.ember', amount: 4, prevented: 2 }]);
    const replayed = replay(game, { seed: 'k93' }, starting.rules, [answer(starting, 'hit'), answer(open, 'shield')], null);
    expect(replayed.ok).toBe(true);
    expect(replayed.hash).toBe(hashState(closed.state));
  });

  it('distinguishes piercing, unpreventable, fully absorbed, and fully prevented damage', () => {
    const prevention: Partial<TimingConfig<Timed>> = {
      preventions: (_state, occ) => [{ id: 'shield', prevention: { prevents: occ.kind, max: 20 } }],
    };
    const piercing = take(battle([{ ...HIT, damageType: 'piercing' }])).state;
    expect(piercing.hp).toBe(4);
    const throughShield = take(battle([{ ...HIT, unpreventable: true }], prevention)).state;
    expect(throughShield.prompt).toBeNull();
    expect(throughShield.hp).toBe(6);
    const absorbed = take(battle([{ ...HIT, amount: 2 }]));
    expect(absorbed.state.hp).toBe(10);
    expect(absorbed.events).toEqual([]);
    const fatal = battle([{ ...HIT, amount: 20 }], prevention);
    const offered = take(fatal).state;
    expect(take(fatal, PASS, offered).state.used.defeated).toBe(1);
    const blocked = take(fatal, 'shield', offered);
    expect(blocked.state.hp).toBe(10);
    expect(blocked.state.used.defeated).toBeUndefined();
    expect(blocked.state.timing?.occurrences).toMatchObject([{ kind: combatKinds.damage, state: 'cancelled' }]);
  });

  it('runs defeat through its own replacement window, and allows a game to schedule defeat directly', () => {
    const fatal = { ...HIT, amount: 20 };
    const plain = take(battle([fatal])).state;
    expect(plain.hp).toBe(0);
    expect(plain.used.defeated).toBe(1);
    expect(plain.timing?.occurrences).toMatchObject([
      { kind: combatKinds.damage, state: 'happened' },
      { kind: combatKinds.defeat, state: 'happened' },
    ]);
    const rescued = take(battle([fatal], {
      replacementsFor: (_s, occurrence) => occurrence.kind === combatKinds.defeat ? [RESCUE] : [],
      applyReplacement(ctx) { ctx.then({ kind: 'rescue' }); return 'replaced'; },
    })).state;
    expect(rescued.hp).toBe(1);
    expect(rescued.used.defeated).toBeUndefined();
    expect(rescued.timing?.occurrences?.[1]).toMatchObject({ kind: combatKinds.defeat, state: 'cancelled' });
    expect(take(battle([DEFEAT])).state.used.defeated).toBe(1);
  });

  it('uses replacement-adjusted damage and leaves other occurrence kinds to the existing timing handler', () => {
    const game = battle([HIT], {
      replacementsFor: (_s, occurrence) => occurrence.kind === combatKinds.damage ? [RESCUE] : [],
      applyReplacement(ctx, _reaction, occurrence) { changeOccurrence(ctx, occurrence.id, { amount: 3 }); return 'updated'; },
      before(ctx, occurrence) { if (occurrence.kind === combatKinds.damage) would(ctx, [{ kind: 'heal', amount: 2 }]); },
      happen(ctx, occurrence) { if (occurrence.kind === 'heal') draftOf(ctx).hp += 2; },
    });
    expect(take(game).state.hp).toBe(11);
  });

  it('cancels an attack before the game computes damage and resumes the engine continuation', () => {
    const game = battle([ATTACK], {
      before(ctx, occurrence) { if (occurrence.kind === combatKinds.attack) cancelBatch(ctx, occurrence.batch); },
    }, { attack() { throw new Error('cancelled attack ran'); } });
    const state = take(game).state;
    expect(state.result).toEqual({ hp: 10 });
    expect(state.timing?.occurrences).toMatchObject([{ kind: combatKinds.attack, state: 'cancelled' }]);
  });

  it('validates an entire queue before scheduling it and reports invalid armor without changing the input state', () => {
    for (const invalid of [{ ...HIT, amount: -1 }, { ...HIT, amount: Infinity }, { ...HIT, amount: 2 ** 53 }, { ...HIT, target: '' }]) {
      const base = battle([]);
      const bad: typeof base = { ...base, handlers: { ...base.handlers, chosen(ctx) { queueCombat(ctx, [HIT, invalid]); } } };
      const state = startTimed(bad);
      const before = hashState(state);
      expect(() => take(bad, 'hit', state)).toThrow('combat');
      expect(hashState(state)).toBe(before);
      expect(state.timing).toBeUndefined();
    }
    const badArmor = battle([HIT], {}, { armor() { return -2; } });
    const state = startTimed(badArmor);
    expect(() => take(badArmor, 'hit', state)).toThrow('armor');
    expect(state.hp).toBe(10);
  });
});
