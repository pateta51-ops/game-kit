// K100 (ArkhamHorror Debug* messages and Marvel card edits: ideas only, no licence; netrunner commands.clj, MIT: the
// verb list): debug edits as engine actions, so they are recorded, replayed, saved and undone like answers. An edit
// keeps the open prompt, a refused edit changes nothing, and kernel edits emit no events (a game verb's carry `debug`).
import { closeDraft, copyList, openDraft, own } from './cow.ts';
import { freezeState } from './copy.ts';
import { makeCtx, setCtxDebug } from './ctx.ts';
import { isChecking } from './apply.ts';
import type { Draft } from './draft.ts';
import { IllegalActionError } from './errors.ts';
import { GameOver } from './gameOver.ts';
import { run } from './runner.ts';
import type { ApplyResult, DebugAction, ForcedRoll, GameRules, GameTypes, HandlerTable, KernelState, KernelTask } from './types.ts';

/** The verbs the kernel itself answers. */
export const KERNEL_VERBS = ['set', 'force', 'close'] as const;
const KERNEL_KEYS = new Set(['rng', 'stack', 'prompt', 'result', 'seq', 'promptSeq', 'log', 'forced']);

/** Every debug verb a game accepts (kernel verbs first), or [] when it has not opted in. */
export const debugVerbs = <G extends GameTypes>(game: GameRules<G>): string[] =>
  game.debug === undefined ? [] : [...KERNEL_VERBS, ...Object.keys(game.debug)];

const refuse = (msg: string): never => {
  throw new IllegalActionError(`DEBUG_REFUSED: ${msg}`);
};
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function setAt(s: Draft<KernelState>, args: Readonly<Record<string, unknown>>): void {
  const { path, value, min, max } = args;
  if (!Array.isArray(path) || path.length === 0 || path.some((k) => typeof k !== 'string' && typeof k !== 'number')) refuse('set needs a path (a list of keys)');
  const keys = path as (string | number)[];
  if (KERNEL_KEYS.has(String(keys[0]))) refuse(`"${String(keys[0])}" is the kernel's`);
  if (!isNum(value) || (min !== undefined && !isNum(min)) || (max !== undefined && !isNum(max))) refuse('set needs a number value (and number min, max)');
  let parent = s as unknown as Record<string | number, unknown>;
  for (const k of keys.slice(0, -1)) {
    const next = own(parent, k);
    if (next === null || typeof next !== 'object') refuse(`no object at ${keys.join('.')}`);
    parent = next as Record<string | number, unknown>;
  }
  const last = keys[keys.length - 1] as string | number;
  if (!isNum(parent[last])) refuse(`${keys.join('.')} is not a number`);
  parent[last] = Math.min((max as number | undefined) ?? Infinity, Math.max((min as number | undefined) ?? -Infinity, value as number));
}

function force(s: Draft<KernelState>, args: Readonly<Record<string, unknown>>): void {
  const { values, name } = args;
  if (!Array.isArray(values) || values.length === 0 || values.some((v) => !Number.isInteger(v) || (v as number) < 0)) refuse('force needs values (whole numbers from 0)');
  if (name !== undefined && typeof name !== 'string') refuse('force: name is a string');
  const add = (values as number[]).map((value): ForcedRoll => (name === undefined ? { value } : { value, name: name as string }));
  s.forced = [...(s.forced ?? []), ...add];
}

/** Applies a debug edit; `applyAction` sends `kind: 'debug'` here. Throws `IllegalActionError` (nothing changed) when refused. */
export function applyDebug<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  action: DebugAction,
  content: G['content'],
  table: HandlerTable<G>,
): ApplyResult<G> {
  if (game.debug === undefined) refuse('this game takes no debug edits');
  const args = action.args ?? {};
  const verb = game.debug?.[action.verb];
  if (!(KERNEL_VERBS as readonly string[]).includes(action.verb) && verb === undefined) refuse(`no debug verb "${action.verb}"`);
  const events: G['event'][] = [];
  const next = { ...state } as Draft<KernelState>;
  next.stack = copyList(state.stack) as Draft<KernelTask>[];
  const prev = openDraft(next, false);
  try {
    const ctx = makeCtx(game, next as Draft<G['state']>, content, events);
    if (action.verb === 'set') setAt(next, args);
    else if (action.verb === 'force') force(next, args);
    else if (action.verb === 'close') {
      if (next.prompt === null) refuse('no prompt is open');
      next.prompt = null;
      next.stack.pop();
    } else if (verb !== undefined) {
      const open = next.prompt !== null;
      const depth = next.stack.length;
      setCtxDebug(ctx, true);
      const why = verb(ctx, args);
      setCtxDebug(ctx, false);
      if (why !== undefined) refuse(why);
      if (open && next.stack.length !== depth) refuse('an edit cannot schedule tasks while a prompt is open');
    }
    try {
      run(ctx, table);
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
  } finally {
    closeDraft(prev);
  }
  const out = freezeState(next) as G['state'];
  return { state: out, events, violations: isChecking() ? (game.invariants?.(out, content, events, state) ?? []) : [] };
}
