// The built-in verbs of the director's spec format as DOM effects (Web Animations API), plus the way a game adds its own.
import type { Run, VerbCall, VerbRegistry } from '../motion-frame/index.ts';
import { createEffectLayer, place, type EffectLayer, type LayerOptions } from './layer.ts';

import { registerCanvasEffect } from './canvas.ts';
import { arcMove, multiStopMove } from './flight-effects.ts';
import { trail } from './trail.ts';
import { columnBeam, rotatingBeam } from './beams.ts';
import { projectile, ringPulse, shimmer } from './combat-dom.ts';
import { bolt } from './combat-canvas.ts';
import { dissolve, dissolveSmoke, shatter } from './break-effects.ts';
import { shieldBubble } from './shield-bubble.ts';
import { curvedBeam, radialStreaks } from './beam-canvas.ts';
import { collapseJump } from './collapse.ts';
import { warpTransfer } from './transfer.ts';
import { spiralTransfer } from './spiral.ts';
import { stamp } from './signal-stamp.ts';
import { motes } from './signal-motes.ts';
import { flicker } from './signal-flicker.ts';
import { barFill } from './signal-bar.ts';
import { rotate } from './rotation.ts';

import { refresh } from './refresh.ts';
import { pulseEffect } from './loops.ts';
import { idle } from './idle.ts';
import { typewriter, type TypewriterSettings } from './typewriter.ts';
import { registerDashLine } from './dash-line.ts';
import { reticle } from './reticle.ts';
import { debris } from './debris.ts';
import { sheen } from './sheen.ts';
import { slash } from './slash.ts';
import { registerCrumple } from './crumple.ts';

export type { ArcMoveSettings } from './flight-effects.ts';
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
  'arc-move': arcMove,
  'multi-stop-path': multiStopMove,
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
    if (call.step['squash'] === false) {
      swap();
      return undefined;
    }
    const hm = call.step['holdMs'];
    const h = typeof hm === 'number' && call.dur > 0 ? Math.min(Math.max(hm, 0), call.dur * 0.8) : 0;
    const mid = h + (call.dur - h) / 2;
    const timer = setTimeout(swap, mid);
    const vertical = call.step['axis'] === 'y';
    const direction = call.step['direction'];
    if (direction === 1 || direction === -1) {
      const perspective = typeof call.step['perspective'] === 'number' ? call.step['perspective'] : 800;
      const transform = (degrees: number) => `perspective(${perspective}px) rotate${vertical ? 'X' : 'Y'}(${degrees}deg)`;
      const ease = call.step['ease'];
      const easing = typeof ease === 'string' ? EASE[ease] ?? ease : 'ease-in-out';
      const edge = call.dur > 0 ? mid / call.dur : .5;
      animate([
        { transform: transform(0), easing },
        ...(h > 0 ? [{ transform: transform(0), offset: h / call.dur, easing }] : []),
        { transform: transform(direction * 90), offset: edge },
        { transform: transform(-direction * 90), offset: edge, easing },
        { transform: transform(0) },
      ], { transform: 'none' }, { easing: 'linear' });
    } else {
      const scale = vertical ? 'scaleY' : 'scaleX';
      const rest = { transform: `${scale}(1)` };
      const edge = { transform: `${scale}(0)` };
      animate(h > 0 ? [rest, { ...rest, offset: h / call.dur }, { ...edge, offset: mid / call.dur }, rest] : [rest, edge, rest], { transform: 'none' });
    }
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
  glow: ({ call, animate, el }) => {
    const colour = call.step['colour'];
    const shadows = call.step['shadows'];
    const hold = call.step['hold'];
    const off = typeof colour === 'string' ? '0 0 0 0 transparent' : 'var(--fx-glow-off,0 0 0 0)';
    const on = typeof colour === 'string'
      ? (Array.isArray(shadows) ? shadows.filter((s): s is string => typeof s === 'string') : ['0 0 24px 6px']).map((s) => `${s} ${colour}`).join(',')
      : 'var(--fx-glow,0 0 24px 6px)';
    const span = typeof hold === 'number' ? Math.max(0, Math.min(1, hold)) : 0;
    const pulse = span > 0
      ? [{ boxShadow: on, offset: (1 - span) / 2 }, { boxShadow: on, offset: (1 + span) / 2 }]
      : [{ boxShadow: on }];
    animate([{ boxShadow: off }, ...pulse, { boxShadow: off }], { boxShadow: el.style.boxShadow });
    return undefined;
  },
  unroll: ({ call, el, animate }) => {
    const axis = call.step['axis'] === 'x' ? 'X' : 'Y';
    const origin = call.step['origin'];
    const transformOrigin = typeof origin === 'string' ? origin : axis === 'X' ? 'left' : 'top';
    el.style.opacity = '1';
    animate(
      [{ transform: `scale${axis}(0)`, transformOrigin }, { transform: `scale${axis}(1)`, transformOrigin }],
      { transform: 'none', opacity: '1', visibility: 'visible' },
      { easing: 'ease-out' },
    );
    return undefined;
  },
  text: (fx) => {
    const { call, el, animate } = fx;
    const s = call.step['text'] ?? call.step['label'];
    el.textContent = typeof s === 'string' ? s : call.value !== undefined ? String(call.value) : '';
    const rise = 'translateY(var(--fx-text-rise,12px))';
    css(el, { color: 'var(--fx-text,inherit)', font: 'var(--fx-text-font,inherit)' });
    const reveal = call.step['typewriter'];
    if (reveal === true || (reveal && typeof reveal === 'object')) {
      const settings = reveal === true ? {} : reveal as TypewriterSettings;
      el.style.textAlign = settings.textAlign ?? 'center';
      if (settings.rise !== false) animate([{ transform: rise }, { transform: 'none' }], { transform: 'none' });
      return typewriter(fx, settings);
    }
    el.style.textAlign = 'center';
    animate([{ opacity: 0, transform: rise }, { opacity: 1, offset: 0.25 }, { opacity: 1, transform: 'none' }], { opacity: '1', transform: 'none' });
    return undefined;
  },
  spin: rotate,
  tap: rotate,
  untap: rotate,
};

