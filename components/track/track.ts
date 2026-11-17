import type { Speed } from '../motion-frame/index.ts';

export type SpaceState = 'past' | 'current' | 'future' | 'skipped';

/** A mark on a space (a border, a colour): a letter and a name always travel with it, colour is never the only signal. */
export interface Mark {
  id: string;
  letter: string;
  name: string;
}

export interface Space {
  value: number | string;
  marks?: readonly Mark[];
  /** an optional effect the space carries: `text` is the game's words */
  effect?: { id: string; text: string };
  /** the last space */
  max?: boolean;
  skipped?: boolean;
}

/** The words of the game; the kit has none. */
export interface TrackWords {
  space: (n: number) => string;
  value: (v: number | string) => string;
  max: string;
  skipped: string;
  here: string;
}

export const stateOf = (spaces: readonly Space[], index: number, i: number): SpaceState =>
  i === index ? 'current' : i < index ? 'past' : spaces[i]?.skipped ? 'skipped' : 'future';

/** The label of one space (aria-label and title): "Space 3, danger 2, G border, optional..., the marker is here". */
export function spaceLabel(space: Space, i: number, state: SpaceState, words: TrackWords): string {
  const parts = [words.space(i + 1), space.max === true ? words.max : words.value(space.value)];
  if (space.marks?.length) parts.push(space.marks.map((m) => m.name).join(', '));
  if (space.effect) parts.push(space.effect.text);
  if (space.skipped) parts.push(words.skipped);
  if (state === 'current') parts.push(words.here);
  return parts.join(', ');
}

/** Glide: the marker's time at speed 1, ms. */
export const GLIDE_MS = 650;
export const GLIDE_RISE = 14;
export const GLIDE_CURVE = 'cubic-bezier(0.45, 0, 0.25, 1)';

export interface GlideOptions {
  /** glide a move back too (default: forward only) */
  backward?: boolean | undefined;
  /** true on an undo or redo: the marker jumps */
  undone?: boolean;
  speed?: Speed;
}

/** The length of the glide in ms, or 0 when the marker only jumps (back, undo, redo, speed 0, instant, no move). */
export function glideMs(from: number, to: number, o: GlideOptions = {}): number {
  const s = o.speed ?? 1;
  if (o.undone || from === to || (to < from && !o.backward) || s === 'instant' || s <= 0) return 0;
  return GLIDE_MS * s;
}

/** FLIP frames: from the old centre offset (dx, dy) to rest, a small rise and 1.15 scale half way. `rest` is the piece's own transform. */
export function glideFrames(dx: number, dy: number, rest = ''): Keyframe[] {
  const r = rest ? ` ${rest}` : '';
  return [
    { transform: `translate(${String(dx)}px, ${String(dy)}px)${r}` },
    { transform: `translate(${String(dx / 2)}px, ${String(dy / 2 - GLIDE_RISE)}px) scale(1.15)${r}`, offset: 0.5 },
    { transform: `translate(0, 0)${r}` },
  ];
}

/** Hop-and-fill (STCC crew track): one step hops 360 ms, each further step adds 120 ms. */
export const HOP_MS = 360;
export const HOP_EXTRA_MS = 120;
export const BADGE_IN_MS = 300;
export const PULSE_MS = 640;
export const PULSES = 2;
export const RISE_MS = 1100;

export interface HopPlan {
  steps: number;
  /** hop and fill, ms (0 = jump) */
  ms: number;
  /** the number bumps after the hop */
  bump: boolean;
  /** a new multiplier: the badge pops, pulses, "×N" rises */
  badge: boolean;
  mult: number;
}

/** The timeline of one advance from `from` to `to`; multipliers are the game's. Forward only unless `backward`. */
export function hopPlan(from: number, to: number, multFrom = 1, multTo = 1, o: GlideOptions = {}): HopPlan {
  const steps = Math.abs(to - from);
  const s = o.speed ?? 1;
  const none = o.undone || steps === 0 || (to < from && !o.backward) || s === 'instant' || s <= 0;
  return {
    steps,
    ms: none ? 0 : (HOP_MS + HOP_EXTRA_MS * (steps - 1)) * s,
    bump: !none,
    badge: !none && to > from && multTo !== multFrom && multTo > 1,
    mult: multTo,
  };
}

/** Frames of the dot's hop: lift in px, 1.15 up and 0.94 down. */
export const hopFrames = (lift: number): Keyframe[] => {
  const at = (dy: number, k: number): string => `translate(-50%, calc(-50% - ${String(dy)}px)) scale(${String(k)})`;
  return [{ transform: at(0, 1) }, { transform: at(lift, 1.15), offset: 0.45 }, { transform: at(0, 0.94), offset: 0.82 }, { transform: at(0, 1) }];
};

export const BADGE_FRAMES: Keyframe[] = [
  { transform: 'scale(0)', opacity: 0 },
  { transform: 'scale(1.35)', opacity: 1, offset: 0.6 },
  { transform: 'scale(1)', opacity: 1 },
];
export const PULSE_FRAMES: Keyframe[] = [
  { transform: 'scale(.8)', opacity: 1 },
  { transform: 'scale(3)', opacity: 0 },
];
export const riseFrames = (fs: number): Keyframe[] => {
  const rise = (k: number): string => `translateY(${String(-k * fs)}px)`;
  return [
    { opacity: 0, transform: `${rise(0)} scale(.6)` },
    { opacity: 1, transform: `${rise(0.55)} scale(1.15)`, offset: 0.25 },
    { opacity: 1, transform: `${rise(0.85)} scale(1)`, offset: 0.75 },
    { opacity: 0, transform: rise(1.25) },
  ];
};

/** A list of steps as a track with one lit step (STCC StepTrack, from LotR PhaseTracker). */
export interface StepItem {
  id: string;
  name: string;
}
export const stepsOf = (steps: readonly StepItem[], current: string | null) => steps.map((s) => ({ ...s, lit: s.id === current }));
