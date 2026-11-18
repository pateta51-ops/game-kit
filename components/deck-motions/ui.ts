// K250: the DOM side of deck-motions: flights of stand-in cards between piles and places, the riffle. Ported from STCC
// src/ui/motion/dealing.ts (main 8e6f55b), from LordOfTheRings (a3f3c01, BSD-3: LICENSE-LordOfTheRings.txt).
import { MOCK_U, RIFFLE_CARDS, RIFFLE_MS, planDeal, riffleFrames, type At, type DealPlan, type Move } from './plan.ts';

export * from './plan.ts';

export interface DeckMotionOpts {
  /** Time factor from the game's setting; 0 = none. Reduced motion is none too. */
  speed?: number;
  /** A stand-in showing a card back over `rect` (the game's back image). Default: an empty div with `data-pile-back`. */
  back?: (pile: string, rect: { width: number; height: number }) => HTMLElement;
  /** The face laid in place when a face-down card turns up, or flies into a pile (default: a clone of the place's element). */
  face?: (id: string, el: HTMLElement) => HTMLElement;
  /** The game's unit in px for the riffle's offsets (default: `--u` on the pile, else MOCK_U). */
  unit?: (pile: HTMLElement) => number;
  /** Turn-over axis: 'x' turns side to side (rotateY, default), 'y' top to bottom (rotateX). */
  axis?: 'x' | 'y';
}

const live = new Set<Animation>();
const timers = new Set<{ t: number; r: () => void }>();
const riffling = new WeakMap<HTMLElement, Promise<void>>();
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

const unitOf = (top: HTMLElement, o: DeckMotionOpts): number => {
  if (o.unit) return o.unit(top);
  const u = parseFloat(getComputedStyle(top).getPropertyValue('--u'));
  return Number.isFinite(u) && u > 0 ? u : MOCK_U;
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

/**
 * Cards fly between a pile and their places: stand-ins are laid on the page and fly with their delays; a face-down card turns
 * over on the way (back first, then the face at the place); a refill lifts; a card going face down into a pile vanishes; then
 * the piles in `shuffled` riffle. Call once the new view is rendered (the places exist). Which moves is the game's call from
 * its view diff; `planDeal` and `cycleMove` give the timing and the deck cycle.
 */
export function dealFrom(moves: readonly Move[], o: DeckMotionOpts & { shuffled?: readonly string[]; departs?: boolean } = {}): Dealing {
  const speed = reduced() ? 0 : (o.speed ?? 1);
  const plan = planDeal(moves, { speed, shuffled: o.shuffled, departs: o.departs });
  const face = o.face ?? ((_id: string, el: HTMLElement) => el.cloneNode(true) as HTMLElement);
  const ends: Promise<void>[] = [];
  for (const t of plan.timed) {
    const { move } = t;
    const pileEl = resolveAt(move.pile);
    const atEl = resolveAt(move.at);
    if (!pileEl || !atEl || typeof atEl.animate !== 'function') continue;
    const pr = pileEl.getBoundingClientRect();
    const ar = atEl.getBoundingClientRect();
    const [from, to] = move.dir === 'out' ? [pr, ar] : [ar, pr];
    const start = `translate(${String(from.left - to.left)}px, ${String(from.top - to.top)}px) scale(${String(from.width / (to.width || 1))}, ${String(from.height / (to.height || 1))})`;
    const stand = (el: HTMLElement) => {
      el.removeAttribute('data-card-id');
      el.dataset['motionStandin'] = '';
      lay(el, to);
      return el;
    };
    const fly = (el: HTMLElement, frames: Keyframe[]) => {
      ends.push(track(el.animate(frames, { duration: t.ms, delay: t.delay, fill: 'both', easing: 'ease-in-out' }), el));
    };
    if (move.faceDown && move.dir === 'out') {
      const rot = o.axis === 'y' ? 'rotateX' : 'rotateY';
      const b = stand((o.back ?? cardBack)(move.pile, from));
      const f = stand(face(move.id, atEl));
      fly(b, [{ transform: `${start} ${rot}(0deg)`, offset: 0 }, { transform: `${REST} ${rot}(90deg)`, offset: 0.5 }, { transform: `${REST} ${rot}(90deg)`, offset: 1 }]);
      fly(f, [{ transform: `${start} ${rot}(-90deg)`, offset: 0 }, { transform: `${start} ${rot}(-90deg)`, offset: 0.5 }, { transform: `${REST} ${rot}(0deg)`, offset: 1 }]);
      continue
    }
    const el = stand(move.faceDown ? (o.back ?? cardBack)(move.pile, from) : face(move.id, atEl));
    const mid = t.lift !== 1 ? [{ transform: `${REST} scale(${String(t.lift)})`, offset: 0.5 }] : [];
    fly(el, [{ transform: start, offset: 0 }, ...mid, { transform: REST, offset: 1, ...(t.vanish ? { opacity: 0 } : {}) }]);
  }
  const rif = plan.shuffling.length
    ? new Promise<void>((r) => {
        const x = { t: 0, r };
        x.t = window.setTimeout(() => {
          timers.delete(x);
          void shuffleDecks(plan.shuffling, speed, o).then(r);
        }, plan.shuffleAt);
        timers.add(x);
      })
    : Promise.resolve();
  return { plan, done: Promise.all([...ends, rif]).then(() => undefined) };
}

/**
 * A riffle over a deck (the owner-approved shuffle v2, STCC D-428): a stack of backs on it splits in two halves a card width
 * apart, falls back in from the bottom of each half in turn, squares up and is tapped. The deck is hidden meanwhile; a deck
 * already riffling is not riffled again. With no Web Animations (jsdom), speed 0 or reduced motion it resolves at once.
 */
export const riffle = (deck: HTMLElement, speed = 1, o: DeckMotionOpts = {}): Promise<void> => {
  const running = riffling.get(deck);
  if (running !== undefined) return running;
  const top = topOf(deck);
  if (typeof top.animate !== 'function' || speed <= 0 || reduced()) return Promise.resolve();
  const { left, top: y, width, height } = top.getBoundingClientRect();
  const k = unitOf(top, o) / MOCK_U;
  const half = RIFFLE_CARDS / 2;
  deck.style.visibility = 'hidden';
  const cards = Array.from({ length: RIFFLE_CARDS }, (_, n) => {
    const card = (o.back ?? cardBack)(deck.getAttribute('data-pile') ?? '', { width, height });
    lay(card, { left, top: y, width, height });
    card.style.zIndex = String(1000 + (n % half) * 2 + (n < half ? 0 : 1));
    return card.animate(riffleFrames(n, width, k), { duration: RIFFLE_MS * speed, fill: 'both' });
  });
  cards.forEach((a) => live.add(a));
  const done = Promise.all(cards.map((a) => a.finished.catch(() => undefined))).then(() => {
    cards.forEach((a) => {
      live.delete(a);
      (a.effect as KeyframeEffect | null)?.target?.remove();
    });
    deck.style.removeProperty('visibility');
    if (deck.getAttribute('style') === '') deck.removeAttribute('style');
    riffling.delete(deck);
  });
  riffling.set(deck, done);
  return done;
};

/** Shuffle the named piles the screen draws, resolving when they have settled. */
export const shuffleDecks = (piles: readonly string[], speed = 1, o: DeckMotionOpts = {}): Promise<void> =>
  Promise.all([...new Set(piles)].flatMap((p) => { const at = pileElement(p); return at === null ? [] : [riffle(at, speed, o)]; })).then(() => undefined);
