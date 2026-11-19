import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BoardViewport } from '../../components/board-viewport/BoardViewport.tsx';
import { Sheet, SWIPE_CLOSE_PX, ARRIVE_MS } from '../../components/phone-mode/Sheet.tsx';
import { CardZoom } from '../../components/card-zoom/zoom.tsx';
import { transcribe, placeZoom } from '../../components/card-zoom/index.ts';
import { buildIndex } from '../../components/glossary/index.ts';
import { AchievementToast } from '../../components/achievements/AchievementsUi.tsx';
import { toastFor, DEFAULT_HOLD_MS } from '../../components/achievements/toast.ts';
import { HostStack } from '../../components/card-attachments/HostStack.tsx';
import { TUCK } from '../../components/card-attachments/geometry.ts';

export { cameraPull, cameraPush, cameraScaleAt } from '../../components/effect-library/camera-pull.ts';
export { letterboxBanner } from '../../components/effect-library/letterbox-banner.ts';
export { typewriter } from '../../components/effect-library/typewriter.ts';
export { pileLift } from '../../components/effect-library/pile-lift.ts';
export { scrollPan } from '../../components/motion-frame/pan.ts';
export { placeZoom, SWIPE_CLOSE_PX, ARRIVE_MS, DEFAULT_HOLD_MS, TUCK };

const mount = (el) => { const r = createRoot(el); return (node) => flushSync(() => r.render(node)); };

export function mountBoard(el) {
  const draw = mount(el);
  const ref = { current: null };
  const svg = h('svg', { width: 1200, height: 800, style: { display: 'block', background: '#20382f' } },
    ...Array.from({ length: 13 }, (_, i) => h('line', { key: 'v' + i, x1: i * 100, y1: 0, x2: i * 100, y2: 800, stroke: '#3c5d51', strokeWidth: 2 })),
    ...Array.from({ length: 9 }, (_, i) => h('line', { key: 'h' + i, x1: 0, y1: i * 100, x2: 1200, y2: i * 100, stroke: '#3c5d51', strokeWidth: 2 })),
    h('rect', { x: 400, y: 300, width: 200, height: 200, fill: '#e9c46a' }),
    h('circle', { cx: 900, cy: 200, r: 60, fill: '#d96c5b' }), h('circle', { cx: 200, cy: 650, r: 60, fill: '#5b9bd9' }));
  return { ref, render: (p) => draw(h(BoardViewport, { ref, bounds: [0, 0, 1200, 800], style: { width: '100%', height: '100%' }, ...p }, svg)) };
}

export function mountSheet(el) {
  const draw = mount(el);
  return (p) => draw(p.open ? h(Sheet, {
    title: 'Help', onClose: p.onClose, onLeft: p.onLeft, leaving: p.leaving, slideMs: p.slideMs, leaveMs: p.leaveMs, arriveMs: p.arriveMs,
    foot: h('button', { type: 'button', onClick: p.onClose }, 'Done'),
  }, h('p', null, 'Drag down on the title to close, tap the dim area, or press Done.'), h('p', null, 'The sheet slides up over the screen and back down when it closes.')) : null);
}

const icons = { gold: { label: 'gold', body: '<circle cx="5" cy="5" r="5" fill="#e9c46a"/>', viewBox: '0 0 10 10' } };
const glossary = buildIndex([{ id: 'exhaust', term: 'Exhaust', summary: 'Turn it sideways.' }]);
const tr = transcribe({ title: 'Scout', meta: ['Unit, cost 2'], printed: [{ label: 'Action', text: 'Exhaust: gain [[gold]] [[gold]].' }], tokens: [{ label: 'Damage', count: 2 }] }, { icons, glossary });
export function mountZoom(el) {
  createRoot(el).render(h(CardZoom, { tr, icons }));
}

export function mountToast(el) {
  const draw = mount(el);
  const defs = [{ id: 'a', name: 'First Blood' }, { id: 'b', name: 'Hoarder' }, { id: 'c', name: 'Explorer' }];
  return (count, holdMs) => draw(count ? h(AchievementToast, { toast: toastFor(defs, defs.slice(0, count).map((d) => d.id), { holdMs }), onClose: () => {} }) : null);
}

export function mountStack(el) {
  const draw = mount(el);
  const card = (i, back) => h('div', { className: back ? 'cd back' : 'cd', style: { '--h': (i * 57 + 30) % 360 } }, back ? '' : String(i + 1));
  return ({ n, w, hh, ...p }) => draw(h(HostStack, { host: card(0), attachments: Array.from({ length: n }, (_, i) => ({ key: i, node: card(i + 1), turned: i === 1 })), w, h: hh, ...p }));
}
