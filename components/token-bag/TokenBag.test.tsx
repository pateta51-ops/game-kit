import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenBag } from './ui.ts';
import { forgetWebglCheck, getFallback, setFallback } from './index.ts';

afterEach(() => {
  setFallback(null);
  forgetWebglCheck();
});

const base = { count: 3, faceUrl: (k: string) => `/${k}.svg`, speed: 1, reduced: () => false };

describe('TokenBag', () => {
  it('2D chosen: the dock is the data-bag anchor with the count, and a draw ends at once (the flights show it)', () => {
    const done = vi.fn();
    render(<TokenBag {...base} chosen="2d" draw={{ key: 7, left: ['a'], drawn: ['b'] }} onDrawDone={done} />);
    const dock = screen.getByLabelText('Bag: 3 tokens');
    expect(dock).toHaveAttribute('data-bag');
    expect(dock).toHaveAttribute('data-place', 'bag');
    expect(dock).toHaveTextContent('3');
    expect(done).toHaveBeenCalledWith(7);
  });

  it('3D chosen without WebGL falls back to 2D for the session', () => {
    render(<TokenBag {...base} chosen="3d" draw={null} onDrawDone={() => undefined} />);
    expect(getFallback()).toBe('no-webgl');
    expect(screen.getByLabelText('Bag: 3 tokens')).toHaveAttribute('data-mode', '2d');
  });

  it('speed 0 shows no scene', () => {
    const done = vi.fn();
    render(<TokenBag {...base} speed={0} chosen="2d" draw={{ key: 1, left: [], drawn: ['b'] }} onDrawDone={done} />);
    expect(done).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
