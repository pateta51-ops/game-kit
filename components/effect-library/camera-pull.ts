import { ease, seg } from './particles.ts';

export interface CameraPullSettings {
  scale?: number;
  origin?: string;
  pullMs?: number;
  dim?: number;
  dimMs?: number;
  dimBackground?: string;
  releaseMs?: number;
  speed?: number | 'instant';
  /** K436: a cut (the returned function) still eases back over `releaseMs`, so the dim eases out (default it ends at once) */
  easeOnCut?: boolean;
}

export interface CameraPushSettings {
  scale?: number;
  enter?: number;
  exit?: number;
  speed?: number | 'instant';
}

export function cameraScaleAt(t: number, at: number, end: number, { scale = 1.05, enter = 400, exit = 250, speed = 1 }: CameraPushSettings = {}): number {
  if (speed === 0 || speed === 'instant') return 1;
  return 1 + (scale - 1) * ease.inOut(seg(t, at, at + enter)) * (1 - ease.inOut(seg(t, end - exit, end)));
}

export function cameraPush(root: HTMLElement, onChange?: (scale: number) => void, { speed = 1 }: Pick<CameraPushSettings, 'speed'> = {}) {
  const { transform, transformOrigin } = root.style;
  const end = (): void => {
    Object.assign(root.style, { transform, transformOrigin });
    onChange?.(1);
  };
  const instant = speed === 0 || speed === 'instant';
  if (instant) onChange?.(1);
  return {
    frame(scale: number, focus: readonly [number, number] | null, [dx, dy]: readonly [number, number] = [0, 0]) {
      if (instant) return;
      if (focus === null || !Number.isFinite(scale) || (scale === 1 && dx === 0 && dy === 0)) {
        end();
        return;
      }
      root.style.transformOrigin = `${String(focus[0] - root.scrollLeft)}px ${String(focus[1] - root.scrollTop)}px`;
      const offset = dx === 0 && dy === 0 ? '' : `translate(${String(dx)}px,${String(dy)}px) `;
      root.style.transform = `${offset}scale(${String(scale)})`;
      onChange?.(scale);
    },
    end: instant ? () => {} : end,
  };
}

export function cameraPull(root: HTMLElement, overlay: HTMLElement, {
  scale = 0.95, origin = 'center', pullMs = 2000, dim = 0.5, dimMs = pullMs / 2,
  dimBackground = '#000', releaseMs = 400, speed = 1, easeOnCut = false,
}: CameraPullSettings = {}): (() => void) & { dimmed: Promise<void>; release: () => Promise<void> } {
  if (speed === 0 || speed === 'instant') {
    const done = Promise.resolve();
    return Object.assign(() => {}, { dimmed: done, release: () => done });
  }
  const original = root.style.transformOrigin;
  const shade = overlay.ownerDocument.createElement('div');
  Object.assign(shade.style, { position: 'absolute', inset: '0', pointerEvents: 'none', background: dimBackground });
  overlay.append(shade);
  root.style.transformOrigin = origin;
  const scaled = `scale(${String(scale)})`;
  const animations: Animation[] = [];
  let release: Promise<void> | undefined;
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    animations.forEach((animation) => animation.cancel());
    root.style.transformOrigin = original;
    shade.remove();
  };
  const play = (el: HTMLElement, frames: Keyframe[], ms: number, easing: string): Promise<void> => {
    try {
      const animation = el.animate(frames, { duration: ms * speed, easing, fill: 'both' });
      animations.push(animation);
      return animation.finished.then(() => undefined, () => undefined);
    } catch (error) {
      end();
      throw error;
    }
  };
  void play(root, [{ transform: 'scale(1)' }, { transform: scaled }], pullMs, 'ease-in-out');
  const dimmed = play(shade, [{ opacity: 0 }, { opacity: dim }], dimMs, 'ease-in');
  const back = (): Promise<void> => {
    if (ended) return Promise.resolve();
    if (release) return release;
    const from = (el: HTMLElement, prop: 'transform' | 'opacity', fallback: string): string => (easeOnCut ? getComputedStyle(el)[prop] : '') || fallback;
    const returning = [
      play(root, [{ transform: from(root, 'transform', scaled) }, { transform: 'scale(1)' }], releaseMs, 'ease-out'),
      play(shade, [{ opacity: from(shade, 'opacity', String(dim)) }, { opacity: 0 }], releaseMs, 'ease-out'),
    ];
    release = Promise.all(returning).then(end);
    return release;
  };
  return Object.assign(easeOnCut ? () => void back() : end, { dimmed, release: back });
}
