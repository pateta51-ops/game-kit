// The lock as a pure model: at a step of the script and a game state, which option, control and answer is allowed, and
// why not ("The tutorial asks for …"). The game's store holds the step and refuses any answer `accepts` refuses.
import type { PortAnswer, PortPrompt, PortTypes } from '../engine-core/index.ts';
import { drive, type TutorialEngine } from './game.ts';
import { scriptedIds, type StepFailure } from './play.ts';
import type { TutorialScript, TutorialStep } from './script.ts';

/** The controls outside the prompt the lock rules on; any other control stays free (menu, settings, lookups, exit). */
export type TutorialButton = 'undo' | 'redo' | 'next' | (string & {});

export interface Verdict {
  readonly enabled: boolean;
  readonly why?: string;
}

export interface TutorialLock {
  /** 'guided' while a step waits; 'over' after the last step (nothing is locked any more). */
  readonly phase: 'guided' | 'over';
  /** 1-based "Step N of M". */
  readonly stepNo: number;
  readonly total: number;
  readonly step: TutorialStep | null;
  readonly waitFor: TutorialStep['do']['kind'] | null;
  /** The option ids the step answers with ([] for Next); an auto step's first move. */
  readonly answer: readonly string[];
  readonly asks: string;
  /** The script no longer fits the game: nothing can be done (the check reports the same). */
  readonly problem: StepFailure | null;
  option(id: string): Verdict;
  button(b: TutorialButton): Verdict;
  /** Is `action` the step's answer (same prompt, same options; in order when the game says the order matters)? */
  accepts(action: PortAnswer): boolean;
}

const free: Verdict = { enabled: true };
const UNDO = 'Undo is off in the tutorial.';

export function lockAt<G extends PortTypes>(game: TutorialEngine<G>, script: TutorialScript, stepIndex: number, state: G['state']): TutorialLock {
  const total = script.steps.length;
  const step = script.steps[stepIndex];
  if (step === undefined)
    return {
      phase: 'over',
      stepNo: total,
      total,
      step: null,
      waitFor: null,
      answer: [],
      asks: '',
      problem: null,
      option: () => free,
      button: (b) => (b === 'undo' || b === 'redo' ? { enabled: false, why: UNDO } : b === 'next' ? { enabled: false, why: 'The tutorial is over.' } : free),
      accepts: () => true,
    };
  const d = drive(game);
  const prompt = d.prompt(state);
  const chosen = scriptedIds(game, state, step, stepIndex + 1);
  const answer = chosen.ok ? chosen.ids : [];
  const asks =
    step.asks ??
    (step.do.kind === 'next'
      ? 'Next'
      : step.do.kind === 'auto'
        ? 'Next (the game plays on by itself)'
        : answer.length === 0
          ? 'no choice here (confirm with nothing chosen)'
          : answer.map((id) => d.hooks.optionWords?.(state, id) ?? id).join(', then '));
  const why = `The tutorial asks for ${asks}.`;
  const allowed = new Set(step.do.kind === 'move' ? answer : []);
  return {
    phase: 'guided',
    stepNo: stepIndex + 1,
    total,
    step,
    waitFor: step.do.kind,
    answer,
    asks,
    problem: chosen.ok ? null : chosen.failure,
    option: (id) => (prompt !== null && allowed.has(id) ? free : { enabled: false, why }),
    button: (b) => (b === 'undo' || b === 'redo' ? { enabled: false, why: UNDO } : b !== 'next' ? free : chosen.ok && step.do.kind !== 'move' ? free : { enabled: false, why }),
    accepts: (a) => {
      if (!chosen.ok || step.do.kind !== 'move' || prompt === null || a.promptId !== prompt.id || a.picks.length !== answer.length) return false;
      if (d.hooks.ordered?.(state) === true) return a.picks.every((id, i) => id === answer[i]);
      return [...a.picks].sort().join('\n') === [...answer].sort().join('\n');
    },
  };
}

/** The open prompt as the lock leaves it: every option but the scripted ones disabled, with the reason. */
export function lockPrompt<P extends PortPrompt>(prompt: P, lock: TutorialLock): P {
  if (lock.phase === 'over') return prompt;
  return {
    ...prompt,
    options: prompt.options.map((o) => {
      const v = lock.option(o.id);
      return v.enabled ? o : { ...o, enabled: false, why: v.why };
    }),
  };
}

/** Null when `action` may be applied, else the reason it is refused. */
export const refusal = (lock: TutorialLock, action: PortAnswer): string | null => (lock.accepts(action) ? null : `The tutorial asks for ${lock.asks}.`);
