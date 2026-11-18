// K372: dev-only autoplay. `?dev=1&autoplay=<prompt kind>[*n]` (also `&steps=N`, `&seat=S`) plays a game-store with a sim-pool
// Bot until the open prompt is of that kind (the n-th time), N answers are made or the seat's prompt opens, then stops.
// Ported from 7IS src/ui/dev.ts (`?dev=1&until=<kind>[*n]`) and Unstoppable useAutoplay (a bot answers from the store); the
// game-free loop is written new. Never reads hidden state: the bot gets the store's view and legal answers only.
import { seatKey } from '../engine-core/index.ts';
import type { GameTypes } from '../engine-core/index.ts';
import type { GameStore } from '../game-store/index.ts';
import { DriverRng, legalAnswers, type Bot } from '../sim-pool/index.ts';

export interface AutoplayFlag {
  readonly kind?: string;
  /** The n-th prompt of `kind` stops it (default 1). */
  readonly nth: number;
  readonly steps?: number;
  readonly seat?: string;
}

export type AutoplayStop = 'off' | 'kind' | 'steps' | 'seat' | 'over' | 'refused' | 'left';

/** `?dev=1&autoplay=<kind>[*n]&steps=N&seat=S` → the flag; null without `dev=1` or with nothing to stop at. */
export function readAutoplayFlag(search: string): AutoplayFlag | null {
  const q = new URLSearchParams(search);
  if (q.get('dev') !== '1') return null;
  const [kind, n] = (q.get('autoplay') ?? '').split('*');
  const steps = q.get('steps');
  const seat = q.get('seat') ?? undefined;
  if (!kind && steps === null && seat === undefined) return null;
  return { ...(kind ? { kind } : {}), nth: Number(n ?? 1) || 1, ...(steps === null ? {} : { steps: Number(steps) }), ...(seat === undefined ? {} : { seat }) };
}

export interface AutoplayOptions<G extends GameTypes, V> {
  readonly bot: Bot<V, G['action']>;
  /** The address' query string (default `location.search`; '' where there is none). */
  readonly search?: string;
  /** False in a production build (`import.meta.env.DEV`): does nothing. Default true. */
  readonly dev?: boolean;
  /** Safety cap when the flag names no `steps` (default 10,000). */
  readonly cap?: number;
  /** Called after each answer (e.g. to repaint). */
  readonly onStep?: (n: number) => void;
  /** Ms between two answers, so the screen renders between them (default 120, as in Unstoppable); 0 plays synchronously in the call. */
  readonly paceMs?: number;
  /** The game's own end test (default: no open prompt); true stops with `over` even while a prompt is open. */
  readonly over?: (state: G['state']) => boolean;
  /** The board answers this prompt on its own (IR-25): the bot leaves it and waits (synchronous play stops with `left`). */
  readonly leave?: (prompt: NonNullable<G['state']['prompt']>) => boolean;
}

export interface AutoplayHandle {
  /** Halts it; the stop stays what it was (`null` while running). */
  readonly stop: () => void;
  /** `stop`: why it ended, `null` while it runs (`off` when the flag is not on). */
  readonly status: () => { readonly stop: AutoplayStop | null; readonly steps: number };
}

/** Plays the store's open prompts with the bot, one answer per `paceMs` tick, until the flag's stop; status `off` when it is not on. */
export function devAutoplay<G extends GameTypes, V>(store: GameStore<G, V>, o: AutoplayOptions<G, V>): AutoplayHandle {
  const flag = o.dev === false ? null : readAutoplayFlag(o.search ?? (typeof location === 'undefined' ? '' : location.search));
  let steps = 0;
  let why: AutoplayStop | null = flag === null ? 'off' : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const handle: AutoplayHandle = { stop: () => { clearTimeout(timer); timer = undefined; if (why === null) why = 'off'; }, status: () => ({ stop: why, steps }) };
  if (flag === null) return handle;
  const cap = flag.steps ?? o.cap ?? 10_000;
  const pace = o.paceMs ?? 120;
  let seen = 0;
  let last: number | null = null;
  const done = (s: AutoplayStop) => { why = s; store.skip(); };
  const tick = (): void => {
    timer = undefined;
    if (why !== null) return;
    const snap = store.get();
    const p = snap.state.prompt;
    if (p === null || o.over?.(snap.state) === true) return done('over');
    if (p.id !== last) {
      last = p.id;
      if (flag.kind !== undefined && p.kind === flag.kind && (seen += 1) >= flag.nth) return done('kind');
      if (flag.seat !== undefined && p.seat !== undefined && String(seatKey(p.seat)) === flag.seat) return done('seat');
    }
    if (steps >= cap) return done('steps');
    if (o.leave?.(p) === true) {
      if (pace === 0) return done('left');
    } else {
      const rng = new DriverRng(`${String((snap.options as { seed?: string }).seed ?? '')}|autoplay|${String(p.id)}`);
      const a = o.bot.choose(snap.view, legalAnswers(p, rng), rng) as unknown as { picks: readonly string[] };
      if (pace === 0) store.skip();
      if (!store.answer(a.picks, p.id)) return done('refused');
      steps += 1;
      o.onStep?.(steps);
    }
    if (pace === 0) tick();
    else timer = setTimeout(tick, pace);
  };
  tick();
  return handle;
}
