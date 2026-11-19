// K250: the DOM side of deck-motions: flights of stand-in cards between piles and places, the riffle. Ported from STCC
// src/ui/motion/dealing.ts (main 8e6f55b), from LordOfTheRings (a3f3c01, BSD-3: LICENSE-LordOfTheRings.txt).
import type { VerbRegistry } from '../motion-frame/player.ts';
import { FLIP_LIFT, RIFFLE_DECK_CARDS, RIFFLE_PHASES_MS, flipFrames, planDeal, type At, type DealPlan, type Move } from './plan.ts';
import { riffleSide } from './riffle-side.ts';
import { riffleTop, type TopBack } from './riffle-top.ts';

export * from './plan.ts';
export { drawNeutralBack, riffleTop, type RiffleTopOpts, type TopBack } from './riffle-top.ts';
export { riffleSide, type RiffleSideOpts } from './riffle-side.ts';

export interface DeckMotionOpts {
  /** Time factor from the game's setting; 0 = none. Reduced motion is none too. */
  speed?: number;
  /** A stand-in showing a card back over `rect` (the game's back image). Default: an empty div with `data-pile-back`. */
  back?: (pile: string, rect: { width: number; height: number }) => HTMLElement;
  /** The face laid in place when a face-down card turns up, or flies into a pile (default: a clone of the place's element). */
  face?: (id: string, el: HTMLElement) => HTMLElement;
  /** The game's unit in px for the v2 riffle's offsets; unused since K396 (the riffle sizes itself from the deck). */
  unit?: (pile: HTMLElement) => number;
  /** K396: the riffle seen from above ('top', default) or edge-on ('side'). */
  view?: 'top' | 'side';
  /** Card shape (default: from the deck's shape). */
  orientation?: 'portrait' | 'landscape';
  /** Cards drawn in the riffle (default RIFFLE_DECK_CARDS). */
  cards?: number;
  /** The four phases in ms at speed 1: split (tilt in), riffle, bridge, square (tilt out). Default RIFFLE_PHASES_MS (RIFFLE_MS in all). */
  durations?: readonly number[];
  /** The top view's card back: a draw function or an image (default drawNeutralBack). The side view uses `back`, else a clone of the top card. */
  topBack?: TopBack;
  /** Turn-over axis: 'x' turns side to side (rotateY, default), 'y' top to bottom (rotateX). */
  axis?: 'x' | 'y';
  /** Turn-over direction: 1 front flip (default), -1 back flip (the opposite sign). */
  direction?: 1 | -1;
  /** K406: the turn-over's lift at edge-on (default a refill's lift, else FLIP_LIFT), perspective in px, and where in the travel it starts and ends (0..1). */
  flipLift?: number;
  perspective?: number;
  flipStart?: number;
  flipEnd?: number;
  /** K443: the lift's shape (0..1 across the turn gives the share of the lift; default a sine), and the flight's timing in ms at speed 1 (default DEAL_MS 520, STAGGER_MS 90). */
  liftCurve?: (u: number) => number;
  dealMs?: number;
  staggerMs?: number;
}

