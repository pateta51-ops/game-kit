import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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
});
