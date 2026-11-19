import type { Effect } from './effects.ts';

export interface StampSettings {
  text?: string;
  tilt?: number;
  image?: string;
  ms?: number;
  ease?: string;
  scales?: readonly [number, number, number];
  pressOffset?: number;
  style?: Partial<CSSStyleDeclaration>;
  frames?: readonly Keyframe[];
  press?: { ms: number; delay: number; ease?: string; frames: readonly Keyframe[] };
  ring?: { ms: number; delay: number; ease?: string; style: Partial<CSSStyleDeclaration>; frames: readonly Keyframe[] };
  /** K435-2: called once the label and ring are made (each also carries `data-fx-part`: `label`, `ring`) */
  onParts?: (parts: { label: HTMLElement; ring?: HTMLElement }) => void;
  /** K435-2: the ring stays at its last frame after the call ends; the game removes it */
  holdRing?: boolean;
  /** K435-2: the ring's z-index (default the label's), so drops can draw between ring and label */
  ringZ?: number | string;
  /** K435-9: stamps this existing element (or the first match of a selector in the actor, else the page) instead of a new label: no default look, never removed */
  target?: HTMLElement | string;
}

/** A pressed label can ride on the same stand-in during subsequent steps. */
export const stamp: Effect = ({ el, call }) => {
  const { text = '', tilt = 0, image, ms, ease = 'ease-in', scales = [2.2, 0.95, 1], pressOffset = 0.8, style, frames, press, ring, onParts, holdRing, ringZ, target } = call.step as StampSettings;
  const found = typeof target === 'string' ? el.querySelector<HTMLElement>(target) ?? el.ownerDocument.querySelector<HTMLElement>(target) : target;
  const tag = found ?? el.ownerDocument.createElement(image === undefined ? 'div' : 'img');
  if (found) Object.assign(tag.style, style);
  else {
    if (tag instanceof HTMLImageElement && image !== undefined) {
      tag.src = image;
      tag.alt = text;
    } else tag.textContent = text;
    Object.assign(tag.style, {
      position: 'absolute', left: '8%', top: '42%', width: '84%', height: '16%',
      display: 'grid', placeItems: 'center', boxSizing: 'border-box',
      border: '2px solid currentColor', background: '#222', color: '#fff',
      font: '700 1rem system-ui', pointerEvents: 'none',
    }, style);
    el.append(tag);
  }
  tag.dataset['fxPart'] = 'label';
  const rot = `rotate(${String(tilt)}deg)`;
  const keys = frames ?? [
    { transform: `${rot} scale(${String(scales[0])})`, opacity: 0 },
    { transform: `${rot} scale(${String(scales[1])})`, opacity: 1, offset: pressOffset },
    { transform: `${rot} scale(${String(scales[2])})`, opacity: 1 },
  ];
  const end = keys.at(-1);
  const scale = call.dur / Number(call.step['dur'] ?? call.dur);
  const animation = tag.animate([...keys], { duration: ms === undefined ? call.dur : ms * scale, easing: ease, fill: 'both' });
  const accent = (node: HTMLElement, part: NonNullable<StampSettings['press']>, composite: CompositeOperation): Animation =>
    node.animate([...part.frames], { delay: part.delay * scale, duration: part.ms * scale, fill: 'none', easing: part.ease ?? 'linear', composite });
  const give = press && accent(el, press, 'add');
  let halo: HTMLElement | undefined;
  let glint: Animation | undefined;
  if (ring) {
    halo = el.ownerDocument.createElement('div');
    Object.assign(halo.style, {
      zIndex: ringZ === undefined ? tag.style.zIndex : String(ringZ), position: 'absolute', left: tag.style.left, top: tag.style.top, width: tag.style.width, height: tag.style.height,
      boxSizing: 'border-box', borderRadius: '50%', opacity: '0',
    }, ring.style);
    halo.dataset['fxPart'] = 'ring';
    tag.before(halo);
    glint = accent(halo, ring, 'replace');
  }
  onParts?.(halo ? { label: tag, ring: halo } : { label: tag });
  return () => {
    if (end?.transform !== undefined) tag.style.transform = String(end.transform);
    if (end?.opacity !== undefined) tag.style.opacity = String(end.opacity);
    if (end?.filter !== undefined) tag.style.filter = String(end.filter);
    animation.cancel();
    give?.cancel();
    glint?.cancel();
    if (holdRing && halo && ring) Object.assign(halo.style, Object.fromEntries(Object.entries(ring.frames.at(-1) ?? {}).filter(([k]) => k !== 'offset' && k !== 'easing' && k !== 'composite').map(([k, v]) => [k, String(v)])));
    else halo?.remove();
    if (!found && tag.style.opacity === '0') tag.remove();
  };
};