const live = new Set<Animation>();
const timers = new Set<{ t: number; r: () => void }>();
const riffling = new WeakMap<HTMLElement, { done: Promise<void>; finish: () => void }>();
const riffles = new Set<{ finish: () => void }>();
const sum = (d: readonly number[]) => d.reduce((a, b) => a + b, 0);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The element of a pile: `[data-pile="<id>"]`, the anchor card-pile draws. */
export const pileElement = (pile: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-pile="${pile}"]`);
/** The top card of a pile: its last child, or the pile itself when it has none. */
export const topOf = (at: HTMLElement): HTMLElement => (at.lastElementChild as HTMLElement | null) ?? at;
const resolveAt = (at: At): HTMLElement | null => {
  if (typeof at !== 'string') return at();
  const p = pileElement(at);
  return p === null ? null : topOf(p);
};

/** The default stand-in: a div the game styles (`[data-pile-back]`), marked `data-motion-standin`. */
export const cardBack = (pile: string, rect: { width: number; height: number }): HTMLElement => {
  const b = document.createElement('div');
  b.dataset['pileBack'] = pile;
  b.dataset['motionStandin'] = '';
  b.style.setProperty('--h', `${String(rect.height)}px`);
  return b;
};

const lay = (el: HTMLElement, r: { left: number; top: number; width: number; height: number }) => {
  Object.assign(el.style, { position: 'fixed', left: `${String(r.left)}px`, top: `${String(r.top)}px`, width: `${String(r.width)}px`, height: `${String(r.height)}px`, margin: '0', pointerEvents: 'none', zIndex: '1000' });
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
};

const track = (a: Animation, el: HTMLElement): Promise<void> => {
  live.add(a);
  return a.finished.catch(() => undefined).then(() => {
    live.delete(a);
    el.remove();
  });
};

/** End every running flight and riffle now (a tap, a key, undo, leaving the screen). */
export const finishDeckMotions = (): void => {
  for (const x of [...timers]) { window.clearTimeout(x.t); timers.delete(x); x.r(); }
  for (const a of [...live]) a.finish();
  for (const r of [...riffles]) r.finish();
};
/** Any press or key finishes the motions at once. Returns the unbind. */
export const finishOnInput = (target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): (() => void) => {
  const f = () => { finishDeckMotions(); };
  for (const e of ['pointerdown', 'keydown']) target.addEventListener(e, f, true);
  return () => { for (const e of ['pointerdown', 'keydown']) target.removeEventListener(e, f, true); };
};

export interface Dealing {
  plan: DealPlan;
  /** Resolves when every flight and riffle is over (at once when none). */
  done: Promise<void>;
}

const REST = 'translate(0px, 0px) scale(1, 1)';

/** K406: whether a move turns over: a pile marked `data-face="down"` always; else `faceDown`, unset = face down unless the pile says `data-face="up"`. */
export const turnsOver = (move: Move): boolean => {
  const p = typeof move.pile === 'string' ? pileElement(move.pile) : null;
  const f = p?.getAttribute('data-face');
  return f === 'down' || (move.faceDown ?? f !== 'up');
};

/**
 * Cards fly between a pile and their places: stand-ins are laid on the page and fly with their delays; a face-down card turns
 * over on the way (back first, then the face at the place); a refill lifts; a card going face down into a pile vanishes; then
 * the piles in `shuffled` riffle. Call once the new view is rendered (the places exist). Which moves is the game's call from
 * its view diff; `planDeal` and `cycleMove` give the timing and the deck cycle.
 */
export function dealFrom(given: readonly Move[], o: DeckMotionOpts & { shuffled?: readonly string[]; departs?: boolean; onCardStart?: (index: number, id: string) => void; signal?: AbortSignal | undefined } = {}): Dealing {
  const speed = reduced() ? 0 : (o.speed ?? 1);
  const moves = given.map((m) => ({ ...m, faceDown: turnsOver(m) }));
  const plan = planDeal(moves, { speed, shuffled: o.shuffled, departs: o.departs, riffleMs: o.durations ? sum(o.durations) : undefined, dealMs: o.dealMs, staggerMs: o.staggerMs });
  const face = o.face ?? ((_id: string, el: HTMLElement) => el.cloneNode(true) as HTMLElement);
  const ends: Promise<void>[] = [];
  const mine: Animation[] = [];
  const mineTimers = new Set<{ t: number; r: () => void }>();
  const began = (move: Move) => { if (!o.signal?.aborted) o.onCardStart?.(moves.indexOf(move as typeof moves[number]), move.id); };
  if (!plan.timed.length) for (const m of moves) began(m);
  for (const t of plan.timed) {
    const { move } = t;
    if (o.onCardStart) {
      if (t.delay > 0) {
        const x = { t: 0, r: () => { mineTimers.delete(x); began(move); } };
        x.t = window.setTimeout(() => { timers.delete(x); mineTimers.delete(x); began(move); }, t.delay);
        timers.add(x);
        mineTimers.add(x);
      } else began(move);
    }
    const pileEl = resolveAt(move.pile);
    const atEl = resolveAt(move.at);
    if (!pileEl || !atEl || typeof atEl.animate !== 'function') continue;
    const pr = pileEl.getBoundingClientRect();
    const ar = atEl.getBoundingClientRect();
    const [from, to] = move.dir === 'out' ? [pr, ar] : [ar, pr];
    const f0 = move.from;
    const dx = from.left - to.left + (f0?.x ?? 0);
    const dy = from.top - to.top + (f0?.y ?? 0);
    const sx = from.width / (to.width || 1) * (f0?.scale ?? 1);
    const sy = from.height / (to.height || 1) * (f0?.scale ?? 1);
    const rest = move.turn ? `rotate(${String(move.turn)}deg)` : '';
    const start = `translate(${String(dx)}px, ${String(dy)}px) scale(${String(sx)}, ${String(sy)})${f0?.tilt ? ` rotate(${String(f0.tilt)}deg)` : ''}`;
    const end = rest ? `${REST} ${rest}` : REST;
    const stand = (el: HTMLElement) => {
      el.removeAttribute('data-card-id');
      el.dataset['motionStandin'] = '';
      lay(el, to);
      return el;
    };
    const fly = (el: HTMLElement, frames: Keyframe[]) => {
      const a = el.animate(frames, { duration: t.ms, delay: t.delay, fill: 'both', easing: 'ease-in-out' });
      mine.push(a);
      ends.push(track(a, el));
    };
    if (move.faceDown) {
      const back = stand((o.back ?? cardBack)(move.pile, from));
      const card = stand(face(move.id, atEl));
      const [first, second] = move.dir === 'out' ? [back, card] : [card, back];
      const fr = flipFrames({ x: dx, y: dy, sx, sy, rot: f0?.tilt, rest: move.turn }, {
        lift: o.flipLift ?? (t.lift !== 1 ? t.lift : FLIP_LIFT), perspective: o.perspective, start: o.flipStart, end: o.flipEnd, axis: o.axis, direction: o.direction, vanish: t.vanish, liftCurve: o.liftCurve,
      });
      fly(first, fr.first);
      fly(second, fr.second);
      continue;
    }
    const el = stand(move.faceDown ? (o.back ?? cardBack)(move.pile, from) : face(move.id, atEl));
    const mid = t.lift !== 1 ? [{ transform: `${end} scale(${String(t.lift)})`, offset: 0.5 }] : [];
    fly(el, [{ transform: start, offset: 0 }, ...mid, { transform: end, offset: 1, ...(t.vanish ? { opacity: 0 } : {}) }]);
  }
  let stopRif = () => undefined as void;
  const rif = plan.shuffling.length
    ? new Promise<void>((r) => {
        const x = { t: 0, r };
        x.t = window.setTimeout(() => {
          timers.delete(x);
          void shuffleDecks(plan.shuffling, speed, o).then(r);
        }, plan.shuffleAt);
        timers.add(x);
        stopRif = () => { window.clearTimeout(x.t); timers.delete(x); r(); };
      })
    : Promise.resolve();
  const abort = () => {
    for (const x of [...mineTimers]) { window.clearTimeout(x.t); timers.delete(x); mineTimers.delete(x); }
    stopRif();
    for (const a of mine) a.finish();
    for (const p of plan.shuffling) { const at = pileElement(p); if (at) riffling.get(at)?.finish(); }
  };
  if (o.signal?.aborted) abort();
  else o.signal?.addEventListener('abort', abort, { once: true });
  return { plan, done: Promise.all([...ends, rif]).then(() => { o.signal?.removeEventListener('abort', abort); }) };
}

/**
 * A riffle over a deck (K396, the owner-approved riffle study): the top view by default, `view: 'side'` edge-on. The deck is
 * hidden meanwhile; a deck already riffling is not riffled again. Speed 0, reduced motion or a deck with no size: resolves at once.
 */
export const riffle = (deck: HTMLElement, speed = 1, o: DeckMotionOpts = {}): Promise<void> =>
  startRiffle(deck, sum(o.durations ?? RIFFLE_PHASES_MS) * speed, o)?.done ?? Promise.resolve();

function startRiffle(deck: HTMLElement, duration: number, o: DeckMotionOpts, shake?: RiffleVerbOpts['shake']) {
  const running = riffling.get(deck);
  if (running !== undefined) return running;
  if (!(duration > 0) || reduced()) return undefined;
  let ended: Promise<unknown>;
  let stop: () => void;
  if (shake) {
    const top = topOf(deck);
    if (typeof top.animate !== 'function') return undefined;
    const a = top.animate([
      { transform: 'none' },
      { transform: `rotate(${String(-shake.degrees)}deg) translateX(${String(-shake.pixels)}px)` },
      { transform: `rotate(${String(shake.degrees)}deg) translateX(${String(shake.pixels)}px)` },
      { transform: `rotate(${String(-shake.degrees / 2)}deg)` },
      { transform: 'none' },
    ].map((frame) => ({ ...frame, easing: 'ease-in-out' })), { duration });
    ended = a.finished.catch(() => undefined);
    stop = () => { a.finish(); };
  } else {
    const d = o.durations ?? RIFFLE_PHASES_MS;
    const pile = deck.getAttribute('data-pile') ?? '';
    const back = o.back;
    const opts = { speed: sum(d) / duration, cards: o.cards ?? RIFFLE_DECK_CARDS, orientation: o.orientation, durations: d.map((ms) => ms / 1000) };
    const m = o.view === 'side'
      ? riffleSide(deck, { ...opts, ...(back ? { back: (top: HTMLElement) => back(pile, top.getBoundingClientRect()) } : {}) })
      : riffleTop(deck, { ...opts, ...(o.topBack ? { back: o.topBack } : {}) });
    if (!m.finish) return undefined;
    ended = m.done;
    stop = m.finish;
  }
  const clean = () => {
    riffles.delete(motion);
    if (riffling.get(deck) === motion) riffling.delete(deck);
  };
  const motion = { done: ended.then(clean), finish: () => { stop(); clean(); } };
  riffling.set(deck, motion);
  riffles.add(motion);
  return motion;
}

export interface RiffleVerbOpts extends Pick<DeckMotionOpts, 'back' | 'unit' | 'view' | 'orientation' | 'cards' | 'durations' | 'topBack'> {
  resolvePile?: (id: string) => HTMLElement | null | undefined;
  shake?: { degrees: number; pixels: number };
}

export function registerRiffle<C>(verbs: Pick<VerbRegistry<C>, 'register'>, opts: RiffleVerbOpts = {}): void {
  verbs.register('riffle', (call) => {
    const deck = (opts.resolvePile ?? pileElement)(call.actor);
    if (!deck) return undefined;
    return startRiffle(deck, call.step['natural'] === true ? sum(opts.durations ?? RIFFLE_PHASES_MS) : call.dur, opts, opts.shake)?.finish;
  });
}

/** Shuffle the named piles the screen draws, resolving when they have settled. */
export const shuffleDecks = (piles: readonly string[], speed = 1, o: DeckMotionOpts = {}): Promise<void> =>
  Promise.all([...new Set(piles)].flatMap((p) => { const at = pileElement(p); return at === null ? [] : [riffle(at, speed, o)]; })).then(() => undefined);
