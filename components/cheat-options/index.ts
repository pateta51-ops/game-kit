// K738 (Dice Commandos GameOptions.cheats, allowCheats, cheated; written new): cheat options a game declares as data,
// applied only as engine-core kernel `set` debug edits (recorded, replayed, saved), gated by `allowCheats`.
import type { DebugAction } from '../engine-core/index.ts';
import type { SetupSpec, Setup } from '../screens/index.ts';

export type CheatPath = readonly (string | number)[];
/** `add` (default): the value at `path` plus the amount; `set`: the amount. Amount: the chosen number times `by` (default 1), or `by` for a toggle that is on. */
export interface CheatEdit { readonly path: CheatPath; readonly op?: 'add' | 'set'; readonly by?: number; readonly min?: number; readonly max?: number }
export interface CheatDef {
  readonly id: string;
  readonly label: string;
  readonly kind: 'number' | 'toggle';
  /** `setup`: once, right after the game is created; `round`: at the start and at each change of the round. */
  readonly when: 'setup' | 'round';
  readonly edits: readonly CheatEdit[];
  /** Highest number the form offers (default 5). */
  readonly max?: number;
}
export type CheatValues = Readonly<Record<string, number | boolean>>;
export interface CheatChoice { readonly allowCheats?: boolean; readonly cheats?: CheatValues }

const at = (s: unknown, p: CheatPath): unknown => p.reduce<unknown>((o, k) => (o === null || typeof o !== 'object' ? undefined : (o as Record<string | number, unknown>)[k]), s);

/** The debug edits of the cheats due `when`, each a kernel `set` tagged `args.cheat`; [] with `allowCheats` off. Values are read from `state` (edits on one path add up). */
export function cheatActions(defs: readonly CheatDef[], choice: CheatChoice, state: unknown, when: CheatDef['when']): DebugAction[] {
  if (choice.allowCheats !== true || choice.cheats === undefined) return [];
  const out: DebugAction[] = [];
  const cur = new Map<string, number>();
  for (const d of defs) {
    const v = choice.cheats[d.id];
    if (d.when !== when || v === undefined || v === false || v === 0) continue;
    for (const e of d.edits) {
      const amount = (typeof v === 'number' ? v : 1) * (e.by ?? 1);
      const key = JSON.stringify(e.path);
      const was = cur.get(key) ?? at(state, e.path);
      const value = e.op === 'set' ? amount : (typeof was === 'number' ? was : 0) + amount;
      cur.set(key, value);
      out.push({ kind: 'debug', verb: 'set', args: { path: [...e.path], value, ...(e.min === undefined ? {} : { min: e.min }), ...(e.max === undefined ? {} : { max: e.max }), cheat: d.id } });
    }
  }
  return out;
}

/** True when any debug edit was played (a cheat or a debug-console edit): the game's `cheated` mark. */
export const cheatedOf = (actions: readonly unknown[]): boolean => actions.some((a) => (a as { kind?: string }).kind === 'debug');

/** Why the choice is refused at set-up (cheats without `allowCheats`, an unknown id, a wrong value), or null. */
export function cheatProblem(defs: readonly CheatDef[], choice: CheatChoice): string | null {
  const c = choice.cheats ?? {};
  if (Object.keys(c).length > 0 && choice.allowCheats !== true) return 'cheats: refused without allowCheats';
  for (const [id, v] of Object.entries(c)) {
    const d = defs.find((x) => x.id === id);
    if (d === undefined) return `cheats: no cheat "${id}"`;
    if (d.kind === 'toggle' ? typeof v !== 'boolean' : typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > (d.max ?? 5)) return `cheats: bad value for "${id}"`;
  }
  return null;
}

/** screens `SetupSpec.extra` fields for the cheats (key `cheat.<id>`); none with `allowCheats` off. */
export const cheatFields = (defs: readonly CheatDef[], allowCheats: boolean, words: { off?: string; on?: string } = {}): NonNullable<SetupSpec['extra']> =>
  allowCheats ? defs.map((d) => ({
    key: `cheat.${d.id}`, label: d.label, default: d.kind === 'toggle' ? 'off' : '0',
    options: d.kind === 'toggle' ? [{ value: 'off', label: words.off ?? 'Off' }, { value: 'on', label: words.on ?? 'On' }] : Array.from({ length: (d.max ?? 5) + 1 }, (_, i) => ({ value: String(i), label: String(i) })),
  })) : [];

/** The chosen cheats from a screens `Setup` (only those set). */
export function cheatsFrom(defs: readonly CheatDef[], setup: Setup): CheatValues {
  const out: Record<string, number | boolean> = {};
  for (const d of defs) {
    const v = setup[`cheat.${d.id}`];
    if (d.kind === 'toggle' ? v === 'on' : Number(v) > 0) out[d.id] = d.kind === 'toggle' ? true : Number(v);
  }
  return out;
}

/** What game-store `defineGame({ cheats })` takes: the declarations, the choice from the options (default: the options themselves), the round (default `state.flow.round`, turn-flow's). */
export interface CheatConfig<O = unknown, S = unknown> {
  readonly defs: readonly CheatDef[];
  readonly choice?: (options: O) => CheatChoice;
  readonly round?: (state: S) => number | undefined;
}
export const roundOf = <O, S>(c: CheatConfig<O, S>, state: S): number | undefined => (c.round ?? ((s: S) => (s as { flow?: { round?: number } }).flow?.round))(state);
