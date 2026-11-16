// K88 (marvel-champions-digital-game `legal.ts`, `choices.ts`, AGPL-3.0; idea only, written new): a barred option keeps
// a reason code and, for a missing target, what was missing, read when the prompt opened. `askOrTake` takes the only
// legal option without asking and returns the notice the UI shows (every option, the taken one, each barred one).
import { draftOf } from './ctx';
import type { Ctx, GameTypes, KernelOption, KernelPrompt } from './types';

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
  const on = p.options.filter((o) => o.enabled);
  const o = on[0];
  return on.length === 1 && o !== undefined && p.min === 1 && p.max >= 1 ? { taken: o.id, options: p.options } : null;
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
