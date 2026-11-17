import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneMenu, Sheet, TabBar, TopBar } from './ui.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const css = readFileSync(`${import.meta.dirname}/phone-frame.css`, 'utf8');

describe('K263 review round', () => {
  it('focus moves into the panel, the layer behind is inert while open, focus returns to the opener on close', () => {
    const { rerender } = render(<button type="button" data-testid="opener">o</button>);
    const opener = screen.getByTestId('opener');
    opener.focus();
    rerender(
      <>
        <button type="button" data-testid="opener">o</button>
        <Sheet title="T" onClose={() => undefined} slideMs={0}>b</Sheet>
      </>,
    );
    expect(document.activeElement).toBe(screen.getByTestId('phone-sheet'));
    expect(opener.hasAttribute('inert')).toBe(true);
    rerender(<button type="button" data-testid="opener">o</button>);
    expect(screen.getByTestId('opener').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(screen.getByTestId('opener'));
  });

  it('Escape runs in the capture phase and prevents default', () => {
    const onClose = vi.fn();
    render(<Sheet title="T" onClose={onClose} slideMs={0}>b</Sheet>);
    const inner = screen.getByTestId('phone-sheet');
    inner.addEventListener('keydown', (e) => e.stopPropagation());
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    inner.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('slideMs 0 means no motion and no scrim fade; reduced motion is still in the css', () => {
    render(<Sheet title="T" onClose={() => undefined} slideMs={0}>b</Sheet>);
    expect(screen.getByTestId('phone-sheet').style.animationDuration).toBe('0ms');
    expect(screen.getByTestId('phone-sheet-scrim').style.animationDuration).toBe('0ms');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^]*kit-pm-scrim[^]*animation: none/);
  });

  it('leaveMs slides down (leaving, inert) then closes; slideMs 0, reduced motion and the default close at once; a swipe keeps its transform', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(<Sheet title="T" onClose={onClose} leaveMs={240}>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-close'));
    expect(onClose).not.toHaveBeenCalled();
    const layer = document.querySelector('.kit-pm-layer') as HTMLElement;
    expect(layer.getAttribute('data-state')).toBe('leaving');
    expect(layer.hasAttribute('inert')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    const c2 = vi.fn();
    const r2 = render(<Sheet title="T" onClose={c2} leaveMs={240} slideMs={0}>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-close'));
    expect(c2).toHaveBeenCalledTimes(1);
    r2.unmount();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
    const c3 = vi.fn();
    const r3 = render(<Sheet title="T" onClose={c3} leaveMs={240}>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-close'));
    expect(c3).toHaveBeenCalledTimes(1);
    r3.unmount();
    vi.unstubAllGlobals();
    const c4 = vi.fn();
    render(<Sheet title="T" onClose={c4}>b</Sheet>);
    const head = screen.getByText('T').parentElement as HTMLElement;
    fireEvent.pointerDown(head, { clientY: 0 });
    fireEvent.pointerMove(head, { clientY: 120 });
    fireEvent.pointerUp(head);
    expect(c4).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('phone-sheet').style.transform).toBe('translateY(120px)');
  });

  it('arriveMs boundary: default 0 closes at once; before the window a tap is ignored, after it closes', () => {
    const a = vi.fn();
    const r = render(<Sheet title="T" onClose={a}>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    expect(a).toHaveBeenCalledTimes(1);
    r.unmount();
    const b = vi.fn();
    const t = performance.now();
    const now = vi.spyOn(performance, 'now').mockReturnValue(t);
    render(<Sheet title="T" onClose={b} arriveMs={250}>b</Sheet>);
    now.mockReturnValue(t + 249);
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    expect(b).not.toHaveBeenCalled();
    now.mockReturnValue(t + 250);
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('TopBar slots, hidden menu, menu scrim tap, the lit-tab note', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <>
        <TopBar start={<i>res</i>} end={<b>menu</b>} label="Bar" />
        <PhoneMenu open={false} onClose={onClose} label="M">x</PhoneMenu>
        <TabBar tabs={[{ id: 'a b', label: 'A', lit: true, litNote: 'choose here' }]} active="a b" onTab={() => undefined} label="T" />
      </>,
    );
    expect(container.querySelector('[data-part="top-start"]')?.textContent).toBe('res');
    expect(container.querySelector('[data-part="top-end"]')?.textContent).toBe('menu');
    expect(container.querySelector('[data-part="menu-layer"]')?.hasAttribute('hidden')).toBe(true);
    expect(screen.getByText('choose here').dataset['part']).toBe('sr-only');
    rerender(<PhoneMenu open onClose={onClose} label="M">x</PhoneMenu>);
    fireEvent.click(container.querySelector('[data-part="menu-scrim"]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('landscape rail and dock column are in the css', () => {
    expect(css).toMatch(/orientation: landscape\) and \(max-height: 500px\)/);
    expect(css).toContain("'tabs top top' 'tabs banner banner' 'tabs main dock'");
    expect(css).toContain('var(--pm-dock-col, 270px)');
    expect(css).toContain("'tabs top' 'tabs banner' 'tabs main' 'tabs dock'");
  });
});
