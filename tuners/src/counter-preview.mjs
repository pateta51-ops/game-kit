import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Counter } from '../../components/counter/ui.tsx';

export { BUMP_MS, TAG_MS, levelOf, scaledMs } from '../../components/counter/counter.ts';

const icon = createElement('svg', { viewBox: '0 0 24 24', 'aria-hidden': true },
  createElement('path', { fill: 'currentColor', d: 'M12 21 3.5 12.5A5.5 5.5 0 0 1 12 5.6a5.5 5.5 0 0 1 8.5 6.9Z' }));

export function mountCounterPreview(container) {
  const root = createRoot(container);
  return (props) => flushSync(() => root.render(createElement(Counter, { anchor: 'supply', icon, ...props })));
}
