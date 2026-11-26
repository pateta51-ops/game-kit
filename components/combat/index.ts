import { bool, optional, type Field, type VerbTable } from '../card-language/index.ts';
import type { PackStep } from '../card-language/pack.ts';
import { EngineBugError, type Ctx, type GameTypes } from '../engine-core/kernel.ts';
import { would, type Occurrence, type OccurrenceInput, type OccurrenceKeys } from '../engine-core/timed.ts';

export const combatKinds = { attack: 'combat.attack', damage: 'combat.damage', defeat: 'combat.defeat' } as const;
const typedDamage = combatKinds.damage + '.';

export interface CombatTarget {
  /** The target's player, who receives timing choices by default. */
  readonly player: string;
  readonly target: string;
  readonly source?: string;
}

export interface Attack extends CombatTarget {
  readonly op: 'attack';
  readonly source: string;
  /** An optional input to the game's attack calculation. */
  readonly amount?: number;
}

export interface Damage extends CombatTarget {
  readonly op: 'damage';
  readonly amount: number;
  /** `piercing` skips armor. Other types use the selected armor policy. */
  readonly damageType?: string;
  readonly unpreventable?: boolean;
}

export interface Defeat extends CombatTarget {
  readonly op: 'defeat';
}

export type CombatStep = Attack | Damage | Defeat;

export interface CombatPolicy<G extends GameTypes> {
  /** Read the current state and return the damage due after this attack's timing windows. */
  attack(ctx: Ctx<G>, attack: Attack): readonly Damage[];
  /** Flat armor to subtract from damage left after prevention. Omitted armor is zero. */
  armor?(ctx: Ctx<G>, damage: Damage): number;
  /** Apply positive damage synchronously and return true to queue defeat of this target. */
  applyDamage(ctx: Ctx<G>, damage: Damage, amount: number): boolean;
  /** Apply defeat to the live target under the game's rules. */
  defeat(ctx: Ctx<G>, defeat: Defeat): void;
}

const idField: Field = value => typeof value === 'string' && value.length > 0 && value === value.trim() ? null : 'a non-empty unpadded ID';
const amountField: Field = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? null : 'a nonnegative safe integer';

function id(value: string | undefined, name: string): string {
  if (value === undefined || idField(value) !== null) throw new EngineBugError(`combat: ${name} must be a non-empty unpadded ID`);
  return value;
}

function amount(value: number | undefined, name: string): number {
  if (value === undefined || amountField(value) !== null) throw new EngineBugError(`combat: ${name} must be a nonnegative safe integer`);
  return value;
}

export function combatDamageKind(damageType?: string): string {
  return damageType === undefined ? combatKinds.damage : typedDamage + id(damageType, 'damage type');
}

function targetOf(keys: OccurrenceKeys): CombatTarget {
  return {
    player: id(keys.player, 'player'), target: id(keys.target, 'target'),
    ...(keys.source === undefined ? {} : { source: id(keys.source, 'source') }),
  };
}

function occurrenceOf(step: CombatStep): OccurrenceInput {
  const keys = targetOf(step);
  const op: string = step.op;
  switch (step.op) {
    case 'attack':
      id(step.source, 'attack source');
      return { kind: combatKinds.attack, keys, ...(step.amount === undefined ? {} : { amount: amount(step.amount, 'attack amount') }) };
    case 'damage':
      if (step.unpreventable !== undefined && bool(step.unpreventable) !== null) throw new EngineBugError('combat: unpreventable must be boolean');
      return {
        kind: combatDamageKind(step.damageType), keys, amount: amount(step.amount, 'damage amount'),
        ...(step.unpreventable === true ? { unpreventable: true } : {}),
      };
    case 'defeat': return { kind: combatKinds.defeat, keys };
    default: throw new EngineBugError(`combat: unknown step ${op}`);
  }
}

/** Queue one engine timing batch. Empty plans leave the engine unchanged. */
export function queueCombat<G extends GameTypes>(ctx: Ctx<G>, steps: readonly CombatStep[]): number | undefined {
  if (steps.length === 0) return undefined;
  return would(ctx, steps.map(occurrenceOf));
}

/** Offer combat occurrences to this handler before falling back to the game's other timing rules. */
export function combatHappen<G extends GameTypes>(policy: CombatPolicy<G>): (ctx: Ctx<G>, occurrence: Occurrence) => boolean {
  return (ctx, occurrence) => {
    const kind = occurrence.kind;
    if (kind === combatKinds.attack) {
      const target = targetOf(occurrence.keys);
      const source = id(target.source, 'attack source');
      queueCombat(ctx, policy.attack(ctx, {
        ...target, op: 'attack', source,
        ...(occurrence.amount === undefined ? {} : { amount: amount(occurrence.amount, 'attack amount') }),
      }));
    } else if (kind === combatKinds.defeat) {
      policy.defeat(ctx, { ...targetOf(occurrence.keys), op: 'defeat' });
    } else if (kind === combatKinds.damage || kind.startsWith(typedDamage)) {
      const damageType = kind === combatKinds.damage ? undefined : id(kind.slice(typedDamage.length), 'damage type');
      const target = targetOf(occurrence.keys);
      const incoming = amount(occurrence.amount, 'damage amount');
      const damage: Damage = {
        ...target, op: 'damage', amount: incoming,
        ...(damageType === undefined ? {} : { damageType }),
        ...(occurrence.unpreventable === true ? { unpreventable: true } : {}),
      };
      const armor = damageType === 'piercing' ? 0 : amount(policy.armor?.(ctx, damage) ?? 0, 'armor');
      const applied = Math.max(0, incoming - armor);
      if (applied > 0 && policy.applyDamage(ctx, damage, applied)) queueCombat(ctx, [{ ...target, op: 'defeat' }]);
    } else return false;
    return true;
  };
}

/** Build a card-language adjustment for damage against remaining health. */
export function healthAdjustment(key: string, damage: number): Extract<PackStep, { op: 'adjust' }> {
  amount(damage, 'damage amount');
  return { op: 'adjust', key: id(key, 'health key'), by: damage === 0 ? 0 : -damage, min: 0 };
}

export type CombatWords = { readonly [K in CombatStep['op']]: (step: Extract<CombatStep, { op: K }>) => string };

/** Add combat data to a card-language verb table. The game supplies the printed words. */
export function combatVerbs<G extends GameTypes>(words: CombatWords): VerbTable<G, CombatStep> {
  const run = (ctx: Ctx<G>, step: CombatStep): void => { queueCombat(ctx, [step]); };
  const targets = { source: optional(idField), target: idField, player: idField };
  return {
    attack: { fields: { ...targets, source: idField, amount: optional(amountField) }, run, text: words.attack },
    damage: { fields: { ...targets, amount: amountField, damageType: optional(idField), unpreventable: optional(bool) }, run, text: words.damage },
    defeat: { fields: targets, run, text: words.defeat },
  };
}
