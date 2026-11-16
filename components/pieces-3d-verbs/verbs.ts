// The pieces' own `shake`, `flip`, `move` and `settle`, registered over the effect library's: a die tumbles or turns, the ball
// rolls by distance and rocks back to rest. Any other actor gets the library's verb.
import type { VerbRegistry } from '../motion-frame/index.ts';
import { BUILT_IN, registerEffect, type EffectCtx } from '../effect-library/index.ts';
import { offRest, paintBall, rolled, type BallLook } from '../pieces-3d/ball.ts';
import { ID, rotAxis, type M3 } from '../pieces-3d/solids.ts';

export interface PieceVerbOptions { ballLook?: () => BallLook | undefined; perTurn?: number }
/** True while the WebGL dice layer is on (`p3-gl` on <html>). */
export const dice3d = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('p3-gl');

export function registerPieceVerbs(verbs: VerbRegistry<EffectCtx>, o: PieceVerbOptions = {}): void {
  const look = () => o.ballLook?.();
  const dies = (el: HTMLElement) => (dice3d() ? [...el.querySelectorAll<HTMLElement>('[data-p3-die]')] : []);
  // an actor of class fx-two holds the old face and the new one; a tumble lands on the new one at once
  registerEffect(verbs, 'shake', (fx) => {
    const ds = dies(fx.el);
    if (!ds.length) return BUILT_IN['shake']?.(fx);
    if (fx.el.classList.contains('fx-two')) fx.el.setAttribute('data-fx-flipped', '');
    const t = performance.now(), seed = [...fx.call.actor].reduce((a, c) => a + c.charCodeAt(0), 0);
    ds.forEach((d) => { d.setAttribute('data-roll', `${String(t)},${String(fx.call.dur)},${String(seed)}`); });
    return () => { ds.forEach((d) => { d.removeAttribute('data-roll'); }); };
  });
  // the old face turns a quarter out, the new one a quarter in
  registerEffect(verbs, 'flip', (fx) => {
    const ds = dies(fx.el);
    if (!ds.length) return BUILT_IN['flip']?.(fx);
    if (fx.el.hasAttribute('data-fx-flipped') || !fx.el.classList.contains('fx-two')) return undefined;
    const t = performance.now(), on = () => { fx.el.setAttribute('data-fx-flipped', ''); };
    ds.forEach((d, i) => { d.setAttribute('data-turn', `${String(t)},${String(fx.call.dur)},${i ? 'in' : 'out'}`); });
    const timer = window.setTimeout(on, fx.call.dur / 2);
    return () => { clearTimeout(timer); on(); ds.forEach((d) => { d.removeAttribute('data-turn'); }); };
  });
  const turns = new WeakMap<HTMLCanvasElement, M3>();
  const play = (c: HTMLCanvasElement, dur: number, at: (p: number) => M3) => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => { const p = Math.min(1, (performance.now() - t0) / Math.max(1, dur)); paintBall(c, at(p), look()); if (p < 1) raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); paintBall(c, at(1), look()); };
  };
  const ball = (el: HTMLElement) => (el.matches('canvas[data-ball]') ? el as HTMLCanvasElement : el.querySelector<HTMLCanvasElement>('canvas[data-ball]'));
  // a roll, never a slide
  registerEffect(verbs, 'move', (fx) => {
    const end = BUILT_IN['move']?.(fx), c = ball(fx.el), t = fx.call.to, f = fx.call.from;
    if (!c || !t) return end;
    const size = fx.el.getBoundingClientRect().width || 110;
    const at = (p: number) => { const e = p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2; return rolled(ID, (t[0] - f[0]) * e, (t[1] - f[1]) * e, size, o.perTurn); };
    turns.set(c, at(1));
    const stop = play(c, fx.call.dur, at);
    return () => { stop(); end?.(); };
  });
  // a rock back to the rest view after a roll
  registerEffect(verbs, 'settle', (fx) => {
    const c = ball(fx.el), m = c ? turns.get(c) : undefined;
    if (!c || !m) return BUILT_IN['settle']?.(fx);
    const { axis, angle } = offRest(m);
    return play(c, fx.call.dur, (p) => rotAxis(axis, angle * (1 - p) ** 2 * Math.cos(1.5 * Math.PI * p)));
  });
}

/** For the effect layer's `onActor`: a clone's ball is painted again at rest, other canvases copied (the dice layer repaints its own). */
export const copyPieces = (look?: () => BallLook | undefined) => (src: HTMLElement, clone: HTMLElement): void => {
  const pick = (e: HTMLElement) => [e, ...e.querySelectorAll('canvas')].filter((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && !c.classList.contains('p3-die-gl'));
  const from = pick(src), to = pick(clone);
  to.forEach((c, i) => { const f = from[i]; if (c.hasAttribute('data-ball')) { if (f) { c.width = f.width; c.height = f.height; } paintBall(c, ID, look?.()); } else if (f && f.width && c.width) c.getContext('2d')?.drawImage(f, 0, 0); });
};
