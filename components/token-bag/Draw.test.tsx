import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const make = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('./scene.ts', () => ({ createBagScene: make.fn, ZOOM_BACK: 0.45 }));
import { Draw } from './Draw.tsx';

const props = { contents: ['a', 'b'], drawn: ['a'], faceUrl: (k: string) => k, rate: 1, countLabel: 'in the bag', skipText: 'Tap to skip' };

describe('Draw', () => {
  it('reports a scene that throws as an error (the dock falls back to 2D)', () => {
    make.fn.mockImplementation(() => {
      throw new Error('no webgl');
    });
    const onFail = vi.fn();
    render(<Draw {...props} onDone={() => undefined} onFail={onFail} />);
    expect(onFail).toHaveBeenCalledWith('error');
  });

  it('reports a slow scene', () => {
    make.fn.mockImplementation((_c: unknown, o: { onSlow: () => void }) => {
      o.onSlow();
      return { ready: new Promise(() => undefined), play: () => undefined, back: () => Promise.resolve(), dispose: () => undefined };
    });
    const onFail = vi.fn();
    render(<Draw {...props} onDone={() => undefined} onFail={onFail} />);
    expect(onFail).toHaveBeenCalledWith('slow');
  });

  it('any key or tap skips to the end', () => {
    make.fn.mockImplementation(() => ({ ready: new Promise(() => undefined), play: () => undefined, back: () => Promise.resolve(), dispose: () => undefined }));
    const onDone = vi.fn();
    render(<Draw {...props} onDone={onDone} onFail={() => undefined} />);
    fireEvent.keyDown(window, { key: 'x' });
    expect(onDone).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  const fake = (back: () => Promise<void>, extra: object = {}) => {
    let done = () => undefined as void;
    make.fn.mockImplementation((_c: unknown, o: { onDone: () => void }) => {
      done = o.onDone;
      return { ready: Promise.resolve(), play: () => undefined, back, dispose: () => undefined, stats: () => ({ fps: 60 }), faceSize: 256, textureBytes: 9, seek: vi.fn(), ...extra };
    });
    return () => done();
  };

  it('ends the draw when back() rejects (K441 bug)', async () => {
    vi.useFakeTimers();
    const fire = fake(() => Promise.reject(new Error('lost')));
    const onDone = vi.fn();
    render(<Draw {...props} onDone={onDone} onFail={() => undefined} />);
    await act(async () => {
      fire();
      await vi.advanceTimersByTimeAsync(500);
    });
    vi.useRealTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('sets no __bag3d hooks by default (K441)', () => {
    fake(() => Promise.resolve());
    render(<Draw {...props} onDone={() => undefined} onFail={() => undefined} />);
    expect((window as unknown as { __bag3dStats?: unknown }).__bag3dStats).toBeUndefined();
  });

  it("unmounting draw A keeps draw B's hooks (K441)", () => {
    fake(() => Promise.resolve());
    const a = render(<Draw {...props} e2eHooks onDone={() => undefined} onFail={() => undefined} />);
    const b = render(<Draw {...props} e2eHooks onDone={() => undefined} onFail={() => undefined} />);
    const w = window as unknown as { __bag3dStats?: () => unknown };
    expect(w.__bag3dStats).toBeDefined();
    a.unmount();
    expect(w.__bag3dStats).toBeDefined();
    b.unmount();
    expect(w.__bag3dStats).toBeUndefined();
  });

  it('exposes __bag3dStats and __bag3dSeek with e2eHooks, and removes them after (K441)', () => {
    const seek = vi.fn();
    fake(() => Promise.resolve(), { seek });
    const { unmount } = render(<Draw {...props} e2eHooks onDone={() => undefined} onFail={() => undefined} />);
    const w = window as unknown as { __bag3dStats?: () => unknown; __bag3dSeek?: (t: number) => void };
    expect(w.__bag3dStats?.()).toEqual({ fps: 60, faceSize: 256, textureBytes: 9 });
    w.__bag3dSeek?.(1.5);
    expect(seek).toHaveBeenCalledWith(1.5);
    unmount();
    expect(w.__bag3dStats).toBeUndefined();
    expect(w.__bag3dSeek).toBeUndefined();
  });

  it('hides a dock mounted after the draw started, and shows it again after (K441)', () => {
    fake(() => Promise.resolve());
    const { unmount } = render(<Draw {...props} onDone={() => undefined} onFail={() => undefined} />);
    const late = document.createElement('canvas');
    late.setAttribute('data-part', 'token-bag-canvas');
    document.body.appendChild(late);
    expect(getComputedStyle(late).visibility).toBe('hidden');
    unmount();
    expect(getComputedStyle(late).visibility).not.toBe('hidden');
    late.remove();
  });

  it('keeps the safe-area and clamp styling (K441)', () => {
    fake(() => Promise.resolve());
    render(<Draw {...props} onDone={() => undefined} onFail={() => undefined} />);
    const css = document.getElementById('token-bag-draw-style')?.textContent ?? '';
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('clamp(34px,3.2vmin,96px)');
  });

  it('positions the count and hint from the stylesheet, not inline styles (K446)', () => {
    fake(() => Promise.resolve());
    render(<Draw {...props} onDone={() => undefined} onFail={() => undefined} />);
    for (const part of ['token-bag-count', 'token-bag-skip']) {
      const el = document.querySelector(`[data-part="${part}"]`) as HTMLElement;
      expect(el.style.top).toBe('');
      expect(el.style.bottom).toBe('');
      expect(el.style.position).toBe('');
    }
    const css = document.getElementById('token-bag-draw-style')?.textContent ?? '';
    expect(css).toContain('position:absolute');
    expect(css).toContain('var(--token-bag-inset');
    expect(css).not.toContain('!important');
  });
});
