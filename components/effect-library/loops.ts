import type { Effect } from './effects.ts';

export interface PulseSettings {
  period?: number;
  easing?: string;
  frames?: readonly Keyframe[];
  /** K435: pulse the element's ::before or ::after */
  pseudo?: '::before' | '::after';
  /** K435: ms before the first pulse */
  delay?: number;
  /** K435: one pulse, then stop (a hit flash) */
  once?: boolean;
  /** K435: pulse under reduced motion too */
  keepReduced?: boolean;
}

interface LoopState {
  speed?: number | 'instant';
  signal?: AbortSignal;
  /** K435: plays under reduced motion too */
  keepReduced?: boolean;
}

export function startPulse(el: HTMLElement, settings: PulseSettings = {}, state: LoopState = {}): () => void {
  const { frames = [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }], period = 1500, easing = 'ease-in-out', pseudo, delay, once, keepReduced } = settings;
  return startLoop(el, keepReduced ? { ...state, keepReduced } : state, (speed) => {
    const animation = el.animate(frames.map((frame) => ({ easing, ...frame })), {
      duration: period * speed, iterations: once ? 1 : Infinity,
      ...(pseudo && { pseudoElement: pseudo }), ...(delay && { delay: delay * speed }),
    });
    return () => animation.cancel();
  });
}

export function startLoop(el: HTMLElement, { speed = 1, signal, keepReduced }: LoopState, play: (speed: number) => () => void): () => void {
  const media = keepReduced ? undefined : el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (speed === 'instant' || speed <= 0 || media?.matches || signal?.aborted || typeof el.animate !== 'function') return () => {};
  const cancel = play(speed);
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    media?.removeEventListener('change', stop);
    signal?.removeEventListener('abort', stop);
    cancel();
  };
  media?.addEventListener('change', stop, { once: true });
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}

export const pulseEffect: Effect = ({ call, el }) => {
  const settings = call.step as PulseSettings & { target?: string; signal?: AbortSignal };
  const target = settings.target === undefined ? el : el.querySelector<HTMLElement>(settings.target);
  if (target === null) return undefined;
  return startPulse(target, settings, {
    speed: call.dur / Math.max(1, call.step.dur),
    ...(settings.signal && { signal: settings.signal }),
  });
};
