import { LIGHT_MS, SPARKS, SPARK_MS, sparkFlight } from './ups.ts';

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const stand = (part: string, css: Partial<CSSStyleDeclaration>): HTMLElement => {
  const el = document.createElement('span');
  el.dataset['part'] = part;
  Object.assign(el.style, { position: 'fixed', pointerEvents: 'none', ...css });
  document.body.append(el);
  return el;
};

const run = (el: HTMLElement, frames: Keyframe[], o: KeyframeAnimationOptions, live: HTMLElement[]): Promise<void> => {
  live.push(el);
  if (typeof el.animate !== 'function') return Promise.resolve();
  return el.animate(frames, o).finished.then(() => undefined, () => undefined);
};

/**
 * The extras of a landing, as fixed `span`s on the body that the game styles (`[data-part=spark]`, `[data-part=light]`; the colour is the
 * game's `color`, read from `of`): `SPARKS` sparks fly out of `at` and fade, and a soft light shows behind `at` for 520 ms. `scale` is the speed.
 * Returns the elements (so a cancel can remove them) and a promise that resolves when all have ended.
 */
export function landingEffects(at: HTMLElement, scale: number, o: { sparks?: boolean; light?: boolean } = {}): { done: Promise<void>; els: HTMLElement[] } {
  const b = at.getBoundingClientRect();
  const colour = getComputedStyle(at).color;
  const els: HTMLElement[] = [];
  const all: Promise<void>[] = [];
  if (o.light !== false) {
    const w = b.width * 1.6;
    const h = b.height * 1.4;
    const l = stand('light', { left: `${String(b.x + b.width / 2 - w / 2)}px`, top: `${String(b.y + b.height / 2 - h / 2)}px`, width: `${String(w)}px`, height: `${String(h)}px`, borderRadius: '50%', mixBlendMode: 'screen', background: `radial-gradient(ellipse at 50% 50%, ${colour}, transparent 70%)`, opacity: '0', zIndex: '41' });
    all.push(run(l, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1)' }], { duration: LIGHT_MS * scale, easing: 'ease-out', fill: 'forwards' }, els));
  }
  if (o.sparks) {
    const size = Math.max(4, b.height * 0.16);
    for (let k = 0; k < SPARKS; k += 1) {
      const f = sparkFlight(k, b.width * 2.4);
      const s = stand('spark', { left: `${String(b.x + b.width / 2 - size / 2)}px`, top: `${String(b.y + b.height / 2 - size / 2)}px`, width: `${String(size)}px`, height: `${String(size)}px`, borderRadius: '50%', background: colour, boxShadow: `0 0 ${String(size)}px ${colour}`, zIndex: '81' });
      all.push(run(s, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${String(f.dx)}px, ${String(f.dy)}px) scale(0.2)`, opacity: 0 }], { duration: SPARK_MS * scale, easing: 'ease-out', fill: 'forwards' }, els));
    }
  }
  const done = Promise.all(all).then(() => {
    for (const e of els) e.remove();
  });
  return { done, els };
}
