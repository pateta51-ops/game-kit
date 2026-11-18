import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { TargetArrow } from '../../components/target-arrow/TargetArrow.tsx';

export { aimedZone, createStrikes, STRIKE_MS } from '../../components/target-arrow/index.ts';

export function mountArrowPreview(container) {
  const root = createRoot(container);
  return (props) => flushSync(() => root.render(createElement(TargetArrow, props)));
}
