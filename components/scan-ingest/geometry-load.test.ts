import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGeometry, type GeometryStore } from './index.ts';

function decoder() {
  const images: ImageStub[] = [];
  class ImageStub {
    naturalWidth = 3;
    naturalHeight = 2;
    src = '';
    onload = () => undefined;
    onerror = () => undefined;
    constructor() { images.push(this); }
  }
  const context = {
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(24) }),
  };
  const getContext = vi.fn((): typeof context | null => context);
  vi.stubGlobal('Image', ImageStub);
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext }) });
  return { images, getContext };
}

afterEach(() => vi.unstubAllGlobals());

describe('loadGeometry', () => {
  it('retries a failed decode, coalesces in-flight callers, and retains successful geometry', async () => {
    const { images } = decoder();
    const first = loadGeometry('/scan.png', 'retry', { boxes: [] });
    expect(loadGeometry('/scan.png', 'retry', { boxes: [] })).toBe(first);
    expect(images).toHaveLength(1);
    images[0]!.onerror();
    expect(await first).toBeNull();

    const second = loadGeometry('/scan.png', 'retry', { boxes: [] });
    expect(images).toHaveLength(2);
    expect(loadGeometry('/scan.png', 'retry', { boxes: [] })).toBe(second);
    images[1]!.onload();
    const geometry = await second;
    expect(geometry).toEqual({ scanW: 3, scanH: 2, boxes: {}, bands: [] });
    expect(await loadGeometry('/scan.png', 'retry', { boxes: [] })).toBe(geometry);
    expect(images).toHaveLength(2);
  });

  it('retries a null canvas result without persisting it and contains optional store failures', async () => {
    const { images, getContext } = decoder();
    const set = vi.fn(() => Promise.reject(new Error('write unavailable')));
    const store: GeometryStore = {
      get: vi.fn(() => Promise.reject(new Error('read unavailable'))),
      set,
    };
    getContext.mockReturnValueOnce(null);
    const first = loadGeometry('/scan.png', 'canvas-retry', { boxes: [] }, store);
    await Promise.resolve();
    await Promise.resolve();
    images[0]!.onload();
    expect(await first).toBeNull();
    expect(set).not.toHaveBeenCalled();

    const second = loadGeometry('/scan.png', 'canvas-retry', { boxes: [] }, store);
    await Promise.resolve();
    await Promise.resolve();
    expect(images).toHaveLength(2);
    images[1]!.onload();
    const geometry = await second;
    expect(geometry?.scanW).toBe(3);
    expect(set).toHaveBeenCalledWith('canvas-retry', geometry);
    expect(await loadGeometry('/scan.png', 'canvas-retry', { boxes: [] }, store)).toBe(geometry);
  });

  it('uses persistent geometry without decoding and keeps different ask versions separate', async () => {
    const { images } = decoder();
    const geometry = { scanW: 9, scanH: 6, boxes: {}, bands: [] };
    const set = vi.fn(() => Promise.resolve());
    const store: GeometryStore = { get: vi.fn(() => Promise.resolve(geometry)), set };
    expect(await loadGeometry('/scan.png', 'stored-v1', { boxes: [] }, store)).toBe(geometry);
    expect(images).toHaveLength(0);
    expect(set).not.toHaveBeenCalled();
    const next = loadGeometry('/scan.png', 'stored-v2', { boxes: [] });
    expect(images).toHaveLength(1);
    images[0]!.onload();
    expect((await next)?.scanW).toBe(3);
  });
});
