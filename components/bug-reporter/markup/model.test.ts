import '../test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { drawMarkup, flattenMarkup, displayPoint, type Markup } from './model';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const box: Markup = {
  tool: 'box',
  color: '#45e5ff',
  width: 0.003,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.5, y: 0.6 },
  ],
  note: '',
};

it('bug reports markup: flattening preserves original bytes without marks', async () => {
  expect(await flattenMarkup('original', [])).toBe('original');
});

it('bug reports markup: flattening draws at original resolution, with the screenshot below normalized markup', async () => {
  const ctx = {
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    expect([this.width, this.height]).toEqual([3840, 2160]);
    return 'data:image/png;base64,flattened';
  });
  vi.stubGlobal(
    'Image',
    class extends Image {
      override decode = vi.fn().mockResolvedValue(undefined);
    },
  );
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(3840);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(2160);
  expect(await flattenMarkup('original', [box])).toBe('flattened');
  expect(ctx.drawImage).toHaveBeenCalledOnce();
  expect(ctx.rect).toHaveBeenCalledWith(384, 432, 1536, 864);
  expect(ctx.drawImage.mock.invocationCallOrder[0]).toBeLessThan(ctx.rect.mock.invocationCallOrder[0]!);
  expect(encode).toHaveBeenCalledWith('image/png');
});

it('bug reports markup: arrow endpoints scale independently with image dimensions', () => {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  drawMarkup(ctx as unknown as CanvasRenderingContext2D, [{ ...box, tool: 'arrow' }], 1000, 500);
  expect(ctx.moveTo).toHaveBeenCalledWith(100, 100);
  expect(ctx.lineTo).toHaveBeenCalledWith(500, 300);
  expect(ctx.lineTo).toHaveBeenCalledTimes(3);
});

it('bug reports markup: display coordinates map to normalized image points and clamp to its edges', () => {
  const rect = { left: 100, top: 50, width: 960, height: 540 };
  expect(displayPoint(340, 455, rect)).toEqual({ x: 0.25, y: 0.75 });
  expect(displayPoint(0, 1000, rect)).toEqual({ x: 0, y: 1 });
});
