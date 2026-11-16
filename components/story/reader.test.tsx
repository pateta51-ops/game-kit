import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelReader, SplashView } from './ui';
import type { PanelSheet } from './index';

const sheet: PanelSheet = { id: 's', picture: { note: 'A page', w: 1000, h: 1000 }, credit: 'By X', beats: [
  { rect: { x: 0, y: 0, w: 100, h: 100 }, caption: 'One', sfx: 'BOOM' },
  { rect: { x: 500, y: 500, w: 100, h: 100 }, caption: 'Two' },
] };

describe('PanelReader', () => {
  it('next, back, keys, done; cut under reduced motion', () => {
    const done = vi.fn();
    render(<PanelReader sheet={sheet} area={{ w: 400, h: 300 }} reduced onDone={done} />);
    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('BOOM')).toBeTruthy();
    expect(screen.getByText('By X')).toBeTruthy();
    expect(screen.getByText('A page').parentElement?.style.transition).toBe('none');
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Two')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('One')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(done).toHaveBeenCalled();
  });
  it('skip ends', () => {
    const done = vi.fn();
    render(<PanelReader sheet={sheet} area={{ w: 400, h: 300 }} onDone={done} reduced={false} />);
    fireEvent.click(screen.getByText('Skip'));
    expect(done).toHaveBeenCalled();
  });
});

describe('SplashView', () => {
  const sp = { title: 'II', line: { text: 'Hello' }, note: 'Rule' };
  it('auto-closes after 4 s, not under reduced motion; tap and key close', () => {
    vi.useFakeTimers();
    const a = vi.fn(), b = vi.fn();
    const { unmount } = render(<SplashView splash={sp} onClose={a} reduced={false} />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(a).toHaveBeenCalledTimes(1);
    unmount();
    const { container } = render(<SplashView splash={sp} onClose={b} reduced />);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(b).not.toHaveBeenCalled();
    fireEvent.click(container.firstChild as Element);
    fireEvent.keyDown(window, { key: 'a' });
    expect(b).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
