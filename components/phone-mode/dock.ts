// The decision dock of a phone layout (the decision panel above the tabs) and its one-line prompt, as pure rules.
import { transition } from '../state-machines/machine';
import { foldMachine, type FoldState } from './machine';

export const DOCK_MACHINE = foldMachine('kit.dock', 'folded', {
  purpose:
    'The decision dock of a phone layout: folded to one line while the board answers the decision, open when the decision needs the panel.',
  source: 'components/phone-mode/dock.ts',
  stateLivesIn: 'derived by dockState from dockWantsOpen and the player choice held by useDock',
  notes: ['The player folds or opens it with its head; that choice holds until the dock key changes.'],
});

export interface DockDecision {
  /** `ref`: the board object a tap on the board answers with. */
  options: readonly { ref?: string | undefined }[];
  min?: number | undefined;
  max?: number | undefined;
  /** The decision has a button of its own (decline, back, done). */
  canDecline?: boolean | undefined;
  /** How many options the player has ticked so far. */
  picked?: number | undefined;
  /** A follow-up question is open in the panel (a sub-choice, a confirmation). */
  pending?: boolean | undefined;
  /** The board alone answers it whatever its options (a free main decision). */
  boardOnly?: boolean | undefined;
}

/** Does the open decision need the panel? False only while a tap on the board answers it. */
export function dockWantsOpen(d: DockDecision | null, tappable: ReadonlySet<string>): boolean {
  if (d === null) return false;
  if (d.pending === true) return true;
  if (d.boardOnly === true) return false;
  return !(
    (d.min ?? 1) === 1 &&
    (d.max ?? 1) === 1 &&
    d.canDecline !== true &&
    (d.picked ?? 0) === 0 &&
    d.options.length > 0 &&
    d.options.every((o) => o.ref !== undefined && tappable.has(o.ref))
  );
}

export interface DockChoice {
  key: string;
  state: FoldState;
}

/** The key the player's choice holds for: the decision, what it wants, and whatever else the game names (the ticks). */
export function dockKey(id: string | null, wants: boolean, parts: readonly (string | number | boolean)[] = []): string {
  return [id ?? '-', wants ? 'open' : 'fold', ...parts.map(String)].join('|');
}

export function dockState(wants: boolean, key: string, choice: DockChoice | null): FoldState {
  return choice?.key === key ? choice.state : wants ? 'open' : 'folded';
}

/** The player taps the dock's head. */
export function dockToggle(wants: boolean, key: string, choice: DockChoice | null): DockChoice {
  const from = dockState(wants, key, choice);
  return { key, state: transition(DOCK_MACHINE, from, from === 'open' ? 'fold' : 'open') };
}

/** The tabs a pick lights: those that show a thing the open pick names (`tabOf` null: it is on no tab). */
export function pickTabs<T>(ids: Iterable<string>, tabOf: (id: string) => T | null): Set<T> {
  const tabs = new Set<T>();
  for (const id of ids) {
    const tab = tabOf(id);
    if (tab !== null) tabs.add(tab);
  }
  return tabs;
}

/** A sentence without its full stop, on one line. */
export function bare(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
}

/** The words before the first of `tails` that occurs after the start, else null. */
export function lead(message: string, tails: readonly string[]): string | null {
  for (const tail of tails) {
    const at = message.indexOf(tail);
    if (at > 0) return message.slice(0, at).trim();
  }
  return null;
}

/**
 * "2 thing(s)" becomes "2 things", "1 red thing(s)" becomes "1 red thing": the nearest number before the word decides.
 * Only a plain "s" is added (no irregular plurals); a "(s)" with no number before it stays.
 */
export function fixPlurals(text: string): string {
  return text.replace(
    /\b(\d+)((?: [^\W\d][\w'-]*)+?)\(s\)/g,
    (_, n: string, words: string) => `${n}${words}${n === '1' ? '' : 's'}`,
  );
}

/**
 * The open decision in one short line. `table` has one entry per prompt kind (a kind the engine adds is a compile
 * error in the game's table); a kind missing at run time, or an empty line, gives `fallback` (the full question).
 */
export function shortPrompt<K extends string, P extends { kind: K }>(
  table: Readonly<Record<K, (prompt: P) => string>>,
  prompt: P,
  fallback: (prompt: P) => string = () => '',
): string {
  const words = Object.hasOwn(table, prompt.kind) ? table[prompt.kind] : undefined;
  return bare(words?.(prompt) ?? '') || bare(fallback(prompt));
}
