// Issue 44/45: the floating bug button (setting, phone default, opens the report) and the menu's way back.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stopTestGame, useTestSettings } from './test-utils';
import type * as capture from './capture';
import { scrolledElements } from './capture';
import { useBugDialog } from './dialogStore';
import { FloatingBugButton } from './FloatingBugButton';

vi.mock('./capture', async (orig) => ({
  ...(await orig<typeof capture>()),
  captureScreen: () => Promise.resolve('iVBORw0KGgo'.repeat(30)),
}));

function phone(matches: boolean): void {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const saved: { matchMedia: unknown } = { matchMedia: (window as { matchMedia?: unknown }).matchMedia };
beforeEach(() => {
  stopTestGame();
});
afterEach(() => {
  cleanup();
  (window as { matchMedia?: unknown }).matchMedia = saved.matchMedia;
  stopTestGame();
  useTestSettings.setState({ bugButton: 'auto' });
  useBugDialog.getState().close();
});

describe('floating bug button', () => {
  it('shows on a phone and not on desktop by default; on/off override', () => {
    phone(true);
    render(<FloatingBugButton />);
    expect(screen.queryByTestId('bug-float')).not.toBeNull();
    cleanup();
    phone(false);
    render(<FloatingBugButton />);
    expect(screen.queryByTestId('bug-float')).toBeNull();
    act(() => useTestSettings.setState({ bugButton: 'on' }));
    expect(screen.queryByTestId('bug-float')).not.toBeNull();
    act(() => useTestSettings.setState({ bugButton: 'off' }));
    expect(screen.queryByTestId('bug-float')).toBeNull();
  });
  it('is not shown on the table, which has its own header button', () => {
    phone(true);
    window.location.hash = '#/game';
    render(<FloatingBugButton />);
    expect(screen.queryByTestId('bug-float')).toBeNull();
    window.location.hash = '';
  });
  it('opens the report and is marked out of its own screenshot', async () => {
    phone(true);
    render(<FloatingBugButton />);
    const b = screen.getByTestId('bug-float');
    expect(b.hasAttribute('data-no-capture')).toBe(true);
    fireEvent.click(b);
    await vi.waitFor(() => {
      expect(useBugDialog.getState().dialog.phase).not.toBe('closed');
    });
  });
});

describe('menu navigation and capture helpers', () => {
  it('finds scrolled elements', () => {
    const d = document.createElement('div');
    d.scrollTop = 50;
    Object.defineProperty(d, 'scrollTop', { value: 50 });
    document.body.append(d);
    expect(scrolledElements().some((s) => s.el === d && s.y === 50)).toBe(true);
    d.remove();
  });
});
