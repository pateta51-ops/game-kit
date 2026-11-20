// Play a script headless, step by step, on any `GameRules` game: the same functions serve the check, the lock (which
// option a step asks for) and a seed search (`stopOnFailure: false` to see how far a seed gets).
import type { PortAnswer, PortPrompt, PortTypes } from '../engine-core/index.ts';
import { drive, type TutorialAction, type TutorialEngine } from './game.ts';
import { bareNumbers, type ExpectedEvent, type TutorialScript, type TutorialStep } from './script.ts';

export interface StepFailure {
  /** 1-based, as "Step N of M" shows it. */
  readonly step: number;
  readonly id: string;
  readonly code: 'NO_PROMPT' | 'WRONG_SEAT' | 'WRONG_PROMPT' | 'NO_SUCH_OPTION' | 'DISABLED_OPTION' | 'ILLEGAL' | 'MISSING_EVENT';
  readonly expected: string;
  readonly actual: string;
}

export const formatFailure = (f: StepFailure): string => `step ${String(f.step)} (${f.id}) ${f.code}: expected ${f.expected}; instead ${f.actual}`;

export interface ScriptRun<G extends PortTypes> {
  readonly state: G['state'];
  /** Every action applied so far: the replay of the game. */
  readonly actions: readonly TutorialAction<G>[];
  /** The events of the last step. */
  readonly lastEvents: readonly G['event'][];
}

export function startRun<G extends PortTypes>(game: TutorialEngine<G>, seed: string): ScriptRun<G> {
  return { state: drive(game).start(seed), actions: [], lastEvents: [] };
}

const promptWords = (p: PortPrompt | null): string => {
  return p === null ? 'no prompt' : `prompt ${String(p.id)} with options [${p.options.map((o) => `${o.id}${o.enabled ? '' : ' (disabled)'}`).join('; ')}]`;
};

export type Chosen = { readonly ok: true; readonly ids: readonly string[] } | { readonly ok: false; readonly failure: StepFailure };

/** The option ids of the open prompt that the step answers with ([] for Next; an auto step's first move), or why not. */
export function scriptedIds<G extends PortTypes>(game: TutorialEngine<G>, state: G['state'], step: TutorialStep, stepNo: number): Chosen {
  const d = drive(game);
  const h = d.hooks;
  const choose = step.do.kind === 'move' ? step.do.choose : step.do.kind === 'auto' ? (step.do.moves[0] ?? []) : [];
  const want = step.do.kind === 'next' ? 'Next' : `an answer ${choose.length === 0 ? 'with nothing chosen' : choose.join(', ')}`;
  const fail = (code: StepFailure['code'], actual: string): Chosen => ({ ok: false, failure: { step: stepNo, id: step.id, code, expected: want, actual } });
  const prompt = d.prompt(state);
  const human = prompt === null || (h.human?.(state) ?? true);
  // Next needs no prompt (a closing explanation after the game ended), but never skips past another seat's decision
  if (step.do.kind === 'next') return human ? { ok: true, ids: [] } : fail('WRONG_SEAT', `the open prompt is not the player's: ${promptWords(d.prompt(state))}`);
  if (prompt === null) return fail('NO_PROMPT', d.result(state) === null ? 'no prompt is open' : 'the game is over');
  if (!human) return fail('WRONG_SEAT', `the open prompt is not the player's: ${promptWords(d.prompt(state))}`);
  if (step.do.kind === 'move' && step.do.prompt !== undefined && h.promptKind?.(state) !== step.do.prompt)
    return fail('WRONG_PROMPT', `the open prompt is a ${String(h.promptKind?.(state))} ${promptWords(d.prompt(state))}`);
  const ids: string[] = [];
  for (const ref of choose) {
    const id = h.findOption ? h.findOption(state, ref) : ref;
    const o = prompt.options.find((x) => x.id === id);
    if (o === undefined) return fail('NO_SUCH_OPTION', `${ref} is not offered by the ${promptWords(d.prompt(state))}`);
    if (!o.enabled) return fail('DISABLED_OPTION', `${ref} is offered but disabled${o.why === undefined ? '' : ` (${o.why})`}`);
    ids.push(o.id);
  }
  return { ok: true, ids };
}

