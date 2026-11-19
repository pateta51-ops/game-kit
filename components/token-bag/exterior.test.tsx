import { describe, expect, it, vi } from 'vitest';
import { exteriorCanvas } from './exterior.ts';

const ctx = { fillRect: () => undefined, createPattern: () => null, fillStyle: '' };
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

describe('exteriorCanvas (K441)', () => {
  it('paints a print once per function and reuses the canvas', async () => {
    const print = vi.fn();
    const a = await exteriorCanvas(print);
    const b = await exteriorCanvas(print);
    expect(print).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(await exteriorCanvas(vi.fn())).not.toBe(a);
  });

  it('caches the plain cloth', async () => {
    expect(await exteriorCanvas()).toBe(await exteriorCanvas());
  });

  it('uses a pre-painted canvas as is, without painting', async () => {
    const c = document.createElement('canvas');
    expect(await exteriorCanvas(c)).toBe(c);
  });

  it('does not cache a print that failed', async () => {
    const print = vi.fn().mockRejectedValueOnce(new Error('x'));
    await expect(exteriorCanvas(print)).rejects.toThrow('x');
    await exteriorCanvas(print);
    expect(print).toHaveBeenCalledTimes(2);
  });
});
