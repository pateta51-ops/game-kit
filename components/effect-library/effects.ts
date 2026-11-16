// The twelve verbs of the director's spec format as DOM effects (Web Animations API), plus the way a game adds its own.
import type { Run, VerbCall, VerbRegistry } from '../motion-frame/index.ts';
import { createEffectLayer, place, type EffectLayer, type LayerOptions } from './layer.ts';

export type EffectCtx = EffectLayer;
export interface Fx {
  call: VerbCall;
  run: Run<EffectCtx>;
  /** the layer's clone (or stand-in) of the actor */
  el: HTMLElement;
  layer: EffectLayer;
  /**
   * Plays keyframes over the call's duration. `end` is the inline style the element is left with when the call ends or is
   * skipped (the jump to the end state); the animation is then cancelled.
   */
  animate: (keyframes: Keyframe[], end?: Partial<CSSStyleDeclaration>, opts?: KeyframeAnimationOptions) => void;
}
/** May return its own finish (a timer to clear, an end state to set); `animate`'s finishes run too. */
export type Effect = (fx: Fx) => undefined | (() => void);

/** Step `scale` on an entry verb: a number n = from n to 1 (with `hold: true`, n for the whole step), [a, b] = from a to b. */
const entry = (call: VerbCall): [string, string] | undefined => {
  const s = call.step['scale'];
  const v = (n: unknown): string => (n === 1 ? 'none' : String(n));
  if (typeof s === 'number') return [v(s), call.step['hold'] === true ? v(s) : 'none'];
  if (Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'number') return [v(s[0]), v(s[1])];
  return undefined;
};

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>): void => void Object.assign(el.style, s);

/** Registers one effect, a built-in or a game's own, in the motion frame's verb registry. */
export function registerEffect(verbs: VerbRegistry<EffectCtx>, name: string, effect: Effect): void {
  verbs.register(name, (call, run) => {
    const layer = run.context;
    const el = layer.actor(run, call.actor, call.from);
    const done: (() => void)[] = [];
    const animate: Fx['animate'] = (keyframes, end, opts) => {
      const a = el.animate(keyframes, { duration: Math.max(call.dur, 1), fill: 'both', easing: EASE[String(call.step['ease'])] ?? (typeof call.step['ease'] === 'string' ? call.step['ease'] : 'ease-in-out'), ...opts });
      done.push(() => {
        if (end) css(el, end);
        a.cancel();
      });
    };
    const own = effect({ call, run, el, layer, animate });
    if (own) done.push(own);
    return () => {
      done.forEach((f) => {
        f();
      });
    };
  });
}

const EASE: Readonly<Record<string, string>> = { in: 'ease-in', out: 'ease-out', 'in-out': 'ease-in-out', linear: 'linear' };

