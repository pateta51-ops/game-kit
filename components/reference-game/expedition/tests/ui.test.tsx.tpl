// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { App } from '../src/ui/App.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it.each([[0, 8], [1, 12]])('plays route %i through visible controls in %i actions', (index, points) => {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    act(() => root.render(<App />));
    const route = [...element.querySelectorAll('label')].find(candidate => candidate.textContent?.trim() === 'Route');
    expect(route?.control).toBeInstanceOf(HTMLSelectElement);
    const select = route!.control as HTMLSelectElement;
    act(() => { select.value = String(index); select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(element.querySelector('section[aria-label="Expedition board"]')).not.toBeNull();
    for (let count = 0; count < points; count++) {
      expect(element.querySelector('[data-testid="expedition-status"]')?.textContent).toBe(`${String(points - count)} action points remain.`);
      const buttons = [...element.querySelectorAll<HTMLButtonElement>('[aria-label="Your action"] button')];
      for (const button of buttons) expect(button.textContent).toMatch(/^(Attack guard|Explore the frontier|Move to c\d+)$/);
      const choose = buttons.find(button => button.textContent === 'Attack guard')
        ?? buttons.find(button => button.textContent === 'Explore the frontier')
        ?? buttons.sort((a, b) => Number(b.textContent?.slice(9)) - Number(a.textContent?.slice(9)))[0];
      expect(choose).toBeDefined();
      act(() => choose!.click());
    }
    expect(element.querySelector('[data-testid="expedition-status"]')?.textContent).toBe('You reached the exit.');
    expect(element.querySelector('[aria-label="Your action"]')).toBeNull();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  } finally { act(() => root.unmount()); element.remove(); }
});
