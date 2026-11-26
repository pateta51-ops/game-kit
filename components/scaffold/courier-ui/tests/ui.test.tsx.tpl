// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ACCEPTANCE_ROUTE, CONFIG } from '../src/engine/api.ts';
import { App } from '../src/ui/App.tsx';
import { game } from '../src/ui/store.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => undefined;
let unmount = (): void => undefined;
const clear = (): void => { act(() => unmount()); unmount = () => undefined; };
afterEach(clear);
function show(hash: string): HTMLElement {
  clear();
  window.location.hash = hash;
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  act(() => root.render(<App />));
  unmount = () => { root.unmount(); element.remove(); };
  return element;
}
const click = (button: Element | null | undefined): void => {
  if (!(button instanceof HTMLElement)) throw new Error('No button');
  act(() => button.click());
};

describe('courier UI', () => {
  it('COU-01 SC-001 passes the selected setup allowance into the real store', () => {
    const form = show('#/setup');
    const select = form.querySelector('[data-field="allowance"] select');
    if (!(select instanceof HTMLSelectElement)) throw new Error('No allowance selector');
    const chosen = CONFIG.allowances.at(-1);
    act(() => { select.value = String(chosen); select.dispatchEvent(new Event('change', { bubbles: true })); });
    click(form.querySelector('button[type="submit"]'));
    expect(game.get().view.movesLeft).toBe(chosen);
    const play = show('#/play');
    click(play.querySelector(`[data-testid="move-${ACCEPTANCE_ROUTE[0]}"]`));
    expect(game.get().view.movesLeft).toBe((chosen ?? 0) - 1);
  });

  it('uses the kit settings and saves screens', () => {
    expect(show('#/settings').querySelector('[data-testid="setting-hints"]')).not.toBeNull();
    expect(show('#/saves').querySelector('[data-testid="save-new"]')).not.toBeNull();
  });
});