/** The built-in verbs registered, and a layer made. Pass the registry to the motion player and the layer as its `context`. */
export function registerEffects(verbs: VerbRegistry<EffectCtx>, o?: LayerOptions): EffectLayer {
  for (const [name, fx] of Object.entries(BUILT_IN)) registerEffect(verbs, name, fx);
  registerCanvasEffect(verbs, 'trail', trail);
  registerCanvasEffect(verbs, 'radial-streaks', radialStreaks);
  registerCanvasEffect(verbs, 'column-beam', curvedBeam);
  const curve = verbs.get('column-beam');
  registerEffect(verbs, 'column-beam', columnBeam);
  const column = verbs.get('column-beam');
  verbs.register('column-beam', (call, run) => (call.step['curve'] ? curve : column)?.(call, run));
  registerEffect(verbs, 'collapse-jump', collapseJump);
  registerEffect(verbs, 'rotating-beam', rotatingBeam);
  registerEffect(verbs, 'projectile', projectile);
  const beam = verbs.get('projectile');
  registerCanvasEffect(verbs, 'projectile', bolt);
  const shot = verbs.get('projectile');
  verbs.register('projectile', (call, run) => (call.step['bolt'] ? shot : beam)?.(call, run));
  registerCanvasEffect(verbs, 'dissolve', dissolveSmoke);
  const smoke = verbs.get('dissolve');
  registerEffect(verbs, 'dissolve', dissolve);
  const burn = verbs.get('dissolve');
  verbs.register('dissolve', (call, run) => {
    const endBurn = burn?.(call, run);
    const endSmoke = call.step['lift'] ? smoke?.(call, run) : undefined;
    return () => {
      endSmoke?.();
      endBurn?.();
    };
  });
  registerEffect(verbs, 'shatter', shatter);
  registerEffect(verbs, 'shimmer', shimmer);
  registerEffect(verbs, 'ring-pulse', ringPulse);
  registerCanvasEffect(verbs, 'shield-bubble', shieldBubble);
  registerCanvasEffect(verbs, 'warp-transfer', spiralTransfer);
  const spiral = verbs.get('warp-transfer');
  registerEffect(verbs, 'warp-transfer', warpTransfer);
  const transfer = verbs.get('warp-transfer');
  verbs.register('warp-transfer', (call, run) => (call.step['spiral'] ? spiral : transfer)?.(call, run));
  verbs.register('shake-group', (call, run) => {
    const { selector, actors, amplitude = 6, crossAmplitude = 1, frames = 9 } = call.step;
    const targets = typeof selector === 'string'
      ? Array.from(run.context.el.ownerDocument.querySelectorAll<HTMLElement>(selector))
      : run.timeline.actors.filter((a) => Array.isArray(actors) ? actors.includes(a.id) : a.id === call.actor)
        .map((a) => run.context.actor(run, a.id, a.rect));
    const animations = targets.map((el, n) => el.animate(Array.from({ length: typeof frames === 'number' ? frames : 9 }, (_, j) => ({
      transform: `translate(${String((j % 2 ? 1 : -1) * Number(amplitude))}px,${String(((j + n) % 3 - 1) * Number(crossAmplitude))}px)`,
    })), { duration: Math.max(call.dur, 1) }));
    return () => animations.forEach((a) => a.cancel());
  });
  registerEffect(verbs, 'stamp', stamp);
  registerEffect(verbs, 'motes', motes);
  registerEffect(verbs, 'flicker', flicker);
  registerEffect(verbs, 'bar-fill', barFill);
  registerEffect(verbs, 'refresh', refresh);
  registerEffect(verbs, 'pulse', pulseEffect);
  registerEffect(verbs, 'idle', idle);
  registerDashLine(verbs, o?.resolve, o?.stage);
  registerCanvasEffect(verbs, 'reticle', reticle);
  registerCanvasEffect(verbs, 'debris', debris);
  registerEffect(verbs, 'sheen', sheen);
  registerCanvasEffect(verbs, 'slash', slash);
  registerCrumple(verbs);
  return createEffectLayer(o);
}
