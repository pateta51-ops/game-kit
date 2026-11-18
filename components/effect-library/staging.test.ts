// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cameraPull, cameraPush, cameraScaleAt, letterboxBanner, pileLift, plasmaOrbScale, driftPoseAt, drawPlasmaOrb, drawDriftCloud, syncDriftCloud } from './index.ts';

const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
afterEach(() => {
  if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

function target() {
  const el = document.createElement('div');
  const cancel = vi.fn();
  const animate = vi.fn<HTMLElement['animate']>().mockReturnValue({ cancel, finished: Promise.resolve() } as unknown as Animation);
  el.animate = animate;
  return { el, animate, cancel };
}

it('restores the camera and removes the dimmer on skip', () => {
  const { el, animate, cancel } = target();
  const overlay = document.createElement('div');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: target().animate });
  el.style.transformOrigin = 'top';
  const end = cameraPull(el, overlay, { scale: 0.96, dim: 0.55 });
  expect(animate.mock.calls[0]?.[0]).toEqual([{ transform: 'scale(1)' }, { transform: 'scale(0.96)' }]);
  end();
  expect(el.style.transformOrigin).toBe('top');
  expect(cancel).toHaveBeenCalledOnce();
  expect(overlay.childElementCount).toBe(0);
  expect(cameraScaleAt(1000, 0, 2000, { scale: 1.06 })).toBe(1.06);
  expect(cameraScaleAt(2000, 0, 2000, { scale: 1.06 })).toBe(1);
});

it('slides in the bars, fades the stamp and removes the overlay on skip', () => {
  const { el } = target();
  const banner = letterboxBanner(el, { barHeight: 20, text: 'Sample' });
  banner.frame(300, 0, 1500);
  expect(el.textContent).toBe('SAMPLE');
  expect(el.firstElementChild?.children[1]?.getAttribute('style')).toContain('translateY(0px)');
  banner.end();
  expect(el.childElementCount).toBe(0);
});

it('settles the pile and clears both animations when skipped', () => {
  const { el, animate, cancel } = target();
  const pile = pileLift(el, { scale: 1.04 });
  pile.settle();
  expect(animate.mock.calls[1]?.[0]).toMatchObject([{ scale: '1.04' }, { scale: '1' }]);
  pile.end();
  expect(cancel).toHaveBeenCalledTimes(2);
});

it('breathes at the configured period and adds the launch swell', () => {
  const settings = { pulsePeriod: 800, pulseAmount: 0.1, swell: 0.2 };
  expect(plasmaOrbScale(200, 1, settings)).toBeCloseTo(1.3);
  expect(plasmaOrbScale(800, 0, settings)).toBeCloseTo(1);
});

it('lets a retiring fragment finish its drift without starting another', () => {
  const piece = { triangle: 0, angle: 0, speed: 1, spin: 0, size: 10, offset: 200, ember: false };
  expect(driftPoseAt(piece, 199)).toBeNull();
  expect(driftPoseAt(piece, 450, 400)?.alpha).toBeGreaterThan(0);
  expect(driftPoseAt(piece, 1200, 400, { life: 1000 })).toBeNull();
});

it('draws the inactive orb as a steady ring and restores context', () => {
  const beginPath = vi.fn();
  const arc = vi.fn();
  const restore = vi.fn();
  const ctx = { save: vi.fn(), translate: vi.fn(), beginPath, arc, moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), restore } as unknown as CanvasRenderingContext2D;
  drawPlasmaOrb(ctx, 50, 60, 30, 1000, true, 1);
  expect(arc.mock.calls[0]?.[2]).toBeCloseTo(15);
  expect(beginPath).toHaveBeenCalledTimes(2);
  expect(restore).toHaveBeenCalledOnce();
});

it('drops removed cohorts and draws only the outline when empty', () => {
  const cohorts = syncDriftCloud([{ id: 'removed', born: 0 }], ['held'], new Set(['held']), 800, 1, false);
  expect(cohorts).toEqual([]);
  const art = vi.fn();
  const ellipse = vi.fn();
  const restore = vi.fn();
  const ctx = { save: vi.fn(), beginPath: vi.fn(), ellipse, moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    restore } as unknown as CanvasRenderingContext2D;
  expect(drawDriftCloud(ctx, { w: 150, h: 100, u: 1, now: 800, scale: 1, cohorts, art, empty: true })).toBe(0);
  expect(ellipse).toHaveBeenCalledOnce();
  expect(restore).toHaveBeenCalledOnce();
  expect(art).not.toHaveBeenCalled();
});

it('cues dimmed and releases both camera animations', async () => {
  const { el, animate, cancel } = target();
  const { animate: shadeAnimate, cancel: shadeCancel } = target();
  const overlay = document.createElement('div');
  let finishDim!: () => void;
  shadeAnimate.mockReturnValueOnce({ cancel: shadeCancel, finished: new Promise<void>((resolve) => {
    finishDim = resolve;
  }) } as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: shadeAnimate });
  const pull = cameraPull(el, overlay);
  const dimmed = vi.fn();
  void pull.dimmed.then(dimmed);
  await Promise.resolve();
  expect(dimmed).not.toHaveBeenCalled();
  finishDim();
  await pull.dimmed;
  expect(dimmed).toHaveBeenCalledOnce();
  const release = pull.release();
  expect(pull.release()).toBe(release);
  await release;
  expect(animate.mock.calls[1]?.[0]).toEqual([{ transform: 'scale(0.95)' }, { transform: 'scale(1)' }]);
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(shadeCancel).toHaveBeenCalledTimes(2);
  expect(overlay.childElementCount).toBe(0);
  expect(el.style.transformOrigin).toBe('');
});

