// A frozen copy of legal.ts as main had it before K641, for the differential test in unseen.diff.test.ts. Never edit, never import in a game.
// K88 (marvel-champions-digital-game `legal.ts`, `choices.ts`, AGPL-3.0; idea only, written new): a barred option keeps
// a reason code and, for a missing target, what was missing, read when the prompt opened. `askOrTake` takes the only
// legal option without asking and returns the notice the UI shows (every option, the taken one, each barred one).
import { draftOf } from '../ctx.ts';
import type { Ctx, GameTypes, KernelOption, KernelPrompt } from '../types.ts';

export interface Blocked {
  readonly id: string;
  readonly reason: string;
  readonly why: string | undefined;
  readonly missing: string | undefined;
}

export interface OnlyOneNotice {
  readonly taken: string;
  readonly options: readonly KernelOption[];
}

/** A barred option: `reason` a code (e.g. condition, cannotChoose, cannotPay, noTarget), `why` the words, `missing` what was missing. */
export const bar = (id: string, reason: string, why?: string, missing?: string): KernelOption => ({
  id,
  enabled: false,
  reason,
  ...(why === undefined ? {} : { why }),
  ...(missing === undefined ? {} : { missing }),
});

/** The barred options of a prompt with their codes (an option barred without a code gets `barred`). */
export const blocked = (p: Pick<KernelPrompt, 'options'> | null): Blocked[] =>
  (p?.options ?? []).filter((o) => !o.enabled).map((o) => ({ id: o.id, reason: o.reason ?? 'barred', why: o.why, missing: o.missing }));

/** The notice when the prompt leaves one legal answer (one enabled option, one pick required), else null. */
export function onlyOne(p: Pick<KernelPrompt, 'options' | 'min' | 'max'>): OnlyOneNotice | null {
  const on = p.options.filter((o) => o.enabled && o.alone !== true);
  const lone = p.options.filter((o) => o.enabled && o.alone === true);
  const o = lone.length === 0 ? on[0] : lone[0];
  return o !== undefined && (lone.length === 0 ? on.length === 1 && p.min === 1 && p.max >= 1 : lone.length === 1 && on.length < p.min) ? { taken: o.id, options: p.options } : null;
}

/** `ctx.ask`, except that a prompt with one legal answer is answered at once (the resume task on top gets it) and its notice returned. */
export function askOrTake<G extends GameTypes>(ctx: Ctx<G>, prompt: Omit<G['prompt'], 'id'>): OnlyOneNotice | null {
  const n = onlyOne(prompt);
  const s = draftOf(ctx);
  const top = s.stack[s.stack.length - 1];
  if (n === null || top === undefined || s.result !== null) {
    ctx.ask(prompt);
    return null;
  }
  (s.stack as G['task'][])[s.stack.length - 1] = { ...top, answer: [n.taken] };
  return n;
}

/** K119 (Rally the Troops `framework.js` action/button, ISC; written new): every option of a prompt by verb, then noun; barred ones stay in with `enabled: false`. */
export type LegalTable = Readonly<Record<string, Readonly<Record<string, KernelOption>>>>;

/** The prompt's options as one table of verb to ids. `split` an option id into [verb, noun]; default: at the first ':' (no ':' gives verb `option`). */
export function legalTable(p: Pick<KernelPrompt, 'options'> | null, split: (id: string) => readonly [string, string] = (id) => {
  const i = id.indexOf(':');
  return i < 0 ? ['option', id] : [id.slice(0, i), id.slice(i + 1)];
}): LegalTable {
  const t = Object.create(null) as Record<string, Record<string, KernelOption>>;
  for (const o of p?.options ?? []) {
    const [v, n] = split(o.id);
    (t[v] ??= Object.create(null) as Record<string, KernelOption>)[n] = o;
  }
  return t;
}

/** The option for (verb, noun) when it is in the table and legal, else undefined. */
export const legalIn = (t: LegalTable, verb: string, noun: string): KernelOption | undefined => {
  const o = t[verb]?.[noun];
  return o?.enabled ? o : undefined;
};
