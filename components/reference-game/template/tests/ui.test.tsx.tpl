// @vitest-environment jsdom
// K205: the app through app-frame, prompt-host (pick, amount, may), settings and saves screens.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT, createGame, GAME, RULES } from '../src/engine/api.ts';
import { App } from '../src/ui/App.tsx';
import { useGame, useSettings } from '../src/ui/store.ts';

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

describe('reference app (K205)', () => {
  it('answers a pick, an amount and a may through the prompt host', () => {
    // a seed that deals a wild card to the first seat, so the amount prompt opens
    const seed = Array.from({ length: 200 }, (_, i) => `ui${String(i)}`).find((s) => createGame(GAME, { seed: s }, RULES, CONTENT).state.hands[0]?.[0] === 0) ?? '';
    useSettings.getState().set('obvious', false);
    useGame.getState().fresh(seed);
    const el = show('#/play');
    click(el.querySelector('[data-kind="pick"] [data-option="h0"]'));
    expect(el.querySelector('[data-kind="amount"]')).not.toBeNull();
    click(el.querySelector('.kp-done'));
    expect(useGame.getState().state.scores[0]).toBeGreaterThan(0);
    click(el.querySelector('[data-kind="may"] [data-option="no"]'));
    expect(useGame.getState().history.actions.length).toBeGreaterThanOrEqual(3);
    expect(useGame.getState().state.prompt?.seat ?? 0).toBe(0);
  });

  it('draws the settings and saves screens', () => {
    expect(show('#/settings').querySelector('[data-testid="setting-obvious"]')).not.toBeNull();
    expect(show('#/saves').querySelector('[data-testid="save-new"]')).not.toBeNull();
  });
});
