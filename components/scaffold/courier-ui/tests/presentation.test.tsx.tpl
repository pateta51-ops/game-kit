// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { forbiddenText, longSentences, visibleText } from '../kit/plain-text/index.ts';
import { CONFIG } from '../src/engine/api.ts';
import { App } from '../src/ui/App.tsx';
import { INITIAL, startGame } from '../src/ui/store.ts';
import { ids, instructions } from '../src/ui/text.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => undefined;
let unmount = (): void => undefined;
afterEach(() => { act(() => unmount()); });
const assertContent = (element: HTMLElement): void => {
  const text = visibleText(element).trim();
  expect(text, 'rendered courier UI must be nonempty').not.toBe('');
  // Adjacent controls have no DOM text separator; inspect their readable fields without inventing camelCase joins.
  const fields = [element, ...element.querySelectorAll('*')].filter(node => !node.children.length || node.matches('p,h1,h2,h3,label,legend,button,a,[title],[alt],[placeholder]'));
  for (const field of fields) expect(visibleText(field)).not.toMatch(forbiddenText(ids.pattern));
  const nodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = nodes.nextNode(); node; node = nodes.nextNode()) expect(node.textContent).not.toMatch(forbiddenText(ids.pattern));
};

it('SC-009 checks nonempty actual routes and their visible text', () => {
  startGame(INITIAL, 'presentation');
  for (const [hash, selector] of [
    ['#/', 'button'], ['#/setup', '[data-field="allowance"] select'],
    ['#/play', '[data-testid="courier-board"]'], ['#/settings', '[data-testid="setting-hints"]'],
    ['#/saves', '[data-testid="save-new"]'],
  ]) {
    act(() => unmount());
    window.location.hash = hash ?? '#/';
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    act(() => root.render(<App />));
    unmount = () => { root.unmount(); element.remove(); };
    assertContent(element);
    expect(element.querySelector(selector ?? 'button'), hash).not.toBeNull();
    if (hash === '#/play') expect(element.querySelectorAll('[data-testid^="move-"]')).toHaveLength(CONFIG.board.rows * CONFIG.board.cols);
  }
});

it('keeps authored instructions unchanged and rejects an empty or leaking screen', () => {
  expect(ids.strip(instructions)).toBe(instructions);
  expect(longSentences(instructions)).toEqual([]);
  expect(ids.strip('Move one space (COU-02).')).toBe('Move one space.');
  expect(() => assertContent(document.createElement('div'))).toThrow(/nonempty/);
  const leaked = document.createElement('div');
  leaked.textContent = 'Move one space COU-02';
  expect(() => assertContent(leaked)).toThrow();
});
