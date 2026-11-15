// The phone mode's machines: the layout mode, a fold (open or folded part), the second-tap commit.
import { defineMachine, type Machine } from '../state-machines/machine';

const SOURCE = 'components/phone-mode/machine.ts';

export type LayoutMode = 'desk' | 'fitted' | 'phonePortrait' | 'phoneLandscape';
export type ViewportEvent = 'toDesk' | 'toFitted' | 'toPortrait' | 'toLandscape';

export const VIEWPORT_MACHINE = defineMachine<LayoutMode, ViewportEvent>({
  id: 'kit.viewport',
  initial: 'fitted',
  states: {
    // the large screens at zoom 1 (a window at least the design size)
    desk: { on: { toFitted: 'fitted', toPortrait: 'phonePortrait', toLandscape: 'phoneLandscape' } },
    // the large screens zoomed to fit a smaller, non-phone window
    fitted: { on: { toDesk: 'desk', toPortrait: 'phonePortrait', toLandscape: 'phoneLandscape' } },
    phonePortrait: { on: { toDesk: 'desk', toFitted: 'fitted', toLandscape: 'phoneLandscape' } },
    // a phone held sideways
    phoneLandscape: { on: { toDesk: 'desk', toFitted: 'fitted', toPortrait: 'phonePortrait' } },
  },
  describe: {
    purpose:
      'Which screens draw: the large screens at zoom 1 (desk), zoomed to fit (fitted), or the phone screens upright or sideways. Derived from the window size, a touch pointer and the Layout setting.',
    source: SOURCE,
    stateLivesIn: 'useViewport.mode (components/phone-mode/viewport.ts), derived by layoutModeFor',
    notes: [
      'Phone: the Layout setting is phone, or it is auto with a coarse (touch) pointer and a short side of at most 500 CSS px.',
      'Each event is named by its target; the store checks every observed move with expectEdge. A rotation touches nothing else.',
    ],
  },
});

export type FoldState = 'folded' | 'open';
export type FoldEvent = 'open' | 'fold';

/** A part that opens and folds (a clause line, a result panel, a hint card): one table per part, never a boolean. */
export function foldMachine(
  id: string,
  initial: FoldState,
  describe: { purpose: string; source: string; stateLivesIn?: string; notes?: string[] },
): Machine<FoldState, FoldEvent> {
  return defineMachine<FoldState, FoldEvent>({
    id,
    initial,
    states: { folded: { on: { open: 'open' } }, open: { on: { fold: 'folded' } } },
    describe,
  });
}

export type TapState = 'idle' | 'armed';
export type TapEvent = 'arm' | 'commit' | 'disarm';

export const SECOND_TAP_MACHINE = defineMachine<TapState, TapEvent>({
  id: 'kit.secondTap',
  initial: 'idle',
  states: {
    idle: { on: { arm: 'armed' } },
    // a tap on another target arms that one instead
    armed: { on: { arm: 'armed', commit: 'idle', disarm: 'idle' } },
  },
  describe: {
    purpose:
      'An irreversible answer on a touch screen: the first tap arms the target (the game shows it armed), a second tap on the same target commits it.',
    source: SOURCE,
    stateLivesIn: 'useSecondTap (components/phone-mode/secondTap.ts), with the armed target id',
    notes: ['disarm: the reset key changed (a new prompt, an undo) or the game called disarm.'],
  },
});
