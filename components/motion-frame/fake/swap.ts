import { createMotionPlayer, createVerbs, type MotionSpec } from '../index.ts';

const board = document.querySelector('main')!;
const event = document.querySelector('#event')!;
const spec: MotionSpec = {
  id: 'board', steps: [], maxMs: 1800,
  swap: { dur: 1100, stagger: 260, enter: 'from', leave: 'ghost' },
};
const piece = (key: string, label: string): string =>
  `<div class="piece" data-motion-key="${key}" data-motion-from="#reserve">${label}</div>`;
function draw(after: boolean): void {
  board.innerHTML = `
    <section><h2>Reserve</h2><div class="piece" id="reserve">Draw pile</div></section>
    <section><h2>Left</h2>${after ? '' : piece('move', 'Scout')}</section>
    <section><h2>Center</h2>${after ? piece('move', 'Scout') : piece('leave', 'Guard')}</section>
    <section><h2>Right</h2>${after ? piece('new', 'Courier') : ''}</section>`;
}
draw(false);
const player = createMotionPlayer({
  specs: { board: spec }, stages: {}, verbs: createVerbs(), speed: () => 1, context: undefined,
  onBeatStart: (run) => { event.textContent = String(run.data); },
  onBeatEnd: () => { event.textContent += ' · Landed'; },
});
let after = false;
document.querySelector('#swap')!.addEventListener('click', () => {
  after = !after;
  const next = after;
  player.play('board', { commit: () => draw(next), data: next ? 'Scout advances · Courier arrives · Guard leaves' : 'Board resets' });
});
document.querySelector('#skip')!.addEventListener('click', () => { player.skipAll(); });