export const BUILT_IN: Readonly<Record<string, Effect>> = {
  move: ({ call, el, animate }) => {
    const t = call.to;
    if (!t) return undefined;
    const f = call.from;
    const e = entry(call);
    animate(
      [e ? { translate: '0 0', scale: e[0] } : { translate: '0 0' }, e ? { translate: `${String(t[0] - f[0])}px ${String(t[1] - f[1])}px`, scale: e[1] } : { translate: `${String(t[0] - f[0])}px ${String(t[1] - f[1])}px` }],
      e ? { translate: '', scale: e[1] === 'none' ? '' : e[1] } : { translate: '' },
    );
    return () => {
      place(el, t);
      if (call.step['then'] === 'hide') css(el, { visibility: 'hidden' });
    };
  },
  lift: ({ call, animate }) => {
    const end = { transform: `translateY(var(--fx-lift-rise,-6px)) scale(${String(call.value ?? 1.08)})`, boxShadow: 'var(--fx-lift-shadow,0 12px 24px)' };
    animate([{ transform: 'none', boxShadow: 'none' }, end], end);
    return undefined;
  },
  settle: ({ animate }) => {
    const rest = { transform: 'none', boxShadow: 'var(--fx-settle-shadow,0 1px 3px)' };
    animate(
      [
        { transform: 'translateY(var(--fx-lift-rise,-6px)) scale(1.08)', boxShadow: 'var(--fx-lift-shadow,0 12px 24px)' },
        { transform: 'scale(.98)', boxShadow: rest.boxShadow, offset: 0.7 },
        rest,
      ],
      rest,
    );
    return undefined;
  },
  'fade-in': ({ call, animate }) => {
    const e = entry(call);
    animate(e ? [{ opacity: 0, scale: e[0] }, { opacity: 1, scale: e[1] }] : [{ opacity: 0 }, { opacity: 1 }], e ? { opacity: '1', visibility: 'visible', scale: e[1] === 'none' ? '' : e[1] } : { opacity: '1', visibility: 'visible' });
    return undefined;
  },
  'fade-out': ({ call, animate }) => {
    const o = call.value ?? 0;
    animate([{ opacity: 1 }, { opacity: o }], { opacity: String(o) });
    return undefined;
  },
  show: ({ el }) => {
    css(el, { opacity: '1', visibility: 'visible' });
    return undefined;
  },
  hide: ({ el }) => {
    css(el, { visibility: 'hidden' });
    return undefined;
  },
  flip: ({ call, el, animate }) => {
    const target = !el.hasAttribute('data-fx-flipped');
    const label = call.step['label'];
    const swap = (): void => {
      el.toggleAttribute('data-fx-flipped', target);
      if (typeof label === 'string') el.setAttribute('data-fx-label', label);
    };
    const hm = call.step['holdMs'];
    const h = typeof hm === 'number' && call.dur > 0 ? Math.min(Math.max(hm, 0), call.dur * 0.8) : 0;
    const mid = h + (call.dur - h) / 2;
    const timer = setTimeout(swap, mid);
    animate(h > 0 ? [{ transform: 'scaleX(1)' }, { transform: 'scaleX(1)', offset: h / call.dur }, { transform: 'scaleX(0)', offset: mid / call.dur }, { transform: 'scaleX(1)' }] : [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { transform: 'none' });
    return () => {
      clearTimeout(timer);
      swap();
    };
  },
  scale: ({ call, animate }) => {
    const k = { scale: String(call.value ?? 1) };
    const rest = { scale: 'none' };
    if (call.step['pulse'] === true) animate([rest, k, rest], rest);
    else animate([rest, k], k);
    return undefined;
  },
  shake: ({ call, animate }) => {
    const n = typeof call.step['times'] === 'number' ? call.step['times'] : 4;
    const kf: Keyframe[] = [{ transform: 'translateX(0)' }];
    for (let i = 0; i < n; i++) kf.push({ transform: `translateX(calc(var(--fx-shake,6px) * ${i % 2 ? '1' : '-1'}))` });
    kf.push({ transform: 'translateX(0)' });
    animate(kf, { transform: 'none' });
    return undefined;
  },
  glow: ({ animate, el }) => {
    const off = 'var(--fx-glow-off,0 0 0 0)';
    animate([{ boxShadow: off }, { boxShadow: 'var(--fx-glow,0 0 24px 6px)' }, { boxShadow: off }], { boxShadow: el.style.boxShadow });
    return undefined;
  },
  text: ({ call, el, animate }) => {
    const s = call.step['text'] ?? call.step['label'];
    el.textContent = typeof s === 'string' ? s : call.value !== undefined ? String(call.value) : '';
    css(el, { color: 'var(--fx-text,inherit)', font: 'var(--fx-text-font,inherit)', textAlign: 'center' });
    animate([{ opacity: 0, transform: 'translateY(var(--fx-text-rise,12px))' }, { opacity: 1, offset: 0.25 }, { opacity: 1, transform: 'none' }], { opacity: '1', transform: 'none' });
    return undefined;
  },
};

/** The twelve verbs registered, and a layer made. Pass the registry to the motion player and the layer as its `context`. */
export function registerEffects(verbs: VerbRegistry<EffectCtx>, o?: LayerOptions): EffectLayer {
  for (const [name, fx] of Object.entries(BUILT_IN)) registerEffect(verbs, name, fx);
  return createEffectLayer(o);
}
