// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { forbiddenText, visibleText } from '../kit/plain-text/index.ts';
import { App } from '../src/ui/App.tsx';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => undefined;

it('checks nonempty actual route text and rejects exposed rule identifiers', () => {
  for (const route of ['#/', '#/setup', '#/play', '#/settings', '#/saves']) {
    window.location.hash = route;
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    try {
      act(() => root.render(<App />));
      expect(visibleText(element).trim(), 'rendered card UI must be nonempty').not.toBe('');
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) expect(node.textContent).not.toMatch(forbiddenText('[A-Z]+-\\d{2}'));
    } finally { act(() => root.unmount()); element.remove(); }
  }
});
