// The built-in verbs of the director's spec format as DOM effects (Web Animations API), plus the way a game adds its own.
import type { Rect, Run, VerbCall, VerbRegistry } from '../motion-frame/index.ts';
import { createEffectLayer, endOnFinished, place, type EffectLayer, type LayerOptions } from './layer.ts';

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
import { banner, count, unrollCollapse } from './herald.ts';

import { refresh } from './refresh.ts';
import { pulseEffect } from './loops.ts';
import { idle } from './idle.ts';
import { typewriter, type TypewriterSettings } from './typewriter.ts';
import { registerDashLine } from './dash-line.ts';
import { reticle } from './reticle.ts';
import { debris, debrisDom } from './debris.ts';
import { sheen } from './sheen.ts';
import { fizzle, sparkBurst } from './fizzle.ts';
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

// K436: a curve (numbers spread evenly over 0..1) at k; caller `frames` with the last one as the end style
const nums = (v: unknown): number[] | undefined => (Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === 'number') ? v : undefined);
const at = (c: readonly number[], k: number): number => {
  const i = k * (c.length - 1);
  const j = Math.min(c.length - 2, Math.floor(i));
  return c.length === 1 ? c[0]! : c[j]! + (c[j + 1]! - c[j]!) * (i - j);
};
function callerFrames(call: VerbCall): [Keyframe[], Partial<CSSStyleDeclaration>] | undefined {
  const frames = call.step['frames'];
  if (!Array.isArray(frames) || frames.length === 0) return undefined;
  const last = { ...(frames.at(-1) as Keyframe) };
  delete last.offset;
  delete last.easing;
  return [frames as Keyframe[], Object.fromEntries(Object.entries(last).map(([k, v]) => [k, String(v)]))];
}
/** K436: step `scaleX` / `scaleY` curves as `scale` keyframes (with `base` [sx, sy] at k multiplied in), sampled over the step */
function scaleCurves(call: VerbCall, base?: (k: number) => [number, number]): Keyframe[] | undefined {
  const x = nums(call.step['scaleX']);
  const y = nums(call.step['scaleY']);
  if (!x && !y && !base) return undefined;
  const n = Math.max(2, x?.length ?? 0, y?.length ?? 0, base ? 25 : 0);
  return Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const [bx, by] = base?.(k) ?? [1, 1];
    return { scale: `${String((x ? at(x, k) : 1) * bx)} ${String((y ? at(y, k) : 1) * by)}` };
  });
}
const lastScale = (kf: Keyframe[] | undefined): string => {
  const s = String(kf?.at(-1)?.['scale'] ?? '');
  return s === '1 1' ? '' : s;
};

/** Registers one effect, a built-in or a game's own, in the motion frame's verb registry. */
export function registerEffect(verbs: VerbRegistry<EffectCtx>, name: string, effect: Effect): void {
  verbs.register(name, (call, run) => {
    const layer = run.context;
    const el = layer.actor(run, call.actor, call.from);
    // K436: a step's own z-index and blend for its actor's clone
    const zi = call.step['zIndex'];
    if (typeof zi === 'number' || typeof zi === 'string') el.style.zIndex = String(zi);
    if (typeof call.step['blend'] === 'string') el.style.mixBlendMode = call.step['blend'];
    const done: (() => void)[] = [];
    const anims = new Set<Animation>();
    const all = (): Animation[] => (typeof el.getAnimations === 'function' ? el.getAnimations({ subtree: true }) : []);
    const before = new Set(all());
    const animate: Fx['animate'] = (keyframes, end, opts) => {
      const a = el.animate(keyframes, { duration: Math.max(call.dur, 1), fill: 'both', easing: EASE[String(call.step['ease'])] ?? (typeof call.step['ease'] === 'string' ? call.step['ease'] : 'ease-in-out'), ...opts });
      done.push(() => {
        if (end) css(el, end);
        a.cancel();
      });
      anims.add(a);
    };
    const own = effect({ call, run, el, layer, animate });
    if (own) done.push(own);
    for (const a of all()) if (!before.has(a)) anims.add(a);
    return () => {
      endOnFinished(layer, run, [...anims], () => {
        done.forEach((f) => {
          f();
        });
      }, call.dur, call.t + call.dur >= run.timeline.ms);
    };
  });
}