function matches<G extends PortTypes>(game: TutorialEngine<G>, state: G['state'], want: unknown, actual: unknown): boolean {
  if (Array.isArray(want)) return Array.isArray(actual) && want.length === actual.length && want.every((w, i) => matches(game, state, w, actual[i]));
  if (want !== null && typeof want === 'object') {
    if (actual === null || typeof actual !== 'object') return false;
    return Object.entries(want).every(([k, v]) => matches(game, state, v, (actual as Record<string, unknown>)[k]));
  }
  return want === actual || ((game as { same?: (s: G['state'], w: unknown, a: unknown) => boolean }).same?.(state, want, actual) ?? false);
}

/** The expected events not found, in order (each must happen after the one before). */
export function missingEvents<G extends PortTypes>(game: TutorialEngine<G>, state: G['state'], expected: readonly ExpectedEvent[], events: readonly G['event'][]): ExpectedEvent[] {
  let from = 0;
  const missing: ExpectedEvent[] = [];
  for (const want of expected) {
    const at = events.findIndex((e, i) => i >= from && matches(game, state, want, e));
    if (at < 0) missing.push(want);
    else from = at + 1;
  }
  return missing;
}

export type StepOutcome<G extends PortTypes> =
  | { readonly ok: true; readonly run: ScriptRun<G> }
  | { readonly ok: false; readonly run: ScriptRun<G>; readonly failure: StepFailure };

function answer<G extends PortTypes>(game: TutorialEngine<G>, run: ScriptRun<G>, step: TutorialStep, stepNo: number): StepOutcome<G> {
  const chosen = scriptedIds(game, run.state, step, stepNo);
  if (!chosen.ok) return { ok: false, run, failure: chosen.failure };
  if (step.do.kind === 'next') return { ok: true, run: { ...run, lastEvents: [] } };
  const d = drive(game);
  const prompt = d.prompt(run.state) as PortPrompt;
  const action: PortAnswer = { kind: 'answer', promptId: prompt.id, picks: chosen.ids };
  try {
    const r = d.answer(run.state, action);
    return { ok: true, run: { state: r.state, actions: [...run.actions, action as TutorialAction<G>], lastEvents: r.events } };
  } catch (e) {
    const failure: StepFailure = { step: stepNo, id: step.id, code: 'ILLEGAL', expected: `the answer [${chosen.ids.join(', ')}] to be legal`, actual: `the engine refused it (${e instanceof Error ? e.message : String(e)}) on the ${promptWords(prompt)}` };
    return { ok: false, run, failure };
  }
}

/** Play one step (1-based `stepNo`): its move, Next or auto stretch, then check its expected events. */
export function playStep<G extends PortTypes>(game: TutorialEngine<G>, run: ScriptRun<G>, step: TutorialStep, stepNo: number): StepOutcome<G> {
  let cur = run;
  const events: G['event'][] = [];
  const moves = step.do.kind === 'auto' ? step.do.moves.map((choose, i): TutorialStep => ({ ...step, id: `${step.id}#${String(i + 1)}`, do: { kind: 'move', choose } })) : [step];
  for (const m of moves) {
    const out = answer(game, cur, m, stepNo);
    if (!out.ok) return { ok: false, run: { ...out.run, lastEvents: events }, failure: out.failure };
    cur = out.run;
    events.push(...cur.lastEvents);
  }
  const done: ScriptRun<G> = { ...cur, lastEvents: events };
  if (step.do.kind === 'next') events.push(...run.lastEvents);
  const missing = missingEvents(game, done.state, step.expect ?? [], events);
  if (missing.length === 0) return { ok: true, run: done };
  const words = (e: G['event']): string => drive(game).hooks.eventWords?.(done.state, e) ?? JSON.stringify(e);
  return {
    ok: false,
    run: done,
    failure: { step: stepNo, id: step.id, code: 'MISSING_EVENT', expected: `the events ${missing.map((e) => JSON.stringify(e)).join(', ')}`, actual: `the step's events were [${events.slice(0, 40).map(words).join('; ')}${events.length > 40 ? `; … ${String(events.length - 40)} more` : ''}]` },
  };
}

