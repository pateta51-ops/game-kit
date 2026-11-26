// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { App } from '../src/ui/App.tsx';
import { game, INITIAL, startGame, useSettings } from '../src/ui/store.ts';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => undefined;

it('SC-004 connects visible draw/play choices and undo to real engine actions', () => {
  useSettings.getState().set('obvious', false);
  startGame(INITIAL, 'ui1');
  window.location.hash = '#/play';
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    act(() => root.render(<App />));
    const click = (selector: string) => {
      const button = element.querySelector<HTMLButtonElement>(selector);
      expect(button, selector).not.toBeNull();
      act(() => button!.click());
    };
    click('[data-kind="may"] [data-option="no"]');
    expect(game.get().state.prompt?.kind).toBe('pick');
    click('[data-kind="pick"] [data-option]');
    expect(game.get().history.actions.length).toBeGreaterThan(2);
    expect(game.get().state.log.some(event => event.type === 'played' && event.seat === '0')).toBe(true);
    click('[data-testid="undo"]');
    expect(game.get().state.prompt?.kind).toBe('pick');
  } finally { act(() => root.unmount()); element.remove(); }
});
