import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const make = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('./scene.ts', () => ({ createBagScene: make.fn }));
import { Rest } from './Rest.tsx';

const props = { faceUrl: (k: string) => k, onFail: () => undefined };
const scene = () => make.fn.mockImplementation(() => ({ ready: Promise.resolve(), renders: () => 7, dispose: () => undefined }));
const w = window as unknown as { __bagDockFrames?: () => number };

describe('Rest (K446)', () => {
  it('keeps the inline 100% sizing by default', () => {
    scene();
    const { container } = render(<Rest {...props} />);
    const c = container.querySelector('canvas') as HTMLCanvasElement;
    expect(c.style.width).toBe('100%');
    expect(c.style.height).toBe('100%');
  });
  it('hostSized leaves sizing to the host, and className reaches the canvas', () => {
    scene();
    const { container } = render(<Rest {...props} hostSized className="dock__canvas" />);
    const c = container.querySelector('canvas') as HTMLCanvasElement;
    expect(c.style.width).toBe('');
    expect(c.style.height).toBe('');
    expect(c.className).toBe('dock__canvas');
  });
  it('sets no frame hook by default', () => {
    scene();
    render(<Rest {...props} />);
    expect(w.__bagDockFrames).toBeUndefined();
  });
  it('e2eHooks sets window.__bagDockFrames and removes only its own', () => {
    scene();
    const a = render(<Rest {...props} e2eHooks />);
    const b = render(<Rest {...props} e2eHooks />);
    expect(w.__bagDockFrames?.()).toBe(7);
    a.unmount();
    expect(w.__bagDockFrames).toBeDefined();
    b.unmount();
    expect(w.__bagDockFrames).toBeUndefined();
  });
});
