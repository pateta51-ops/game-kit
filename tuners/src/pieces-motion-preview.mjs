import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useBoardPick } from '../../components/prompt-host/pick.ts';
import { DragGhost, useDragDrop, DRAG_THRESHOLD_PX } from '../../components/drag-drop/ui.tsx';
import { Ball, Chip } from '../../components/pieces-3d/ui.ts';
import { startDiceLayer } from '../../components/pieces-3d/diceGl.ts';

export { createMotionPlayer, createVerbs } from '../../components/motion-frame/index.ts';
export { registerEffects } from '../../components/effect-library/effects.ts';
export { copyPieces, registerPieceVerbs } from '../../components/pieces-3d-verbs/verbs.ts';
export { PER_TURN, CHEV_HW, chevronAt, paintBall, twoArcSeam } from '../../components/pieces-3d/ball.ts';
export { startDiceLayer };

// Read the kit's parameter default so the preview can also show it as a number.
export const dragSpeed = Number(useDragDrop.toString().match(/\bspeed = ([\d.]+)/)[1]);

const prompt = {
  id: 1, options: ['card', 'left', 'right'].map((id) => ({ id, label: id, enabled: true })),
  min: 2, max: 2,
};
const chipFace = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 72"><rect width="100" height="72" fill="#a24b3c"/><rect x="7" y="7" width="86" height="58" fill="none" stroke="#f2c483" stroke-width="2"/><circle cx="50" cy="36" r="14" fill="#f2c483"/></svg>');

function GhostPreview({ speed }) {
  const [result, setResult] = useState('');
  const pick = useBoardPick(prompt, (ids) => setResult(ids.includes('left') ? 'Dropped on Left.' : 'Dropped on Right.'), { confirm: false });
  const drag = useDragDrop({ pick, promptId: prompt.id, speed });
  return h('div', { className: 'drag-board', onClickCapture: drag.onClickCapture },
    h('button', { type: 'button', className: 'sample-card source', ...drag.sourceProps('card') }, 'Source'),
    h('div', { className: 'slot', 'data-drop': 'left' }, 'Left'),
    h('div', { className: 'slot', 'data-drop': 'right' }, 'Right'),
    h('output', { className: 'drop-result', 'aria-live': 'polite' }, result),
    h(DragGhost, { drag, speed, render: () => h('div', { className: 'sample-card ghost-card' }, 'Source') }),
  );
}

export function mountPreview(container) {
  const root = createRoot(container);
  return (effect, settings) => flushSync(() => root.render(
    effect === 'ghost' ? h(GhostPreview, { speed: settings.speed }) :
      effect === 'ball' ? h(Ball, { id: 'actor', look: settings.look, 'aria-label': 'Ball' }) :
      effect === 'chip' ? h('div', { className: 'chip-board' },
        h('div', null, h(Chip, { src: chipFace, alt: 'Chip' }), h('span', { className: 'sample-label' }, 'Chip')),
        h('div', null, h('div', { className: 'sample-card p3-tilt p3-lying-card' }), h('span', { className: 'sample-label' }, 'Resting card')),
        h('div', null, h('div', { className: 'sample-card p3-tilt p3-lifted-card' }), h('span', { className: 'sample-label' }, 'Lifted card')),
      ) : h('div', { id: 'actor', className: 'dice-actor', key: effect },
        h('span', { 'data-p3-die': effect, 'data-v': settings.value }, h('span', { className: 'flat' }, settings.value))),
  ));
}

// Exercise the same pointer path as a manual drag, including target hit testing.
export function previewDrop(source, target) {
  const point = (el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { clientX: x + width / 2, clientY: y + height / 2 };
  };
  const send = (el, type, at, buttons) => flushSync(() => el.dispatchEvent(
    new globalThis.PointerEvent(type, { bubbles: true, pointerId: -1, buttons, ...at }),
  ));
  const from = point(source), to = point(target);
  to.clientX -= target.clientWidth / 3;
  if (Math.hypot(to.clientX - from.clientX, to.clientY - from.clientY) < DRAG_THRESHOLD_PX) return;
  send(source, 'pointerdown', from, 1);
  send(globalThis, 'pointermove', to, 1);
  send(globalThis, 'pointerup', to, 0);
}
