// The tutorial script: steps of narration, highlight target ids and what the step waits for (one locked answer, Next,
// or an automatic stretch of answers). Option refs are option ids unless the game's `findOption` reads them otherwise.
import { z } from 'zod';

const Ref = z.string().min(1);
const Do = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('move'), prompt: z.string().optional(), choose: z.array(Ref) }),
  z.object({ kind: z.literal('next') }),
  z.object({ kind: z.literal('auto'), moves: z.array(z.array(Ref)).min(1) }),
]);
const Expected = z.record(z.string(), z.unknown());
const Step = z.object({
  id: z.string().min(1),
  narration: z.string(),
  targets: z.array(z.string()).default([]),
  do: Do,
  asks: z.string().optional(),
  expect: z.array(Expected).optional(),
  items: z.array(z.string()).optional(),
});
const Script = z.object({
  seed: z.string(),
  title: z.string().optional(),
  steps: z.array(Step).min(1),
  end: Expected.optional(),
});

export type StepDo = z.infer<typeof Do>;
export type ExpectedEvent = z.infer<typeof Expected>;
export type TutorialStep = z.infer<typeof Step>;
export type TutorialScript = z.infer<typeof Script>;

/** The script from parsed JSON, or every problem (path: message). Step ids must be unique. */
export function parseScript(json: unknown): { ok: true; value: TutorialScript } | { ok: false; problems: string[] } {
  const r = Script.safeParse(json);
  if (!r.success) return { ok: false, problems: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const seen = new Set<string>();
  const dup = r.data.steps.flatMap((s) => (seen.has(s.id) ? [`steps: duplicate step id ${s.id}`] : (seen.add(s.id), [])));
  return dup.length > 0 ? { ok: false, problems: dup } : { ok: true, value: r.data };
}

/** The game actions a step takes: none for Next, one for a move, one per move of an auto stretch. */
export const actionsOf = (step: TutorialStep): number => (step.do.kind === 'next' ? 0 : step.do.kind === 'auto' ? step.do.moves.length : 1);

/** The actions the first `stepIndex` steps take: a resumed or undone tutorial game must hold that many to be at that step. */
export const actionsBefore = (script: TutorialScript, stepIndex: number): number =>
  script.steps.slice(0, stepIndex).reduce((n, s) => n + actionsOf(s), 0);

/** The step a game with `actions` answers is at (the first step not yet played), or null when it is between an auto stretch's moves. */
export function stepAt(script: TutorialScript, actions: number): number | null {
  for (let i = 0; i <= script.steps.length; i += 1) {
    const n = actionsBefore(script, i);
    if (n === actions) return i;
    if (n > actions) return null;
  }
  return null;
}

const TOKEN = /\{\{[^}]*\}\}/g;
/** The bare numbers of a narration outside `{{tokens}}` (a number not read from the game is not checked against it). */
export const bareNumbers = (text: string, token: RegExp = TOKEN): string[] => text.replace(token, '').match(/\d+/g) ?? [];
