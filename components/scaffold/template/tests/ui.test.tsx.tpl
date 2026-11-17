// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/ui/App.tsx';
import { game } from '../src/ui/store.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => undefined;
let unmount = (): void => undefined;
const clear = (): void => {
  act(() => unmount());
  unmount = (): void => undefined;
};
afterEach(clear);
function show(hash: string): HTMLElement {
  clear();
  window.location.hash = hash;
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  act(() => root.render(<App />));
  unmount = () => {
    root.unmount();
    el.remove();
  };
  return el;
}
const click = (b: Element | null | undefined): void => {
  if (!(b instanceof HTMLElement)) throw new Error('no button');
  act(() => b.click());
};

describe('app routes', () => {
  it('menu -> set-up -> play: a step, then undo', () => {
    expect(show('#/').querySelector('[data-entry="play"]')?.hasAttribute('disabled')).toBe(true);
    const form = show('#/setup');
    const name = form.querySelector('[data-seat="0"] input:not([type])');
    if (!(name instanceof HTMLInputElement)) throw new Error('no name');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'Ann');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(form.querySelector('[data-part="setup"] button[type="submit"]'));
    expect(game.get().state.options.seed.startsWith('Ann')).toBe(true);
    expect(game.get().state.count).toBe(0);
    expect(show('#/').querySelector('[data-entry="play"]')?.hasAttribute('disabled')).toBe(false);
    const el = show('#/play');
    click(el.querySelector('[data-testid="step"]'));
    expect(game.get().state.count).toBe(1);
    click(el.querySelector('[data-testid="undo"]'));
    expect(game.get().state.count).toBe(0);
  });

  it('draws the settings and saves screens', () => {
    expect(show('#/settings').querySelector('[data-testid="setting-hints"]')).not.toBeNull();
    expect(show('#/saves').querySelector('[data-testid="save-new"]')).not.toBeNull();
  });
});