/**
 * K436 `move` options: caller `frames` (the last is the end style); `scaleX` / `scaleY` curves; `percent: true` translates in % of
 * the actor's own size; `rotate` (deg, to; or [from, to]); `resize: true` lands at the target's size (centre to centre);
 * `output: 'transform'` writes only `transform` (never left/top, translate, rotate or scale), so a separate CSS `scale` composes.
 */
function moveMore({ call, el, animate }: Fx, t: Rect): () => void {
  const f = call.from;
  const tf = call.step['output'] === 'transform';
  const own = callerFrames(call);
  if (own) {
    animate(own[0], own[1]);
    return () => {
      if (!tf) place(el, t);
      if (call.step['then'] === 'hide') css(el, { visibility: 'hidden' });
    };
  }
  const rs = nums(call.step['resize']);
  const resize = call.step['resize'] === true || rs?.length === 2;
  const dx = resize ? t[0] + t[2] / 2 - f[0] - f[2] / 2 : t[0] - f[0];
  const dy = resize ? t[1] + t[3] / 2 - f[1] - f[3] / 2 : t[1] - f[1];
  const [sw, sh] = rs?.length === 2 ? rs : [t[2], t[3]];
  const land: Rect = resize ? [t[0] + t[2] / 2 - sw! / 2, t[1] + t[3] / 2 - sh! / 2, sw!, sh!] : t;
  const pc = call.step['percent'] === true;
  const tr = (k: number): string => pc ? `${String(dx * k / Math.max(1, f[2]) * 100)}% ${String(dy * k / Math.max(1, f[3]) * 100)}%` : `${String(dx * k)}px ${String(dy * k)}px`;
  const rv = call.step['rotate'];
  const rot: readonly [number, number] | undefined = typeof rv === 'number' ? [0, rv] : nums(rv)?.length === 2 ? nums(rv) as [number, number] : undefined;
  const sv = call.step['scale'];
  const ent: readonly [number, number] | undefined = typeof sv === 'number' ? [sv, call.step['hold'] === true ? sv : 1] : nums(sv)?.length === 2 ? nums(sv) as [number, number] : undefined;
  const kx = resize ? sw! / Math.max(1, f[2]) : 1, ky = resize ? sh! / Math.max(1, f[3]) : 1;
  const sizeAt = (k: number): [number, number] => {
    const s = ent ? ent[0] + (ent[1] - ent[0]) * k : 1;
    return [s * (1 + (kx - 1) * k), s * (1 + (ky - 1) * k)];
  };
  const curves = scaleCurves(call, ent || resize ? sizeAt : undefined);
  const n = Math.max(2, curves?.length ?? 0);
  const frames = Array.from({ length: n }, (_, i): Keyframe => {
    const k = i / (n - 1);
    const sc = String(curves?.[i]?.['scale'] ?? '1 1').replace(' ', ', ');
    const deg = rot ? rot[0] + (rot[1] - rot[0]) * k : 0;
    if (tf) return { transform: `translate(${tr(k).replace(' ', ', ')}) rotate(${String(deg)}deg) scale(${sc})` };
    return { translate: tr(k), ...(rot ? { rotate: `${String(deg)}deg` } : {}), ...(curves ? { scale: curves[i]?.['scale'] } : {}) };
  });
  const last = frames.at(-1)!;
  const end: Partial<CSSStyleDeclaration> = tf ? { transform: String(last.transform) } : { translate: '', ...(rot ? { rotate: rot[1] ? `${String(rot[1])}deg` : '' } : {}), ...(curves ? { scale: lastScale(scaleCurves(call, () => [ent?.[1] ?? 1, ent?.[1] ?? 1])) } : {}) };
  animate(frames, end, { easing: EASE[String(call.step['ease'])] ?? (typeof call.step['ease'] === 'string' ? call.step['ease'] : 'ease-in-out') });
  return () => {
    if (!tf) place(el, land);
    if (call.step['then'] === 'hide') css(el, { visibility: 'hidden' });
  };
}

const EASE: Readonly<Record<string, string>> = { in: 'ease-in', out: 'ease-out', 'in-out': 'ease-in-out', linear: 'linear' };

