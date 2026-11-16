import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSafeArea, useViewport, type LayoutSetting } from './index.ts';
import { RotatePanel, Scaled, Sheet, useCommitTap, useDock, useSecondTap } from './ui.ts';

const size = (w: number, h: number) => {
  vi.stubGlobal('innerWidth', w);
  vi.stubGlobal('innerHeight', h);
};
const coarse = (on: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: on && q === '(pointer: coarse)',
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('the viewport store', () => {
  it('follows the window and the setting; zooms only fitted or a location with no phone screen; stop removes listeners', () => {
    size(1920, 1080);
    coarse(false);
    let setting: LayoutSetting = 'auto';
    const subs = new Set<() => void>();
    const change = (s: LayoutSetting) => {
      setting = s;
      for (const f of subs) f();
    };
    const root = { style: { zoom: '' } } as unknown as HTMLElement;
    const stop = useViewport.getState().start(root, {
      setting: () => setting,
      onSetting: (f) => {
        subs.add(f);
        return () => subs.delete(f);
      },
      phoneScreen: (h) => h !== '#/old',
    });
    const html = document.documentElement.dataset;
    expect(useViewport.getState().mode).toBe('fitted');
    expect(html['layout']).toBe('fitted');
    expect(html['orient']).toBe('landscape');
    expect(html['display']).toBe('browser');
    expect(root.style.zoom).toBe('0.5');

    size(390, 844);
    coarse(true);
    change('phone');
    expect(useViewport.getState().mode).toBe('phonePortrait');
    expect(html['layout']).toBe('phone');
    expect(html['orient']).toBe('portrait');
    expect(root.style.zoom).toBe('');

    window.location.hash = '#/old';
    window.dispatchEvent(new Event('hashchange'));
    expect(root.style.zoom).not.toBe('');

    size(844, 390);
    window.dispatchEvent(new Event('resize'));
    expect(useViewport.getState().mode).toBe('phoneLandscape');

    size(3840, 2160);
    coarse(false);
    change('desk');
    expect(useViewport.getState().mode).toBe('desk');
    expect(root.style.zoom).toBe('');

    stop();
    expect(subs.size).toBe(0);
    size(1920, 1080);
    window.dispatchEvent(new Event('resize'));
    expect(useViewport.getState().mode).toBe('desk');
  });
  it('fit: false leaves the root unzoomed, so app-frame <Stage> is the only scaler (K235 A3)', () => {
    size(1920, 1080);
    coarse(false);
    const root = { style: { zoom: '' } } as unknown as HTMLElement;
    const stop = useViewport.getState().start(root, { fit: false });
    expect(useViewport.getState().mode).toBe('fitted');
    expect(root.style.zoom).toBe('');
    stop();
    const stop2 = useViewport.getState().start(root, {});
    expect(root.style.zoom).toBe('0.5');
    stop2();
  });
  it('setSafeArea writes the four tokens', () => {
    setSafeArea(47, 0, 34, 0);
    expect(document.documentElement.style.getPropertyValue('--sat')).toBe('47px');
    expect(document.documentElement.style.getPropertyValue('--sab')).toBe('34px');
  });
});

describe('Sheet and RotatePanel', () => {
  it('title labels the dialog with a per-instance id; close button and scrim close; foot shows', () => {
    const onClose = vi.fn();
    render(
      <>
        <Sheet title="One" onClose={onClose} foot={<button type="button">Pick</button>} slideMs={0}>
          body
        </Sheet>
        <Sheet title="Two" onClose={onClose} testId="other">
          x
        </Sheet>
      </>,
    );
    const a = screen.getByRole('dialog', { name: 'One' });
    const b = screen.getByRole('dialog', { name: 'Two' });
    expect(a.getAttribute('aria-labelledby')).not.toBe(b.getAttribute('aria-labelledby'));
    expect(screen.getByText('Pick')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('phone-sheet-close'));
    fireEvent.click(screen.getByTestId('other-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('RotatePanel shows the game children and is not captured', () => {
    render(<RotatePanel>Turn</RotatePanel>);
    expect(screen.getByTestId('rotate-panel')).toHaveTextContent('Turn');
    expect(screen.getByTestId('rotate-panel')).toHaveAttribute('data-no-capture');
  });
});

describe('useSecondTap', () => {
  it('commits on the second tap on the same target; a reset key change disarms', () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ k }) => useSecondTap(commit, k), { initialProps: { k: 1 } });
    act(() => result.current.tap('a'));
    expect(result.current.armed).toBe('a');
    act(() => result.current.tap('b'));
    expect(result.current.armed).toBe('b');
    act(() => result.current.tap('b'));
    expect(commit).toHaveBeenCalledWith('b');
    expect(result.current.armed).toBe(null);
    act(() => result.current.tap('a'));
    rerender({ k: 2 });
    expect(result.current.armed).toBe(null);
    act(() => result.current.tap('a'));
    act(() => result.current.disarm());
    expect(result.current.armed).toBe(null);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it('useDock: follows what the decision wants; a tap on the head holds until the key changes', () => {
    const { result, rerender } = renderHook(({ w, k }: { w: boolean; k: string }) => useDock(w, k), {
      initialProps: { w: false, k: 'd1|fold' },
    });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    rerender({ w: false, k: 'd1|fold' });
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    rerender({ w: true, k: 'd2|open' });
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    rerender({ w: false, k: 'd3|fold' });
    expect(result.current[0]).toBe(false);
  });
});

describe('Scaled and useCommitTap (K32)', () => {
  it('draws the piece at the box width and keeps its own size', () => {
    render(
      <Scaled w={200} h={100} box={100} testId="sc">
        <i />
      </Scaled>,
    );
    const outer = screen.getByTestId('sc');
    expect(outer.style.width).toBe('100px');
    expect(outer.style.height).toBe('50px');
    expect((outer.firstChild as HTMLElement).style.transform).toBe('scale(0.5)');
  });
  it('one tap commits without the flag; two with it, the arming tap calls onArm', () => {
    const commit = vi.fn();
    const arm = vi.fn();
    const one = renderHook(() => useCommitTap(commit, { twoTap: false }));
    act(() => one.result.current.tap('a'));
    expect(commit).toHaveBeenCalledWith('a');
    commit.mockClear();
    const two = renderHook(() => useCommitTap(commit, { twoTap: true, onArm: arm }));
    act(() => two.result.current.tap('a'));
    expect(commit).not.toHaveBeenCalled();
    expect(two.result.current.armed).toBe('a');
    expect(arm).toHaveBeenCalledTimes(1);
    act(() => two.result.current.tap('a'));
    expect(commit).toHaveBeenCalledWith('a');
    expect(arm).toHaveBeenCalledTimes(1);
  });
});
