import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stage } from './ui';

const heads = { menu: { rect: [3400, 40, 400, 360] as const, node: <p>logo and home</p> }, flow: { rect: [3400, 40, 400, 110] as const, node: <p>home</p> } };

describe('Stage (K28)', () => {
  it('scales the fixed stage to fit the window and follows resizes', () => {
    Object.assign(window, { innerWidth: 1920, innerHeight: 1200 });
    render(<Stage layout={{ w: 3840, h: 2160 }}><p>zones</p></Stage>);
    const s = screen.getByTestId('stage');
    expect(s.style.width).toBe('3840px');
    expect(s.style.transform).toBe('scale(0.5)');
    act(() => {
      Object.assign(window, { innerWidth: 1000, innerHeight: 2160 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(s.style.transform).toBe(`scale(${String(1000 / 3840)})`);
    expect(screen.getByText('zones')).toBeTruthy();
  });
  it('draws the named head at its rect, none without one', () => {
    const { rerender, container } = render(<Stage layout={{ w: 3840, h: 2160 }} heads={heads} head="menu" />);
    const h = container.querySelector<HTMLElement>('.kit-stage-head');
    expect(h?.dataset['head']).toBe('menu');
    expect(h?.style.left).toBe('3400px');
    expect(h?.style.height).toBe('360px');
    rerender(<Stage layout={{ w: 3840, h: 2160 }} heads={heads} head="flow" />);
    expect(screen.getByText('home')).toBeTruthy();
    rerender(<Stage layout={{ w: 3840, h: 2160 }} heads={heads} />);
    expect(container.querySelector('.kit-stage-head')).toBeNull();
  });
});
