// The tutorial's phases as a table, and the pure session over a script: off (an ordinary game), guided (a step waits:
// one answer, Next or an automatic stretch), closing (after the last step: free play, the panel offers Close), closed.
import { defineMachine, transition } from '../state-machines/machine.ts';
import type { TutorialScript } from './script.ts';

export type TutorialPhase = 'off' | 'guided' | 'closing' | 'closed';
export type TutorialEvent = 'start' | 'step' | 'finish' | 'back' | 'leave' | 'close' | 'play';

export const TUTORIAL_MACHINE = defineMachine<TutorialPhase, TutorialEvent>({
  id: 'kit.tutorial',
  initial: 'off',
  states: {
    off: { on: { start: 'guided' } },
    guided: { on: { step: 'guided', back: 'guided', finish: 'closing', leave: 'closed' } },
    closing: { on: { play: 'closing', back: 'guided', close: 'closed' } },
    closed: { on: {} },
  },
  describe: {
    purpose: 'The tutorial on the table: off, guided (a scripted step waits), closing (the last step done: free play until Close), closed (Close or Leave: an ordinary game).',
    source: 'kit/tutorial/machine.ts',
    stateLivesIn: 'TutorialSession.phase, held by the game store',
    notes: [
      'step: a step done (its answer, Next or auto stretch) with more to come. finish: the last step done. back: an undo to the step before (from closing: to the last step). leave: Leave while guided. close: Close on the closing step. play: a free answer while closing.',
    ],
  },
});

export interface TutorialSession {
  readonly phase: TutorialPhase;
  /** 0-based index of the step shown (the last one while closing). */
  readonly step: number;
}

export const TUTORIAL_OFF: TutorialSession = { phase: 'off', step: 0 };

const go = (s: TutorialSession, e: TutorialEvent, step = s.step): TutorialSession => ({ phase: transition(TUTORIAL_MACHINE, s.phase, e), step });

export const startTutorial = (s: TutorialSession = TUTORIAL_OFF): TutorialSession => go(s, 'start', 0);
/** The shown step is done: the next one, or closing after the last. */
export const stepDone = (s: TutorialSession, script: TutorialScript): TutorialSession =>
  s.step + 1 >= script.steps.length ? go(s, 'finish', script.steps.length - 1) : go(s, 'step', s.step + 1);
/** Back one step (closing goes back to the last step). */
export const stepBack = (s: TutorialSession): TutorialSession => go(s, 'back', s.phase === 'closing' ? s.step : Math.max(0, s.step - 1));
export const leaveTutorial = (s: TutorialSession): TutorialSession => go(s, 'leave');
export const closeTutorial = (s: TutorialSession): TutorialSession => go(s, 'close');
export const playFree = (s: TutorialSession): TutorialSession => go(s, 'play');
/** The step the lock rules on: the shown one while guided; past the end otherwise (nothing locked). */
export const lockedStep = (s: TutorialSession, script: TutorialScript): number => (s.phase === 'guided' ? s.step : script.steps.length);
