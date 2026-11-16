import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IllegalTransitionError, transition } from '../state-machines/machine.ts';
import { applyUpdate, autoApply, pageHost, registerServiceWorker, RELOAD_FALLBACK_MS, shouldRegister, UPDATE_MACHINE, useUpdate } from './index.ts';
import { UpdateLine } from './ui.ts';

const PROD = { prod: true, e2e: false, local: false };
const HTTPS = { protocol: 'https:', hostname: 'pc.example' };

afterEach(() => {
  useUpdate.setState({ state: 'idle', waiting: null });
  vi.useRealTimers();
});

describe('offline registration and updates', () => {
  it('registers in production on HTTPS only: never in dev, an e2e build, on http or without support', () => {
    expect(shouldRegister(PROD, HTTPS, true)).toBe(true);
    expect(shouldRegister({ ...PROD, prod: false }, HTTPS, true)).toBe(false);
    expect(shouldRegister({ ...PROD, e2e: true }, HTTPS, true)).toBe(false);
    expect(shouldRegister(PROD, HTTPS, false)).toBe(false);
    expect(shouldRegister(PROD, { protocol: 'http:', hostname: '127.0.0.1' }, true)).toBe(false);
    expect(shouldRegister({ ...PROD, local: true }, { protocol: 'http:', hostname: 'localhost' }, true)).toBe(true);
    expect(shouldRegister({ ...PROD, local: true }, { protocol: 'http:', hostname: '192.168.1.5' }, true)).toBe(false);
  });

  it('never registers inside a frame: pageHost works out framed, a refused look at the parent counts as framed', () => {
    expect(shouldRegister(PROD, { ...HTTPS, framed: true }, true)).toBe(false);
    expect(shouldRegister(PROD, { ...HTTPS, framed: false }, true)).toBe(true);
    expect(pageHost().framed).toBe(false);
    const location = { protocol: 'https:', hostname: 'pc.example' };
    const inner = { self: {}, top: {}, location, navigator: { serviceWorker: {} } } as unknown as Window;
    expect(pageHost(inner)).toEqual({ ...location, framed: true, supported: true });
    const refused = {
      self: {},
      get top(): Window {
        throw new Error('cross-origin');
      },
      location,
      navigator: {},
    } as unknown as Window;
    expect(pageHost(refused)).toEqual({ ...location, framed: true, supported: false });
    const register = vi.fn(() => Promise.resolve({}));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: null, register, addEventListener: vi.fn() } });
    registerServiceWorker(PROD, 'sw.js', { ...location, framed: true, supported: true });
    expect(useUpdate.getState().state).toBe('off');
    expect(register).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('the update machine: a newer version found while one runs is offered; Reload takes it; nothing without a worker', () => {
    expect(transition(UPDATE_MACHINE, 'idle', 'registered')).toBe('current');
    expect(transition(UPDATE_MACHINE, 'idle', 'unsupported')).toBe('off');
    expect(transition(UPDATE_MACHINE, 'idle', 'failed')).toBe('off');
    expect(transition(UPDATE_MACHINE, 'current', 'found')).toBe('ready');
    expect(transition(UPDATE_MACHINE, 'ready', 'found')).toBe('ready');
    expect(transition(UPDATE_MACHINE, 'ready', 'reload')).toBe('reloading');
    expect(() => transition(UPDATE_MACHINE, 'off', 'found')).toThrow(IllegalTransitionError);
    expect(() => transition(UPDATE_MACHINE, 'current', 'reload')).toThrow(IllegalTransitionError);
  });

  it('off production the page registers nothing; with a stored version and a waiting one it offers the update', async () => {
    registerServiceWorker({ ...PROD, prod: false }, 'sw.js');
    expect(useUpdate.getState().state).toBe('off');
    useUpdate.setState({ state: 'idle' });
    const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const reg = { waiting, addEventListener: vi.fn(), update: vi.fn() };
    const register = vi.fn(() => Promise.resolve(reg));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {}, register, addEventListener: vi.fn() },
    });
    registerServiceWorker({ ...PROD, local: true }, 'base/sw.js');
    await act(() => Promise.resolve());
    expect(register).toHaveBeenCalledWith('base/sw.js');
    expect(useUpdate.getState().state).toBe('ready');
    expect(useUpdate.getState().waiting).toBe(waiting);
    registerServiceWorker(PROD, 'sw.js');
    expect(register).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('the update line shows only while a newer version waits; Reload sends skipWaiting once and reloads after the fallback', () => {
    const { unmount } = render(<UpdateLine />);
    expect(screen.queryByTestId('update-line')).toBeNull();
    unmount();
    const postMessage = vi.fn();
    useUpdate.setState({ state: 'current' });
    useUpdate.getState().send('found', { postMessage } as unknown as ServiceWorker);
    render(<UpdateLine words={{ reload: 'Take it' }} />);
    expect(screen.getByTestId('update-line').textContent).toContain('A new version is ready. Your game is kept.');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Take it' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'skipWaiting' });
    expect(useUpdate.getState().state).toBe('reloading');
    expect(screen.getByTestId('update-reload')).toBeDisabled();
    const reload = vi.fn();
    applyUpdate(reload);
    expect(postMessage).toHaveBeenCalledTimes(1);
    vi.clearAllTimers();
    useUpdate.setState({ state: 'ready', waiting: { postMessage } as unknown as ServiceWorker });
    applyUpdate(reload);
    vi.advanceTimersByTime(RELOAD_FALLBACK_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('auto-apply: looks for a newer build at once and back online; applies a waiting one only when safe, after the save, once at a time', async () => {
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    const update = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: () => Promise.resolve({ update }) } });
    let safe = false;
    const saved: (() => void)[] = [];
    const flush = vi.fn(() => new Promise<void>((r) => saved.push(r)));
    const apply = vi.fn();
    const auto = autoApply({ safe: () => safe, flush, apply });
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await tick();
    expect(update).toHaveBeenCalledTimes(2);
    safe = true;
    auto.check();
    expect(flush).not.toHaveBeenCalled();
    safe = false;
    useUpdate.setState({ state: 'ready', waiting: {} as ServiceWorker });
    expect(flush).not.toHaveBeenCalled();
    safe = true;
    auto.check();
    auto.check();
    expect(flush).toHaveBeenCalledTimes(1);
    safe = false;
    saved.pop()?.();
    await tick();
    expect(apply).not.toHaveBeenCalled();
    safe = true;
    auto.check();
    saved.pop()?.();
    await tick();
    expect(apply).toHaveBeenCalledTimes(1);
    auto.stop();
    window.dispatchEvent(new Event('online'));
    useUpdate.setState({ state: 'ready' });
    await tick();
    expect(update).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledTimes(2);
    // stopped while the save is still being written: nothing is applied afterwards
    const late = autoApply({ safe: () => true, flush, apply });
    expect(flush).toHaveBeenCalledTimes(3);
    late.stop();
    saved.pop()?.();
    await tick();
    expect(apply).toHaveBeenCalledTimes(1);
    late.check();
    expect(flush).toHaveBeenCalledTimes(3);
  });
});
