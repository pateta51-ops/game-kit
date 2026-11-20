// The prompt-delivery harness: a position put into the game's own session (the code path the table uses) and the
// player's answers dispatched through it under given settings. For every answer it records what reached the player
// and what was decided without asking: the engine's notes (its probe), the answers the settings gave, the prompt left
// open. `silentChoices` lists every viewer decision taken without a prompt the player answered, so a test can require none.
import type { Probe } from './probe.ts';

/** What a game gives the harness. `S` state, `P` prompt, `D` probe note, `A` an answer the settings gave. */
export interface DeliveryGame<S, P, D = never, A = never> {
  /** Put `state` into the session as the game in progress. */
  load(state: S): void;
  /** Answer the open prompt through the session (its settle loop runs after); the answers the settings gave. */
  dispatch(picks: readonly string[]): { ok: boolean; error?: string; autos: readonly A[] };
  /** The prompt the table shows the viewer now, or null. */
  prompt(): P | null;
  readonly probe?: Probe<D>;
  /** A description when the engine's note is a viewer decision nobody was asked (null when not). */
  silentNote?(d: D): string | null;
  /** A description when the settings' answer is a viewer decision (null for one the viewer does not own). */
  silentAuto?(a: A): string | null;
  /** The clause id whose resolution opened `p` (null when none). Feeds `Delivery.opened`. */
  clauseOf?(p: P): string | null;
  /** The words the table shows for `p`, or null when this prompt is not scanned. Feeds `Delivery.screens`. */
  screen?(p: P): string | null;
}

export interface Delivered<P, D, A> {
  readonly picks: readonly string[];
  readonly ok: boolean;
  readonly error?: string;
  readonly notes: readonly D[];
  readonly autos: readonly A[];
  readonly prompt: P | null;
}

export class Delivery<S, P, D = never, A = never> {
  readonly log: Delivered<P, D, A>[] = [];
  /** Clause ids that opened a prompt (K489), for `screenProblems`. */
  readonly opened = new Set<string>();
  /** `{ clause, shown }` of each scanned prompt that opened, for `screenProblems`. */
  readonly screens: { clause: string; shown: string }[] = [];
  private seen(): void {
    const p = this.game.prompt();
    if (p === null) return;
    const clause = this.game.clauseOf?.(p) ?? null;
    if (clause === null) return;
    this.opened.add(clause);
    const shown = this.game.screen?.(p) ?? null;
    if (shown !== null) this.screens.push({ clause, shown });
  }

  readonly game: DeliveryGame<S, P, D, A>;
  constructor(game: DeliveryGame<S, P, D, A>) {
    this.game = game;
  }

  load(state: S): this {
    this.game.load(state);
    this.seen();
    return this;
  }
  get prompt(): P | null {
    return this.game.prompt();
  }
  answer(...picks: string[]): Delivered<P, D, A> {
    const go = (): ReturnType<DeliveryGame<S, P, D, A>['dispatch']> => this.game.dispatch(picks);
    const { result, notes } = this.game.probe?.trace(go) ?? { result: go(), notes: [] };
    const out: Delivered<P, D, A> = {
      picks,
      ok: result.ok,
      ...(result.error === undefined ? {} : { error: result.error }),
      notes,
      autos: result.autos,
      prompt: this.game.prompt(),
    };
    this.log.push(out);
    this.seen();
    return out;
  }
  silentChoices(): { kind: 'engine' | 'settings'; what: string }[] {
    const out: { kind: 'engine' | 'settings'; what: string }[] = [];
    for (const d of this.log) {
      for (const n of d.notes) {
        const w = this.game.silentNote?.(n) ?? null;
        if (w !== null) out.push({ kind: 'engine', what: w });
      }
      for (const a of d.autos) {
        const w = this.game.silentAuto?.(a) ?? null;
        if (w !== null) out.push({ kind: 'settings', what: w });
      }
    }
    return out;
  }
}
