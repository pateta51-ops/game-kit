import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardClose, guardTap } from './guard.ts';
import { GuardedButton } from './ui.tsx';

const state = (c: HTMLElement) => c.querySelector('[data-part="guarded-button"]')?.getAttribute('data-state');
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('guarded-button', () => {
  it('K730: initial="open" stays open under StrictMode; a resetKey change guards it', () => {
    const el = <GuardedButton onFire={() => {}} initial="open" resetKey={1}>Abort</GuardedButton>;
    const { container, rerender } = render(<StrictMode>{el}</StrictMode>);
    expect(state(container)).toBe('open');
    rerender(<StrictMode><GuardedButton onFire={() => {}} initial="open" resetKey={2}>Abort</GuardedButton></StrictMode>);
    expect(state(container)).toBe('guarded');
  });
  it('K726: the first tap opens the guard and does not fire, the second fires', () => {
    const fire = vi.fn();
    const { container } = render(<GuardedButton onFire={fire} guardLabel="LIFT" swingMs={0}>Abort</GuardedButton>);
    expect(state(container)).toBe('guarded');
    fireEvent.click(screen.getByText('LIFT'));
    expect(state(container)).toBe('open');
    expect(fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(state(container)).toBe('fired');
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it('K726: a tap on the button itself also needs two taps', () => {
    const fire = vi.fn();
    render(<GuardedButton onFire={fire} swingMs={0}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it('K726: the timeout closes the guard again', () => {
    const fire = vi.fn();
    const { container } = render(<GuardedButton onFire={fire} timeoutMs={1000}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    act(() => { vi.advanceTimersByTime(999); });
    expect(state(container)).toBe('open');
    act(() => { vi.advanceTimersByTime(2); });
    expect(state(container)).toBe('guarded');
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).not.toHaveBeenCalled();
  });
  it('K726: Escape closes the guard', () => {
    const { container } = render(<GuardedButton onFire={() => {}}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    fireEvent.pointerDown(document.body.firstChild as Node);
    expect(state(container)).toBe('guarded');
    fireEvent.click(screen.getByText('Abort'));
    fireEvent.keyDown(document, { key: 'a' });
    expect(state(container)).toBe('open');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(state(container)).toBe('guarded');
  });
  it('K726: a tap elsewhere closes the guard, a tap inside does not', () => {
    const { container } = render(<GuardedButton onFire={() => {}}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    fireEvent.pointerDown(screen.getByText('Abort'));
    expect(state(container)).toBe('open');
    fireEvent.keyDown(document, { key: 'x' });
    expect(state(container)).toBe('open');
    fireEvent.pointerDown(document.body);
    expect(state(container)).toBe('guarded');
  });
  it('K726: root is inline-block and the plate is block so perspective and transform apply', () => {
    const { container } = render(<GuardedButton onFire={() => {}}>Abort</GuardedButton>);
    expect((container.querySelector('[data-part="guarded-button"]') as HTMLElement).style.display).toBe('inline-block');
    expect((container.querySelector('[data-part="guard"]') as HTMLElement).style.display).toBe('block');
  });
  it('K726: two clicks in the same tick do not fire; a click after the swing does', () => {
    const fire = vi.fn();
    render(<GuardedButton onFire={fire}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(301); });
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it('K726: swingMs 0 lets the second tap fire at once', () => {
    const fire = vi.fn();
    render(<GuardedButton onFire={fire} swingMs={0}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it('K726: barred turning true closes an open guard', () => {
    const fire = vi.fn();
    const { container, rerender } = render(<GuardedButton onFire={fire}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    rerender(<GuardedButton onFire={fire} barred reason="no">Abort</GuardedButton>);
    rerender(<GuardedButton onFire={fire}>Abort</GuardedButton>);
    expect(state(container)).toBe('guarded');
    act(() => { vi.advanceTimersByTime(301); });
    fireEvent.click(screen.getByText('Abort'));
    expect(fire).not.toHaveBeenCalled();
  });
  it('K726: the timer is cleared on fire and on a resetKey change', () => {
    const { rerender } = render(<GuardedButton onFire={() => {}} swingMs={0} resetKey={1}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByText('Abort'));
    expect(vi.getTimerCount()).toBe(0);
    rerender(<GuardedButton onFire={() => {}} swingMs={0} resetKey={2}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    expect(vi.getTimerCount()).toBe(1);
    rerender(<GuardedButton onFire={() => {}} swingMs={0} resetKey={3}>Abort</GuardedButton>);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('K726: barred never opens or fires and shows its reason', () => {
    const fire = vi.fn();
    const { container } = render(<GuardedButton onFire={fire} barred reason="No action left">Abort</GuardedButton>);
    const b = screen.getByText('Abort');
    fireEvent.click(b);
    fireEvent.click(b);
    expect(fire).not.toHaveBeenCalled();
    expect(state(container)).toBe('barred');
    expect(b.getAttribute('title')).toBe('No action left');
    expect(b.getAttribute('data-reason')).toBe('No action left');
    expect(container.querySelector('[data-part="guard"]')).toBeNull();
  });
  it('K726: the guard plate swings up on the first tap (data-open) and shuts on the timeout', () => {
    const { container } = render(<GuardedButton onFire={() => {}} timeoutMs={500}>Abort</GuardedButton>);
    const plate = () => container.querySelector('[data-part="guard"]') as HTMLElement;
    expect(plate().getAttribute('data-open')).toBe('false');
    expect(plate().style.transform).toBe('rotateX(0deg)');
    fireEvent.click(screen.getByText('Abort'));
    expect(plate().getAttribute('data-open')).toBe('true');
    expect(plate().style.transform).toContain('-100deg');
    act(() => { vi.advanceTimersByTime(501); });
    expect(plate().getAttribute('data-open')).toBe('false');
    expect(plate().style.transform).toBe('rotateX(0deg)');
  });
  it('K726: unmounting clears the timer', () => {
    const { unmount } = render(<GuardedButton onFire={() => {}}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('K726: resetKey re-arms a fired button; the button carries data-kit', () => {
    const { container, rerender } = render(<GuardedButton onFire={() => {}} resetKey={1} swingMs={0}>Abort</GuardedButton>);
    fireEvent.click(screen.getByText('Abort'));
    fireEvent.click(screen.getByText('Abort'));
    expect(state(container)).toBe('fired');
    rerender(<GuardedButton onFire={() => {}} resetKey={2} swingMs={0}>Abort</GuardedButton>);
    expect(state(container)).toBe('guarded');
    expect(screen.getByText('Abort').hasAttribute('data-kit')).toBe(true);
  });
  it('K726: the pure helper', () => {
    expect(guardTap('guarded')).toEqual({ state: 'open', fire: false });
    expect(guardTap('open')).toEqual({ state: 'fired', fire: true });
    expect(guardTap('open', true)).toEqual({ state: 'open', fire: false });
    expect(guardClose('fired')).toBe('fired');
  });
});
