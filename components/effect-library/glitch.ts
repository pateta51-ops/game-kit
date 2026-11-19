// Glitch: a broadcast-style burst and tear on a wordmark. Look in looks/glitch.css; timers exist only while motion is on.
import type { Speed } from '../motion-frame/index.ts';
import { rng } from './particles.ts';

export interface GlitchOptions {
  speed: () => Speed;
  /** seed for slice positions and the idle schedule; default: random */
  seed?: number;
  /** CSS value for `--glitch-mask`, e.g. `url(logo.svg)`: the shape the colour copies and slices are cut to */
  mask?: string;
  /** CSS colours of the two copies (`--glitch-a`, `--glitch-b`) */
  colours?: [string, string];
  /** slice count, default 3 */
  slices?: number;
  /** still time between bursts in ms, [min, max], default [3500, 7000] */
  idleMs?: [number, number];
  /** default 200 */
  burstMs?: number;
  /** default 600 */
  tearMs?: number;
  /** opacity at the dropout frame, default .3 (`--glitch-dropout`) */
  dropout?: number;
  /** chance a burst repeats once, default .25 */
  repeat?: number;
  /** gap before the repeat in ms, [min, max], default [100, 140] */
  repeatGapMs?: [number, number];
  /** colour-copy offset as % of width (`--glitch-split`), default .6 */
  split?: number;
  /** slice jump in % of width (`--glitch-jump`), default 2.4 */
  jump?: number;
}
export interface Glitch {
  burst(): void;
  tear(): void;
  /** re-reads `speed()`: call it when the settings change; restarts the idle bursts when motion is back */
  update(): void;
  destroy(): void;
}

export function createGlitch(el: HTMLElement, o: GlitchOptions): Glitch {
  const rand = rng(o.seed ?? Math.floor(Math.random() * 4294967296));
  const between = (r: [number, number]): number => r[0] + rand() * (r[1] - r[0]);
  const idle = o.idleMs ?? [3500, 7000];
  const gap = o.repeatGapMs ?? [100, 140];
  const ms = { burst: o.burstMs ?? 200, tear: o.tearMs ?? 600 };
  const set = (k: string, v: string | number): void => el.style.setProperty(k, String(v));
  el.classList.add('fx-glitch');
  if (o.mask) set('--glitch-mask', o.mask);
  if (o.colours) {
    set('--glitch-a', o.colours[0]);
    set('--glitch-b', o.colours[1]);
  }
  if (o.dropout !== undefined) set('--glitch-dropout', o.dropout);
  if (o.split !== undefined) set('--glitch-split', `${String(o.split)}%`);
  if (o.jump !== undefined) set('--glitch-jump', o.jump);
  const slices: HTMLElement[] = [];
  for (let i = 0; i < (o.slices ?? 3); i++) {
    const s = document.createElement('i');
    s.className = 'fx-glitch-slice';
    s.setAttribute('aria-hidden', 'true');
    el.appendChild(s);
    slices.push(s);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;
  const factor = (): number => {
    const s = o.speed();
    return typeof s === 'number' && s > 0 ? s : 0;
  };
  const stop = (): void => {
    clearTimeout(timer);
    clearTimeout(endTimer);
    timer = endTimer = undefined;
  };
  const clearClasses = (): void => el.classList.remove('fx-glitch--burst', 'fx-glitch--tear');
  function schedule(): void {
    const f = factor();
    if (dead || !f) return;
    timer = setTimeout(() => play('burst', rand() < (o.repeat ?? 0.25)), between(idle) * f);
  }
  function play(kind: 'burst' | 'tear', again: boolean): void {
    const f = factor();
    if (dead || !f) return;
    stop();
    clearClasses();
    for (const s of slices) {
      const top = rand() * 72;
      const h = 8 + rand() * 18;
      s.style.setProperty('--top', `${String(top)}%`);
      s.style.setProperty('--bottom', `${String(100 - top - h)}%`);
      s.style.setProperty('--jump', String((rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 0.8)));
    }
    set('--glitch-ms', `${String(ms[kind] * f)}ms`);
    void el.offsetWidth;
    el.classList.add(`fx-glitch--${kind}`);
    endTimer = setTimeout(() => {
      endTimer = undefined;
      clearClasses();
      if (again) timer = setTimeout(() => play('burst', false), between(gap) * f);
      else schedule();
    }, ms[kind] * f);
  }
  function update(): void {
    if (dead) return;
    if (!factor()) {
      stop();
      clearClasses();
    } else if (!timer && !endTimer) schedule();
  }
  update();
  return {
    burst: () => play('burst', false),
    tear: () => play('tear', false),
    update,
    destroy() {
      dead = true;
      stop();
      clearClasses();
      el.classList.remove('fx-glitch');
      for (const s of slices) s.remove();
    },
  };
}