export const BUILT_IN: Readonly<Record<string, Effect>> = {
  move: (fx) => {
    const { call, el, animate } = fx;
    const t = call.to;
    if (!t) return undefined;
    if (['frames', 'scaleX', 'scaleY', 'percent', 'rotate', 'resize'].some((k) => call.step[k] !== undefined) || call.step['output'] === 'transform') return moveMore(fx, t);
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
  'round-trip': multiStopMove,
  lift: ({ call, animate }) => {
    // K435-5: step `scale: false` lifts with no scale, `shadow: false` with no shadow
    const sc = call.step['scale'] === false ? '' : ` scale(${String(call.value ?? 1.08)})`;
    const sh = call.step['shadow'] !== false;
    const end = { transform: `translateY(var(--fx-lift-rise,-6px))${sc}`, ...(sh ? { boxShadow: 'var(--fx-lift-shadow,0 12px 24px)' } : {}) };
    animate([{ transform: 'none', ...(sh ? { boxShadow: 'none' } : {}) }, end], end);
    return undefined;
  },
  settle: ({ call, animate }) => {
    const rest = { transform: 'none', boxShadow: 'var(--fx-settle-shadow,0 1px 3px)' };
    // K435-4: caller `frames` (the last is the end state), or the curve: `fromScale`, `rise` px, `dip` scale at `dipAt`
    const frames = call.step['frames'];
    if (Array.isArray(frames) && frames.length > 0) {
      const last = { ...(frames.at(-1) as Keyframe) };
      delete last.offset;
      delete last.easing;
      animate(frames as Keyframe[], Object.fromEntries(Object.entries(last).map(([k, v]) => [k, String(v)])));
      return undefined;
    }
    const n = (k: string): number | undefined => (typeof call.step[k] === 'number' ? call.step[k] : undefined);
    const rise = n('rise');
    animate(
      [
        { transform: `translateY(${rise === undefined ? 'var(--fx-lift-rise,-6px)' : `${String(rise)}px`}) scale(${String(n('fromScale') ?? 1.08)})`, boxShadow: 'var(--fx-lift-shadow,0 12px 24px)' },
        { transform: `scale(${String(n('dip') ?? 0.98)})`, boxShadow: rest.boxShadow, offset: n('dipAt') ?? 0.7 },
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
    // K436: `faces` [front, back] selectors in the actor: the front shows until the swap, then the back
    const faces = Array.isArray(call.step['faces']) ? (call.step['faces'] as unknown[]).map((s) => (typeof s === 'string' ? el.querySelector<HTMLElement>(s) : null)) : [];
    const show = (back: boolean): void => {
      if (faces[0]) faces[0].style.visibility = back ? 'hidden' : 'visible';
      if (faces[1]) faces[1].style.visibility = back ? 'visible' : 'hidden';
    };
    if (faces.length > 0) show(!target);
    const swap = (): void => {
      el.toggleAttribute('data-fx-flipped', target);
      if (typeof label === 'string') el.setAttribute('data-fx-label', label);
      if (faces.length > 0) show(target);
    };
    if (call.step['squash'] === false) {
      swap();
      return undefined;
    }
    // K436: the turn's own `turnMs` and `turnDelay` (spec ms) inside the step, a `pivot` (transform-origin)
    const sc = call.dur / Math.max(1, Number(call.step.dur));
    const tm = call.step['turnMs'];
    const T = typeof tm === 'number' ? Math.min(tm * sc, call.dur) : call.dur;
    const D = typeof call.step['turnDelay'] === 'number' ? call.step['turnDelay'] * sc : 0;
    const turn = T === call.dur && D === 0 ? undefined : { duration: Math.max(T, 1), delay: D };
    const pivot = call.step['pivot'];
    const origin = typeof pivot === 'string' ? { transformOrigin: pivot } : {};
    const hm = call.step['holdMs'];
    const h = typeof hm === 'number' && T > 0 ? Math.min(Math.max(hm, 0), T * 0.8) : 0;
    const mid = D + h + (T - h) / 2;
    const timer = setTimeout(swap, mid);
    const vertical = call.step['axis'] === 'y';
    const direction = call.step['direction'];
    const own = callerFrames(call);
    if (own) animate(own[0], { transform: 'none', ...own[1] }, turn);
    else if (direction === 1 || direction === -1) {
      const perspective = typeof call.step['perspective'] === 'number' ? call.step['perspective'] : 800;
      const transform = (degrees: number) => `perspective(${perspective}px) rotate${vertical ? 'X' : 'Y'}(${degrees}deg)`;
      const ease = call.step['ease'];
      const easing = typeof ease === 'string' ? EASE[ease] ?? ease : 'ease-in-out';
      // K436: `eases` [first half, second half]; `overshoot` degrees past flat before it settles; `continuous`: one ease 0 to 180
      const eases = Array.isArray(call.step['eases']) ? (call.step['eases'] as unknown[]).map((e) => (typeof e === 'string' ? EASE[e] ?? e : easing)) : [];
      const [e1 = easing, e2 = easing] = eases;
      const over = typeof call.step['overshoot'] === 'number' ? call.step['overshoot'] : 0;
      const edge = T > 0 ? (mid - D) / T : .5;
      const o = edge + (1 - edge) * 0.8;
      animate(call.step['continuous'] === true ? [
        { transform: transform(0), easing, ...origin },
        ...(h > 0 ? [{ transform: transform(0), offset: h / T, easing, ...origin }] : []),
        { transform: transform(direction * 180), ...origin },
      ] : [
        { transform: transform(0), easing: e1, ...origin },
        ...(h > 0 ? [{ transform: transform(0), offset: h / T, easing: e1, ...origin }] : []),
        { transform: transform(direction * 90), offset: edge, ...origin },
        { transform: transform(-direction * 90), offset: edge, easing: e2, ...origin },
        ...(over ? [{ transform: transform(direction * over), offset: o, easing: 'ease-in-out', ...origin }] : []),
        { transform: transform(0), ...origin },
      ], { transform: call.step['continuous'] === true ? transform(direction * 180) : 'none' }, { easing: 'linear', ...turn });
    } else {
      const scale = vertical ? 'scaleY' : 'scaleX';
      const rest = { transform: `${scale}(1)`, ...origin };
      const edge = { transform: `${scale}(0)`, ...origin };
      animate(h > 0 ? [rest, { ...rest, offset: h / T }, { ...edge, offset: (mid - D) / T }, rest] : [rest, edge, rest], { transform: 'none' }, turn);
    }
    // K436: `scaleX` / `scaleY` curves (on `scale`), `glow` (a CSS box-shadow peaking edge-on), `filter` (CSS filters over the turn, or { frames, ms, delay, easing })
    const curves = scaleCurves(call);
    if (curves) animate(curves, { scale: lastScale(curves) }, { easing: 'linear' });
    const glow = call.step['glow'];
    if (typeof glow === 'string') {
      const k = T > 0 ? (mid - D) / T : .5;
      animate([{ boxShadow: 'none' }, { boxShadow: glow, offset: k }, { boxShadow: 'none' }], { boxShadow: el.style.boxShadow }, { easing: 'linear', ...turn });
    }
    const fl = call.step['filter'];
    const ff = Array.isArray(fl) ? { frames: fl as string[] } : fl && typeof fl === 'object' ? fl as { frames: string[]; ms?: number; delay?: number; easing?: string } : undefined;
    if (ff?.frames.length) {
      animate(ff.frames.map((filter) => ({ filter })), { filter: el.style.filter }, {
        ...(turn ?? {}), ...(ff.ms !== undefined ? { duration: Math.max(1, ff.ms * sc) } : {}), ...(ff.delay !== undefined ? { delay: ff.delay * sc } : {}),
        ...(ff.easing ? { easing: EASE[ff.easing] ?? ff.easing } : {}),
      });
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
    // K436: `latch: true` turns the glow on and keeps it at the end; a later glow step with `release: true` fades it out
    if (call.step['latch'] === true) {
      animate([{ boxShadow: off }, { boxShadow: on }], { boxShadow: on });
      return undefined;
    }
    if (call.step['release'] === true) {
      animate([{ boxShadow: el.style.boxShadow || on }, { boxShadow: off }], { boxShadow: '' });
      return undefined;
    }
    // K449: `end: 'dark'` starts lit and goes dark; the actor is left dark
    if (call.step['end'] === 'dark') {
      animate([{ boxShadow: on }, { boxShadow: off }], { boxShadow: off });
      return undefined;
    }
    const span = typeof hold === 'number' ? Math.max(0, Math.min(1, hold)) : 0;
    const pulse = span > 0
      ? [{ boxShadow: on, offset: (1 - span) / 2 }, { boxShadow: on, offset: (1 + span) / 2 }]
      : [{ boxShadow: on }];
    animate([{ boxShadow: off }, ...pulse, { boxShadow: off }], { boxShadow: el.style.boxShadow });
    return undefined;
  },
  unroll: (fx) => {
    const { call, el, animate } = fx;
    if (call.step['reverse'] === true) return unrollCollapse(fx);
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
    const colour = call.step['colour'];
    css(el, { color: typeof colour === 'string' ? colour : 'var(--fx-text,inherit)', font: 'var(--fx-text-font,inherit)' });
    const reveal = call.step['typewriter'];
    if (reveal === true || (reveal && typeof reveal === 'object')) {
      const settings = reveal === true ? {} : reveal as TypewriterSettings;
      el.style.textAlign = settings.textAlign ?? 'center';
      if (settings.rise !== false) animate([{ transform: rise }, { transform: 'none' }], { transform: 'none' });
      return typewriter(fx, settings);
    }
    el.style.textAlign = 'center';
    animate(call.step['rise'] === false ? [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1 }] : [{ opacity: 0, transform: rise }, { opacity: 1, offset: 0.25 }, { opacity: 1, transform: 'none' }], { opacity: '1', transform: 'none' });
    return undefined;
  },
  spin: rotate,
  tap: rotate,
  untap: rotate,
};

/** K506: old effect ids, each still registered beside its new id and playing the same verb; never removed. */
export const OLD_IDS: Readonly<Record<string, string>> = { 'multi-stop-path': 'round-trip', 'collapse-jump': 'flash-jump', 'warp-transfer': 'light-teleport', 'radial-streaks': 'streak-burst', 'column-beam': 'light-pillar', 'rotating-beam': 'radar-sweep', 'dissolve': 'burn-away', 'motes': 'particles-rise', 'reticle': 'target-brackets', 'sheen': 'light-sweep' };

/** The built-in verbs registered, and a layer made. Pass the registry to the motion player and the layer as its `context`. */
export function registerEffects(verbs: VerbRegistry<EffectCtx>, o?: LayerOptions): EffectLayer {
  const own = Object.values(OLD_IDS).flatMap((id) => { const v = verbs.get(id); return v ? [[id, v] as const] : []; });
  for (const [name, fx] of Object.entries(BUILT_IN)) registerEffect(verbs, name, fx);
  registerCanvasEffect(verbs, 'trail', trail);
  registerCanvasEffect(verbs, 'streak-burst', radialStreaks);
  registerCanvasEffect(verbs, 'light-pillar', curvedBeam);
  const curve = verbs.get('light-pillar');
  registerEffect(verbs, 'light-pillar', columnBeam);
  const column = verbs.get('light-pillar');
  verbs.register('light-pillar', (call, run) => (call.step['curve'] ? curve : column)?.(call, run));
  registerEffect(verbs, 'flash-jump', collapseJump);
  registerEffect(verbs, 'count', count);
  registerEffect(verbs, 'banner', banner);
  registerEffect(verbs, 'radar-sweep', rotatingBeam);
  registerEffect(verbs, 'projectile', projectile);
  const beam = verbs.get('projectile');
  registerCanvasEffect(verbs, 'projectile', bolt);
  const shot = verbs.get('projectile');
  verbs.register('projectile', (call, run) => (call.step['bolt'] ? shot : beam)?.(call, run));
  registerCanvasEffect(verbs, 'burn-away', dissolveSmoke);
  const smoke = verbs.get('burn-away');
  registerEffect(verbs, 'burn-away', dissolve);
  const burn = verbs.get('burn-away');
  verbs.register('burn-away', (call, run) => {
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
  registerCanvasEffect(verbs, 'light-teleport', spiralTransfer);
  const spiral = verbs.get('light-teleport');
  registerEffect(verbs, 'light-teleport', warpTransfer);
  const transfer = verbs.get('light-teleport');
  verbs.register('light-teleport', (call, run) => (call.step['spiral'] ? spiral : transfer)?.(call, run));
  verbs.register('shake-group', (call, run) => {
    const { selector, actors, amplitude = 6, crossAmplitude = 1, frames = 9 } = call.step;
    const targets = typeof selector === 'string'
      ? Array.from(run.context.el.ownerDocument.querySelectorAll<HTMLElement>(selector))
      : [
        ...run.timeline.actors.filter((a) => Array.isArray(actors) ? actors.includes(a.id) : a.id === call.actor).map((a) => run.context.actor(run, a.id, a.rect)),
        ...(Array.isArray(actors) ? actors.filter((id): id is string => typeof id === 'string' && !run.timeline.actors.some((a) => a.id === id)).map((id) => run.context.actor(run, id, call.from)) : []),
      ];
    const animations = targets.map((el, n) => el.animate(Array.from({ length: typeof frames === 'number' ? frames : 9 }, (_, j) => ({
      transform: `translate(${String((j % 2 ? 1 : -1) * Number(amplitude))}px,${String(((j + n) % 3 - 1) * Number(crossAmplitude))}px)`,
    })), { duration: Math.max(call.dur, 1) }));
    return () => animations.forEach((a) => a.cancel());
  });
  registerEffect(verbs, 'stamp', stamp);
  registerEffect(verbs, 'particles-rise', motes);
  registerEffect(verbs, 'flicker', flicker);
  registerEffect(verbs, 'bar-fill', barFill);
  registerEffect(verbs, 'refresh', refresh);
  registerEffect(verbs, 'pulse', pulseEffect);
  registerEffect(verbs, 'idle', idle);
  registerDashLine(verbs, o?.resolve, o?.stage);
  registerCanvasEffect(verbs, 'target-brackets', reticle);
  registerEffect(verbs, 'debris', debrisDom);
  const pieces = verbs.get('debris');
  registerCanvasEffect(verbs, 'debris', debris);
  const pixels = verbs.get('debris');
  verbs.register('debris', (call, run) => (call.step['dom'] ? pieces : pixels)?.(call, run));
  registerEffect(verbs, 'light-sweep', sheen);
  registerEffect(verbs, 'fizzle', fizzle);
  registerEffect(verbs, 'spark-burst', sparkBurst);
  registerCanvasEffect(verbs, 'slash', slash);
  registerCrumple(verbs);
  // K506: an old id plays the kit's verb as before (last registration wins); a game's own verb under a new id, registered before, is kept
  for (const [old, id] of Object.entries(OLD_IDS)) verbs.register(old, verbs.get(id)!);
  for (const [id, v] of own) verbs.register(id, v);
  return createEffectLayer(o);
}

/** K511: every verb name `registerEffects` registers (new ids and old ids), sorted; for `validateSpecs(specs, stages, [...EFFECT_NAMES, ...gameVerbs])`. A test keeps it equal to the registry. */
export const EFFECT_NAMES: readonly string[] = ['arc-move', 'banner', 'bar-fill', 'burn-away', 'collapse-jump', 'column-beam', 'count', 'crumple', 'dash-line', 'debris', 'dissolve', 'fade-in', 'fade-out', 'fizzle', 'flash-jump', 'flicker', 'flip', 'glow', 'hide', 'idle', 'lift', 'light-pillar', 'light-sweep', 'light-teleport', 'motes', 'move', 'multi-stop-path', 'particles-rise', 'projectile', 'pulse', 'radar-sweep', 'radial-streaks', 'refresh', 'reticle', 'ring-pulse', 'rotating-beam', 'round-trip', 'scale', 'settle', 'shake', 'shake-group', 'shatter', 'sheen', 'shield-bubble', 'shimmer', 'show', 'slash', 'spark-burst', 'spin', 'stamp', 'streak-burst', 'tap', 'target-brackets', 'text', 'trail', 'unroll', 'untap', 'warp-transfer'];
