// K396: the frame loop and bent card surface the top-view and side-view riffles share. Ported from the approved riffle study
// (game-kit branch riffle-preview 610c8d6, tuners/src/riffle-surface.mjs).
export const ease = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
export const phase = (time: number, length: number): number => length > 0 ? Math.max(0, Math.min(1, time / length)) : Number(time >= 0);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const active = new WeakMap<HTMLElement, () => void>();
export interface PileMotion { done: Promise<void>; finish?: () => void }
export type PileSetup = (layer: HTMLElement, rect: DOMRect, top: HTMLElement) => (time: number) => void;
export function animatePile(deck: HTMLElement, { speed, durations, tag = 'div', trackPosition = true }: { speed: number; durations: readonly number[]; tag?: string; trackPosition?: boolean }, setup: PileSetup): PileMotion {
  active.get(deck)?.();
  const top = (deck.lastElementChild as HTMLElement | null) ?? deck;
  const rect = top.getBoundingClientRect();
  const view = deck.ownerDocument.defaultView!;
  const total = durations.reduce((sum, phase2) => sum + phase2, 0);
  if (!(speed > 0 && total > 0 && rect.width && rect.height) || (typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches)) return { done: Promise.resolve() };
  const layer = deck.ownerDocument.createElement(tag);
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset['riffleMotion'] = deck.dataset['pile'] ?? '';
  Object.assign(layer.style, { position: 'fixed', pointerEvents: 'none', zIndex: '1000' });
  const draw = setup(layer, rect, top);
  const visibility = deck.style.getPropertyValue('visibility');
  const priority = deck.style.getPropertyPriority('visibility');
  let frame = 0;
  let resolve!: () => void;
  const done = new Promise<void>((finish2) => {
    resolve = finish2;
  });
  const finish = () => {
    if (active.get(deck) !== finish) return;
    view.cancelAnimationFrame(frame);
    if (!trackPosition) {
      view.removeEventListener('resize', invalidatePosition);
      view.removeEventListener('scroll', invalidatePosition, true);
    }
    layer.remove();
    deck.style.setProperty('visibility', visibility, priority);
    if (deck.getAttribute('style') === '') deck.removeAttribute('style');
    active.delete(deck);
    resolve();
  };
  let positioned = false;
  function invalidatePosition() {
    positioned = false;
  }
  function tick(now: number) {
    const elapsed = (now - start) * speed / 1e3;
    const current = trackPosition || !positioned ? top.getBoundingClientRect() : rect;
    if (elapsed >= total || !deck.isConnected || current.width !== rect.width || current.height !== rect.height) {
      finish();
      return;
    }
    if (trackPosition || !positioned) {
      layer.style.left = `${String(current.left + current.width / 2)}px`;
      layer.style.top = `${String(current.top + current.height / 2)}px`;
      positioned = true;
    }
    draw(elapsed);
    frame = view.requestAnimationFrame(tick);
  }
  const start = view.performance.now();
  deck.ownerDocument.body.append(layer);
  deck.style.setProperty('visibility', 'hidden', 'important');
  active.set(deck, finish);
  if (!trackPosition) {
    view.addEventListener('resize', invalidatePosition);
    view.addEventListener('scroll', invalidatePosition, true);
  }
  tick(start);
  return { done, finish };
}
export function cloneBack(el: HTMLElement): HTMLElement {
  const face = el.cloneNode(false) as HTMLElement;
  face.removeAttribute('id');
  face.removeAttribute('data-pile');
  return face;
}
export function makeSurface(layer: HTMLElement, top: HTMLElement, back: (top: HTMLElement) => HTMLElement, width: number, height: number, segments: number): { card: HTMLElement; strips: HTMLElement[]; step: number } {
  const card = layer.ownerDocument.createElement('div');
  card.style.position = 'absolute';
  const step = width / segments;
  const strips = Array.from({ length: segments }, (_, index) => {
    const strip = layer.ownerDocument.createElement('div');
    Object.assign(strip.style, {
      position: 'absolute',
      top: `${String(-height / 2)}px`,
      overflow: 'hidden',
      width: `${String(step + (index === segments - 1 ? 0 : 0.35))}px`,
      height: `${String(height)}px`,
      transformOrigin: 'left center',
      outline: '1px solid transparent',
    });
    const face = back(top);
    Object.assign(face.style, {
      position: 'absolute',
      boxSizing: 'border-box',
      left: `${String(-index * step)}px`,
      top: '0',
      width: `${String(width)}px`,
      height: `${String(height)}px`,
      margin: '0',
    });
    strip.append(face);
    card.append(strip);
    return strip;
  });
  layer.append(card);
  return { card, strips, step };
}
