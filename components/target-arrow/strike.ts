// Port of unstoppable-fan-prototype src/ui/play/strike.ts (e395a7c4), one store per table instead of module globals. The game
// announces every answer to a target prompt (its own and the board's), the arrow listens; token flights wait for the hit with
// `afterStrike` (pass `strikes.hold` as token-flights' `hold`). Prompt kinds and which prompts are target or damage prompts: the game's.

/** An answer to a target prompt: the prompt, the option ids chosen (a point of damage is one id per point), and whether the board gave it. */
export interface Strike<P = unknown> {
  prompt: P;
  ids: readonly string[];
  auto: boolean;
}

/** The longest a strike may hold the flights: a strike that never ends (its layer gone) cannot hold them for good. */
export const MAX_HOLD_MS = 3000;

export interface StrikeStore<P = unknown> {
  /** Listen to the strikes; the result stops listening. */
  on(listener: (strike: Strike<P>) => void): () => void;
  /** Tell the arrow of an answer (the game sends target prompts only, never Back); no ids, no strike; never throws. */
  announce(strike: Strike<P>): void;
  /** A strike begins: flights wait for its hit. A hold still open is ended first. The result is the hold's number. */
  beginHold(): number;
  /** End a hold (no-op when it already ended or a newer one replaced it): what waited runs. */
  endHold(no: number): void;
  holding(): boolean;
  /** Run `fn` at the strike's hit, or at once when no strike is held. */
  afterStrike(fn: () => void): void;
  /** token-flights' `hold`: `hold={strikes.hold}`. */
  hold: (move: unknown, launch: () => void) => void;
}

export function createStrikes<P = unknown>(maxHoldMs = MAX_HOLD_MS): StrikeStore<P> {
  const listeners = new Set<(strike: Strike<P>) => void>();
  let holdNo = 0;
  let held: { no: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let waiting: (() => void)[] = [];
  const flush = (): void => {
    const run = waiting;
    waiting = [];
    for (const fn of run) {
      try {
        fn();
      } catch {
        /* a flight that fails to start is only a picture */
      }
    }
  };
  const store: StrikeStore<P> = {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    announce(strike) {
      if (strike.ids.length === 0) return;
      for (const listener of listeners) {
        try {
          listener(strike);
        } catch {
          /* the arrow is decorative */
        }
      }
    },
    beginHold() {
      if (held !== null) store.endHold(held.no);
      holdNo += 1;
      const no = holdNo;
      held = { no, timer: setTimeout(() => { store.endHold(no); }, maxHoldMs) };
      return no;
    },
    endHold(no) {
      if (held?.no !== no) return;
      clearTimeout(held.timer);
      held = null;
      flush();
    },
    holding: () => held !== null,
    afterStrike(fn) {
      if (held === null) fn();
      else waiting.push(fn);
    },
    hold: (_move, launch) => {
      store.afterStrike(launch);
    },
  };
  return store;
}
