// K435-1: steps played on the page element itself, no layer and no clone, so a view transition carries what the verbs do to it
// (port of STCC src/ui/motion/effects/kitFx.ts playOn).
import { createMotionPlayer, createVerbs, type Ended, type Rect, type Step, type VerbRegistry } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './effects.ts';
import { flushEnds } from './layer.ts';

export interface PlayOnOptions {
  /** the player's speed (default 1); 0 or less plays at once */
  speed?: number;
  /** written as `data-motion-fx` on every element a verb adds to the element (a stamp's label and ring), so the game finds them */
  kind?: string;
  /** a game's own verbs beside the built-in ones */
  register?: (verbs: VerbRegistry<EffectCtx>) => void;
}
export interface PlayOnHandle {
  /** resolves at the end: `done`, or `skipped` after `cancel` */
  done: Promise<Ended>;
  /** stops it mid-play: every verb jumps to its end state at once */
  cancel(): void;
}

export function playOn(el: HTMLElement, steps: Step[], o: PlayOnOptions = {}): PlayOnHandle {
  const verbs = createVerbs<EffectCtx>();
  registerEffects(verbs).el.remove();
  o.register?.(verbs);
  const kind = o.kind;
  if (kind !== undefined)
    for (const name of verbs.names()) {
      const v = verbs.get(name);
      verbs.register(name, (call, run) => {
        const had = new Set(el.children);
        const done = v?.(call, run);
        for (const n of el.children) if (!had.has(n) && n instanceof HTMLElement) n.dataset['motionFx'] = kind;
        return done;
      });
    }
  const own: EffectCtx = { el, actor: () => el, start: () => undefined, end: (run) => flushEnds(own, run), clear: () => flushEnds(own) };
  const box = (): Rect => {
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height];
  };
  const speed = o.speed ?? 1;
  const player = createMotionPlayer({
    specs: {},
    stages: { default: box },
    verbs,
    speed: () => (speed > 0 ? speed : 'instant'),
    context: own,
    onBeatEnd: (run) => own.end(run),
  });
  const done = new Promise<Ended>((resolve) => {
    player.play({ id: kind ?? 'play-on', maxMs: Math.max(0, ...steps.map((s) => s.t + s.dur)), actors: [{ id: 'el', at: 'el' }], steps }, { onEnded: resolve });
  });
  return { done, cancel: () => player.skipAll() };
}
