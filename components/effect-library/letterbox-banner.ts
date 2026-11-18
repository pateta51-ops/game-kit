import { ease, seg } from './particles.ts';

export interface LetterboxBannerSettings {
  speed?: number | 'instant';
  barHeight?: number;
  barBackground?: string;
  lineWidth?: number;
  lineColour?: string;
  vignetteColour?: string;
  vignetteBlur?: number;
  vignetteSpread?: number;
  text?: string;
  textStyle?: Partial<CSSStyleDeclaration>;
  enter?: number;
  exit?: number;
  textIn?: readonly [number, number];
  textOut?: readonly [number, number];
}

export function letterboxBanner(parent: HTMLElement, {
  speed = 1, barHeight = 40, barBackground = '#111', lineWidth = 0, lineColour = 'transparent',
  vignetteColour = '#0006', vignetteBlur = 160, vignetteSpread = 20,
  text = '', textStyle, enter = 250, exit = 250, textIn = [60, enter], textOut = [750, 1000],
}: LetterboxBannerSettings = {}): {
  frame(t: number, at: number, end: number, camera?: { scale: number; focus: readonly [number, number]; shake?: readonly [number, number] }): void;
  end(): void;
} {
  if (speed === 0 || speed === 'instant') return { frame: () => {}, end: () => {} };
  const box = (host: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLElement => {
    const el = host.ownerDocument.createElement('div');
    Object.assign(el.style, { position: 'absolute', left: '0', right: '0', pointerEvents: 'none' }, style);
    host.append(el);
    return el;
  };
  const hud = box(parent, { inset: '0', opacity: '0' });
  const vignette = box(hud, { inset: '0', boxShadow: `inset 0 0 ${String(vignetteBlur)}px ${String(vignetteSpread)}px ${vignetteColour}` });
  const height = `${String(barHeight)}px`;
  const top = box(hud, { top: '0', height, background: barBackground, boxShadow: `0 ${String(lineWidth)}px 0 ${lineColour}` });
  const bottom = box(hud, { bottom: '0', height, background: barBackground, boxShadow: `0 ${String(-lineWidth)}px 0 ${lineColour}` });
  const stamp = box(hud, { top: '0', height, display: 'grid', placeItems: 'center', color: '#fff', font: '700 1rem system-ui', ...textStyle });
  stamp.textContent = text.toUpperCase();
  return {
    frame(t, at, end, camera) {
      const k = ease.out(seg(t, at, at + enter)) * (1 - ease.inOut(seg(t, end - exit, end)));
      hud.style.opacity = k === 0 ? '0' : '1';
      top.style.transform = `translateY(${String(-(1 - k) * barHeight)}px)`;
      bottom.style.transform = `translateY(${String((1 - k) * barHeight)}px)`;
      vignette.style.opacity = String(k);
      stamp.style.opacity = String(seg(t, at + textIn[0], at + textIn[1]) * (1 - seg(t, at + textOut[0], at + textOut[1])) * k);
      const scale = camera?.scale ?? 1;
      const [dx, dy] = camera?.shake ?? [0, 0];
      hud.style.transformOrigin = camera ? `${String(camera.focus[0])}px ${String(camera.focus[1])}px` : '';
      hud.style.transform = scale === 1 && dx === 0 && dy === 0 ? '' :
        `translate(${String(-dx / scale)}px,${String(-dy / scale)}px) scale(${String(1 / scale)})`;
    },
    end: () => hud.remove(),
  };
}
