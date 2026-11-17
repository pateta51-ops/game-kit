// @vitest-environment jsdom
// K205 / K276: the app through app-frame, screens (menu, set-up form), prompt-host (pick, may), settings and saves screens.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/ui/App.tsx';
import { campaignNow, game, INITIAL, startGame, useSettings } from '../src/ui/store.ts';

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
const choose = (s: Element | null | undefined, value: string): void => {
  if (!(s instanceof HTMLSelectElement)) throw new Error('no select');
  act(() => {
    s.value = value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('reference app (K205, K276)', () => {
  it('answers a may and a pick through the prompt host; undo goes back one click', () => {
    useSettings.getState().set('obvious', false);
    startGame(INITIAL, 'ui1');
    const el = show('#/play');
    click(el.querySelector('[data-kind="may"] [data-option="no"]'));
    const first = game.get().state.zones['hand:0']?.cards[0] ?? '';
    click(el.querySelector(`[data-kind="pick"] [data-option="${first}"]`));
    expect(game.get().history.steps.length).toBe(2);
    expect(game.get().state.prompt?.seat).toBe('0');
    click(el.querySelector('[data-testid="undo"]'));
    expect(game.get().state.prompt?.kind).toBe('pick');
    expect(el.querySelector('[data-part="log"], ol, ul')).not.toBeNull();
  });

  it('the set-up form starts the game it shows: seats, scenario and difficulty', () => {
    const el = show('#/setup');
    choose(el.querySelector('[data-seat="0"] select'), 'automa');
    choose(el.querySelector('[data-seat="1"] select'), 'human');
    choose(el.querySelector('[data-field="scenario"] select'), 'second');
    choose(el.querySelector('[data-field="difficulty"] select'), 'hard');
    click(el.querySelector('[data-part="setup"] button[type="submit"]'));
    expect(game.get().state.options).toMatchObject({ bots: ['0'], scenario: 'second', level: 'hard' });
    expect(game.get().state.prompt?.seat).toBe('1');
  });

  it('the main menu starts a campaign at its first scenario', () => {
    const el = show('#/');
    expect(el.querySelector('[data-part="menu"] [data-entry="setup"]')).not.toBeNull();
    click(el.querySelector('[data-entry="campaign"]'));
    expect(campaignNow()?.attempt?.step.id).toBe('first');
    expect(game.get().state.options.scenario).toBe('first');
  });

  it('draws the settings and saves screens', () => {
    expect(show('#/settings').querySelector('[data-testid="setting-obvious"]')).not.toBeNull();
    expect(show('#/saves').querySelector('[data-testid="save-new"]')).not.toBeNull();
  });
});
