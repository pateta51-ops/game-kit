import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneFrame, PhoneMenu, Sheet, SheetActions } from './ui.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('K279 phone-mode gaps (Imperium #142)', () => {
  it('sheet leaving: slides down, inert, onLeft after leaveMs; onClose not called', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onLeft = vi.fn();
    const { rerender } = render(<Sheet title="T" onClose={onClose} onLeft={onLeft} leaveMs={240}>b</Sheet>);
    expect(screen.getByTestId('phone-sheet').parentElement?.getAttribute('data-state')).toBe('open');
    rerender(<Sheet title="T" onClose={onClose} onLeft={onLeft} leaveMs={240} leaving>b</Sheet>);
    const layer = screen.getByTestId('phone-sheet').parentElement as HTMLElement;
    expect(layer.getAttribute('data-state')).toBe('leaving');
    expect(layer.hasAttribute('inert')).toBe(true);
    act(() => { vi.advanceTimersByTime(239); });
    expect(onLeft).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sheet leaving with leaveMs 0 calls onLeft at once', () => {
    const onLeft = vi.fn();
    render(<Sheet title="T" onClose={vi.fn()} onLeft={onLeft} leaving>b</Sheet>);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('leaving with slideMs 0 or reduced motion: onLeft at once', () => {
    const a = vi.fn();
    render(<Sheet title="T" onClose={vi.fn()} onLeft={a} leaveMs={240} slideMs={0} leaving>b</Sheet>);
    expect(a).toHaveBeenCalledTimes(1);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const b = vi.fn();
    render(<Sheet title="T" onClose={vi.fn()} onLeft={b} leaveMs={240} leaving>b</Sheet>);
    expect(b).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('controlled: scrim and Escape call onClose once at once, no own timer; during leaving they do nothing', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onLeft = vi.fn();
    const { rerender } = render(<Sheet title="T" onClose={onClose} onLeft={onLeft} leaveMs={240}>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('phone-sheet').parentElement?.getAttribute('data-state')).toBe('open');
    rerender(<Sheet title="T" onClose={onClose} onLeft={onLeft} leaveMs={240} leaving>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('re-open during a leave cancels: no late onLeft or onClose, not inert', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onLeft = vi.fn();
    const { rerender } = render(<Sheet title="T" onClose={onClose} onLeft={onLeft} leaveMs={240} leaving>b</Sheet>);
    act(() => { vi.advanceTimersByTime(100); });
    rerender(<Sheet title="T" onClose={onClose} onLeft={onLeft} leaveMs={240}>b</Sheet>);
    act(() => { vi.advanceTimersByTime(1000); });
    const layer = screen.getByTestId('phone-sheet').parentElement as HTMLElement;
    expect(layer.getAttribute('data-state')).toBe('open');
    expect(layer.hasAttribute('inert')).toBe(false);
    expect(onLeft).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uncontrolled own leave cancelled by unmount: no late onClose', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(<Sheet title="T" onClose={onClose} leaveMs={240}>b</Sheet>);
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focus returns to the opener after the sheet unmounts following onLeft', () => {
    function H() {
      const [on, setOn] = useState(true);
      return (
        <>
          <button type="button" data-testid="opener">o</button>
          {on && <Sheet title="T" onClose={vi.fn()} onLeft={() => setOn(false)} leaving>b</Sheet>}
        </>
      );
    }
    render(<button type="button" />);
    const op = document.createElement('button');
    document.body.append(op);
    op.focus();
    render(<H />);
    expect(screen.queryByTestId('phone-sheet')).toBeNull();
    expect(document.activeElement).toBe(op);
    op.remove();
  });

  it('closeButton={false} hides the close button', () => {
    const { rerender } = render(<Sheet title="T" onClose={vi.fn()}>b</Sheet>);
    expect(screen.queryByTestId('phone-sheet-close')).not.toBeNull();
    rerender(<Sheet title="T" onClose={vi.fn()} closeButton={false}>b</Sheet>);
    expect(screen.queryByTestId('phone-sheet-close')).toBeNull();
  });

  it('PhoneFrame testId and style; PhoneMenu id; SheetActions testId', () => {
    const onPress = vi.fn();
    render(
      <PhoneFrame top="t" dock="d" tabs="x" dockOpen tab="a" testId="fr" style={{ color: 'red' }}>
        <PhoneMenu open onClose={vi.fn()} label="M" id="menu-1">m</PhoneMenu>
        <SheetActions actions={[{ id: 'a', label: 'Go', testId: 'act-go', onPress }]} />
      </PhoneFrame>,
    );
    expect(screen.getByTestId('fr').style.color).toBe('red');
    expect(screen.getByTestId('phone-menu').id).toBe('menu-1');
    fireEvent.click(screen.getByTestId('act-go'));
    expect(onPress).toHaveBeenCalled();
  });
});