export interface PlayOptions {
  /** The field of an event that names its kind (default `type`). */
  readonly eventKey?: string;
  /** Another seed than the script's (a seed search). */
  readonly seed?: string;
  /** Items (mechanics) the steps must teach between them. */
  readonly items?: readonly string[];
  /** Per item, the event types that show it happened: a step tagged with the item must expect one of them. */
  readonly evidence?: Readonly<Record<string, readonly string[]>>;
  /** The game must be over after the last step, its result matching `script.end`. */
  readonly requireEnd?: boolean;
  /** A digit in a narration outside `{{tokens}}` is a problem. */
  readonly noBareNumbers?: boolean;
  /** Keep going after a failed step; the check stops at the first. */
  readonly stopOnFailure?: boolean;
}

export interface PlayReport<G extends PortTypes> {
  readonly ok: boolean;
  /** Every problem, one sentence each, step failures first. */
  readonly problems: readonly string[];
  readonly failures: readonly StepFailure[];
  /** Steps played before the first failure. */
  readonly stepsPlayed: number;
  readonly covered: readonly string[];
  readonly uncovered: readonly string[];
  readonly run: ScriptRun<G>;
}

/** Play `script` on its seed (or `options.seed`) and report every problem. */
export function playScript<G extends PortTypes>(game: TutorialEngine<G>, script: TutorialScript, options: PlayOptions = {}): PlayReport<G> {
  let run = startRun(game, options.seed ?? script.seed);
  const failures: StepFailure[] = [];
  let stepsPlayed = 0;
  for (const [i, step] of script.steps.entries()) {
    const out = playStep(game, run, step, i + 1);
    run = out.run;
    if (!out.ok) {
      failures.push(out.failure);
      if (options.stopOnFailure !== false) break;
    } else if (failures.length === 0) stepsPlayed += 1;
  }
  const covered = [...new Set(script.steps.flatMap((s) => s.items ?? []))];
  const uncovered = (options.items ?? []).filter((m) => !covered.includes(m));
  const problems = failures.map(formatFailure);
  if (uncovered.length > 0) problems.push(`UNCOVERED: no step teaches ${uncovered.join(', ')}`);
  if (options.evidence !== undefined)
    script.steps.forEach((step, i) => {
      const kinds = new Set((step.expect ?? []).map((e) => e[options.eventKey ?? 'type']));
      for (const item of step.items ?? []) {
        const want = options.evidence?.[item] ?? [];
        if (!want.some((k) => kinds.has(k))) problems.push(`UNTESTED: step ${String(i + 1)} (${step.id}) teaches ${item} but expects none of ${want.join(', ') || '(no events listed)'}`);
      }
    });
  if (options.noBareNumbers === true)
    script.steps.forEach((step, i) => {
      const n = bareNumbers(step.narration);
      if (n.length > 0) problems.push(`BARE_NUMBER: step ${String(i + 1)} (${step.id}) narrates ${n.join(', ')} outside a token`);
    });
  if (failures.length === 0 && (options.requireEnd === true || script.end !== undefined)) {
    const d = drive(game);
    const result = d.result(run.state);
    if (script.end === undefined) problems.push('NO_END: the script does not say how the game ends (end)');
    else if (result === null) problems.push(`NOT_OVER: after the last step (${String(script.steps.length)}) the game is not over (${promptWords(d.prompt(run.state))})`);
    else if (!matches(game, run.state, script.end, result)) problems.push(`END: the game ended ${JSON.stringify(result)}, the script expects ${JSON.stringify(script.end)}`);
  }
  return { ok: problems.length === 0, problems, failures, stepsPlayed, covered, uncovered, run };
}
