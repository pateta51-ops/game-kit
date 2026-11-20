// Glitch: a broadcast-style burst and tear on a wordmark. Look in looks/glitch.css; timers exist only while motion is on.
import type { Speed } from '../motion-frame/index.ts';
import { GLITCH_DEFAULTS } from './defaults.ts';
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
  /** default 200; [min, max] draws each burst's length from the seed */
  burstMs?: number | [number, number];
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
  /** a burst is this many hard steps (or [min, max]); each re-draws slices, jumps and the split side; absent: the burst plays as the CSS keyframes */
  burstSteps?: number | [number, number];
  /** [min, max] slice jump in % of width, sign random; replaces `jump` x 0.6-1.4 */
  jumpRange?: [number, number];
  /** [min, max] degrees: one frame per burst is skewed by an angle in that range, sign random (stepped and plain bursts) */
  skewDeg?: [number, number];
  /** [min, max] letters: one frame per burst blanks that many letters of the text face (ignored with `mask`); restored on the next frame and at the burst's end */
  blankLetters?: [number, number];
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
  const idle = o.idleMs ?? GLITCH_DEFAULTS.idleMs;
  const gap = o.repeatGapMs ?? GLITCH_DEFAULTS.repeatGapMs;
  const bm = o.burstMs ?? GLITCH_DEFAULTS.burstMs;
  const ms = { burst: typeof bm === 'number' ? bm : 0, tear: o.tearMs ?? GLITCH_DEFAULTS.tearMs };
  const set = (k: string, v: string | number): void => el.style.setProperty(k, String(v));
  el.classList.add('fx-glitch');
  if (o.mask) set('--glitch-mask', o.mask);
  if (o.colours) {
    set('--glitch-a', o.colours[0]);
    set('--glitch-b', o.colours[1]);
  }
  if (o.dropout !== undefined) set('--glitch-dropout', o.dropout);
  if (o.split !== undefined) set('--glitch-split', `${String(o.split)}%`);
  if (o.jumpRange) set('--glitch-jump', 1);
  else if (o.jump !== undefined) set('--glitch-jump', o.jump);
  if (o.mask) el.classList.add('fx-glitch--masked');
  const face = Array.from(el.childNodes);
  const layer = (cls: string): HTMLElement => {
    const d = document.createElement('div');
    d.className = `fx-glitch-layer ${cls}`;
    d.setAttribute('aria-hidden', 'true');
    for (const n of face) d.appendChild(n.cloneNode(true));
    d.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    el.appendChild(d);
    return d;
  };
  const layers = [layer('fx-glitch-copy fx-glitch-copy--a'), layer('fx-glitch-copy fx-glitch-copy--b')];
  const slices: HTMLElement[] = [];
  for (let i = 0; i < (o.slices ?? GLITCH_DEFAULTS.slices); i++) slices.push(layer(`fx-glitch-slice${i % 2 ? ' fx-glitch-slice--b' : ''}`));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let steps: ReturnType<typeof setTimeout>[] = [];
  let dead = false;
  let blanked: [Text, string, string][] = [];
  const walk = (n: Node, out: Text[]): void => {
    if (n.nodeType === 3) out.push(n as Text);
    else n.childNodes.forEach((c) => walk(c, out));
  };
  const restore = (): void => {
    for (const [t, d, b] of blanked) if (t.data === b) t.data = d;
    blanked = [];
  };
  const blank = (count: number): void => {
    restore();
    const own = new Set<Node>([...layers, ...slices]);
    const texts: Text[] = [];
    Array.from(el.childNodes).filter((n) => !own.has(n)).forEach((n) => walk(n, texts));
    const chars = texts.map((t) => Array.from(t.data));
    const pos: [number, number][] = [];
    chars.forEach((cs, ti) => cs.forEach((c, i) => { if (/\S/.test(c)) pos.push([ti, i]); }));
    const hit = new Set<number>();
    for (let c = Math.min(count, pos.length); c > 0; c--) {
      const [ti, i] = pos.splice(Math.floor(rand() * pos.length), 1)[0] as [number, number];
      (chars[ti] as string[])[i] = '\u00a0';
      hit.add(ti);
    }
    for (const ti of hit) {
      const t = texts[ti] as Text;
      const nd = (chars[ti] as string[]).join('');
      blanked.push([t, t.data, nd]);
      t.data = nd;
    }
  };
  const angle = (): number => (rand() < 0.5 ? -1 : 1) * between(o.skewDeg as [number, number]);
  const factor = (): number => {
    const s = o.speed();
    return typeof s === 'number' && s > 0 ? s : 0;
  };
  const stop = (): void => {
    clearTimeout(timer);
    clearTimeout(endTimer);
    steps.forEach(clearTimeout);
    steps = [];
    restore();
    el.style.removeProperty('--glitch-skew');
    timer = endTimer = undefined;
  };
  const clearClasses = (): void => el.classList.remove('fx-glitch--burst', 'fx-glitch--tear', 'fx-glitch--steps', 'fx-glitch--drop', 'fx-glitch--skew');
  function schedule(): void {
    const f = factor();
    if (dead || !f) return;
    timer = setTimeout(() => play('burst', rand() < (o.repeat ?? GLITCH_DEFAULTS.repeat)), between(idle) * f);
  }
  function play(kind: 'burst' | 'tear', again: boolean): void {
    const f = factor();
    if (dead || !f) return;
    stop();
    clearClasses();
    const len = kind === 'burst' && typeof bm !== 'number' ? between(bm) : ms[kind];
    const stepped = kind === 'burst' && o.burstSteps !== undefined;
    const n = stepped ? Math.max(1, Math.round(typeof o.burstSteps === 'number' ? o.burstSteps : between(o.burstSteps as [number, number]))) : 0;
    const draw = (): void => {
      for (const s of slices) {
        const top = rand() * 72;
        const h = 8 + rand() * 18;
        s.style.setProperty('--top', `${String(top)}%`);
        s.style.setProperty('--bottom', `${String(100 - top - h)}%`);
        s.style.setProperty('--jump', String((rand() < 0.5 ? -1 : 1) * (o.jumpRange ? between(o.jumpRange) : 0.6 + rand() * 0.8)));
      }
    };
    draw();
    const doSkew = kind === 'burst' && !!o.skewDeg;
    const doBlank = kind === 'burst' && !!o.blankLetters && !o.mask;
    const total = stepped ? n : 4;
    const skewAt = doSkew ? (stepped ? Math.floor(rand() * n) : 1) : -1;
    if (doSkew) el.classList.add('fx-glitch--skew');
    if (doSkew && !stepped) set('--glitch-skew', `${String(angle())}deg`);
    const blankAt = doBlank ? Math.floor(rand() * total) : -1;
    const frame = (i: number): void => {
      if (doSkew && stepped) set('--glitch-skew', i === skewAt ? `${String(angle())}deg` : '0deg');
      if (i === blankAt) blank(Math.max(1, Math.round(between(o.blankLetters as [number, number]))));
      else if (i === blankAt + 1) restore();
    };
    set('--glitch-ms', `${String(len * f)}ms`);
    void el.offsetWidth;
    if (stepped) {
      const side = (): void => {
        set('--glitch-side', rand() < 0.5 ? -1 : 1);
        el.classList[rand() < 0.25 ? 'add' : 'remove']('fx-glitch--drop');
      };
      side();
      frame(0);
      el.classList.add('fx-glitch--steps');
      for (let i = 1; i < n; i++)
        steps.push(setTimeout(() => {
          draw();
          side();
          frame(i);
        }, (len * f * i) / n));
    } else {
      el.classList.add(`fx-glitch--${kind}`);
      if (doBlank) for (const i of [blankAt, blankAt + 1]) {
        if (i === 0) frame(0);
        else if (i < total) steps.push(setTimeout(() => frame(i), (len * f * i) / total));
      }
    }
    endTimer = setTimeout(() => {
      endTimer = undefined;
      clearClasses();
      restore();
      el.style.removeProperty('--glitch-skew');
      if (again) timer = setTimeout(() => play('burst', false), between(gap) * f);
      else schedule();
    }, len * f);
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
      for (const l of [...layers, ...slices]) l.remove();
    },
  };
}
