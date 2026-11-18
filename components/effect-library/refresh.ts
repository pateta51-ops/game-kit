import type { Effect } from './effects.ts';
import { decorativeCopy } from './layer.ts';

export interface RefreshSettings {
  banner?: string;
  filter?: string;
  face?: string;
  liftMs?: number;
  drainMs?: number;
  drainAt?: number;
  liftEase?: string;
  drainEase?: string;
  liftMiddle?: number;
  liftRise?: readonly [number, number];
  liftScale?: readonly [number, number];
  textShadow?: readonly [string, string];
  lineBackground?: string;
  lineShadow?: string;
  lineRadius?: string;
  lineHeight?: number;
  lineMinHeight?: number;
  lineFade?: readonly [number, number];
}

export const refresh: Effect = ({ call, el }) => {
  const {
    banner, face, filter = 'grayscale(1)', liftMs = 500, drainMs = 400, drainAt = 0.25,
    liftEase = 'ease-out', drainEase = 'ease-in-out', liftMiddle = 0.35,
    liftRise = [0.08, 0.2], liftScale = [1.06, 1.12], textShadow,
    lineBackground = '#e0e0e0', lineShadow = 'none', lineRadius = '0',
    lineHeight = 0.01, lineMinHeight = 1, lineFade = [0.12, 0.85],
  } = call.step as RefreshSettings;
  const tag = banner === undefined ? null : el.querySelector<HTMLElement>(banner);
  if (typeof el.animate !== 'function' || el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    tag?.remove();
    return undefined;
  }
  const overflow = ['overflow', 'overflow-x', 'overflow-y'].map((name) => ({
    name, value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name),
  }));
  const radius = el.ownerDocument.defaultView?.getComputedStyle(el).borderRadius ?? '';
  el.style.overflow = 'visible';
  const px = (n: number): string => `${String(n)}px`;
  const h = call.from[3];
  const factor = call.dur / Math.max(1, call.step.dur);
  const delay = tag === null ? 0 : liftMs * drainAt * factor;
  const animations: Animation[] = [];
  const overlay = el.ownerDocument.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.inert = true;
  Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  const grey = el.ownerDocument.createElement('div');
  const cardBox = { position: 'absolute', inset: '0', borderRadius: radius, overflow: 'hidden' };
  Object.assign(grey.style, cardBox);
  if (face === undefined) {
    const surface = decorativeCopy(el, false);
    Object.assign(surface.style, { ...cardBox, width: '100%', height: '100%', boxShadow: 'none', filter });
    grey.append(surface);
  } else {
    for (const target of el.querySelectorAll<HTMLElement>(face)) {
      if (tag?.contains(target)) continue;
      const copy = decorativeCopy(target);
      if (banner !== undefined) copy.querySelector(banner)?.remove();
      copy.style.filter = filter;
      grey.append(copy);
    }
  }
  const line = el.ownerDocument.createElement('div');
  Object.assign(line.style, {
    position: 'absolute', top: '100%', width: '100%', height: px(Math.max(lineMinHeight, h * lineHeight)),
    background: lineBackground, boxShadow: lineShadow, borderRadius: lineRadius, zIndex: '2',
  });
  overlay.append(grey);
  overlay.append(line);
  el.append(overlay);
  const finish = (): void => {
    animations.forEach((a) => a.cancel());
    tag?.remove();
    overlay.remove();
    el.style.removeProperty('overflow');
    for (const { name, value, priority } of overflow) {
      if (value) el.style.setProperty(name, value, priority);
    }
  };
  const play = (target: Element, frames: Keyframe[], duration: number, easing: string, delay = 0): void => {
    animations.push(target.animate(frames, { duration, easing, delay, fill: 'both' }));
  };
  if (tag !== null) {
    const lift = el.ownerDocument.createElement('div');
    Object.assign(lift.style, { ...cardBox, zIndex: '1' });
    const copy = decorativeCopy(tag);
    lift.append(copy);
    overlay.insertBefore(lift, line);
    tag.style.visibility = 'hidden';
    copy.style.overflow = 'visible';
    play(lift, [
      { overflow: 'visible', translate: '0 0', scale: '1', opacity: 1 },
      { overflow: 'visible', translate: `0 ${px(-h * liftRise[0])}`, scale: String(liftScale[0]), opacity: 1, offset: liftMiddle },
      { overflow: 'visible', translate: `0 ${px(-h * liftRise[1])}`, scale: String(liftScale[1]), opacity: 0 },
    ], liftMs * factor, liftEase);
    if (textShadow && copy.firstElementChild) {
      play(copy.firstElementChild, textShadow.map((value) => ({ textShadow: value })), liftMs * factor, 'linear');
    }
  }
  play(grey, [{ clipPath: 'inset(0 0 0% 0)' }, { clipPath: 'inset(0 0 100% 0)' }], drainMs * factor, drainEase, delay);
  play(line, [
    { translate: '0 0', opacity: 0 },
    { opacity: 1, offset: lineFade[0] },
    { opacity: 1, offset: lineFade[1] },
    { translate: `0 ${px(-h)}`, opacity: 0 },
  ], drainMs * factor, drainEase, delay);
  return finish;
};