it.each(['pull root', 'pull shade', 'release root', 'release shade'])('cleans up when animating the %s throws', (phase) => {
  const { el, animate, cancel } = target();
  const { animate: shadeAnimate, cancel: shadeCancel } = target();
  const overlay = document.createElement('div');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: shadeAnimate });
  el.style.transformOrigin = 'top';
  const pull = phase.startsWith('release') ? cameraPull(el, overlay) : undefined;
  const failing = phase.endsWith('shade') ? shadeAnimate : animate;
  failing.mockImplementationOnce(() => { throw new Error('animation failed'); });
  expect(() => pull ? pull.release() : cameraPull(el, overlay)).toThrow('animation failed');
  expect(overlay.childElementCount).toBe(0);
  expect(el.style.transformOrigin).toBe('top');
  expect(cancel).toHaveBeenCalledTimes({ 'pull root': 0, 'pull shade': 1, 'release root': 1, 'release shade': 2 }[phase]!);
  expect(shadeCancel).toHaveBeenCalledTimes(pull ? 1 : 0);
});

it('skips the camera pull and release at speed zero', async () => {
  const { el, animate } = target();
  const overlay = document.createElement('div');
  el.style.transformOrigin = 'top';
  const pull = cameraPull(el, overlay, { speed: 0 });
  expect(animate).not.toHaveBeenCalled();
  expect(overlay.childElementCount).toBe(0);
  expect(el.style.transformOrigin).toBe('top');
  await pull.dimmed;
  await pull.release();
  pull();
  expect(el.style.transformOrigin).toBe('top');
});

it.each([1, 0])('restores the camera push at speed %s', (speed) => {
  const { el } = target();
  const change = vi.fn();
  el.style.transform = 'rotate(3deg)';
  el.style.transformOrigin = 'top';
  const push = cameraPush(el, change, { speed });
  push.frame(1.1, [20, 30], [1, 2]);
  expect(el.style.transform).toBe(speed ? 'translate(1px,2px) scale(1.1)' : 'rotate(3deg)');
  push.end();
  expect(el.style.transform).toBe('rotate(3deg)');
  expect(el.style.transformOrigin).toBe('top');
  expect(change).toHaveBeenLastCalledWith(1);
});

it('leaves no letterbox HUD at speed zero', () => {
  const { el } = target();
  const banner = letterboxBanner(el, { speed: 0, text: 'Sample' });
  expect(el.childElementCount).toBe(0);
  banner.frame(300, 0, 1500);
  banner.end();
  expect(el.childElementCount).toBe(0);
});

it('cancels the lift when ended before settling', () => {
  const { el, animate, cancel } = target();
  const pile = pileLift(el);
  pile.end();
  expect(pile.settle()).toBeUndefined();
  pile.end();
  expect(animate).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});

it('lifts and settles immediately at speed zero', () => {
  const { el, animate } = target();
  el.style.scale = '0.9';
  const pile = pileLift(el, { speed: 0, scale: 1.1 });
  expect(el.style.scale).toBe('1.1');
  expect(pile.settle()).toBeUndefined();
  expect(el.style.scale).toBe('0.9');
  el.style.scale = '1.2';
  pile.end();
  expect(el.style.scale).toBe('1.2');
  expect(animate).not.toHaveBeenCalled();
});

it.each([1, 0])('draws the active orb at speed %s', (speed) => {
  const scale = vi.fn();
  const fill = vi.fn();
  const stroke = vi.fn();
  const restore = vi.fn();
  const ctx = { save: vi.fn(), translate: vi.fn(), scale, beginPath: vi.fn(), arc: vi.fn(),
    fill, stroke, moveTo: vi.fn(), lineTo: vi.fn(), restore,
    createRadialGradient: () => ({ addColorStop: vi.fn() }) } as unknown as CanvasRenderingContext2D;
  drawPlasmaOrb(ctx, 50, 60, 30, 200, false, 1, { speed, pulsePeriod: 800, pulseAmount: 0.1, swell: 0.2 });
  expect(scale.mock.calls[0]?.[0]).toBeCloseTo(speed ? 1.3 : 1);
  expect(fill).toHaveBeenCalled();
  expect(stroke).toHaveBeenCalled();
  expect(restore).toHaveBeenCalledOnce();
});

it.each([1, 0])('draws drift fragments only while moving (speed %s)', (scale) => {
  const img = document.createElement('canvas');
  const art = vi.fn(() => ({ img, w: 100, h: 100 }));
  const drawImage = vi.fn();
  const clip = vi.fn();
  const ctx = { save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), closePath: vi.fn(), clip, drawImage, restore: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  const drawn = drawDriftCloud(ctx, { w: 150, h: 100, u: 1, now: 800, scale,
    cohorts: [{ id: 'piece', born: 0 }], art, empty: false, settings: { pieceCount: 1 } });
  expect(drawn).toBe(scale);
  expect(drawImage).toHaveBeenCalledTimes(scale);
  expect(clip).toHaveBeenCalledTimes(scale);
});
