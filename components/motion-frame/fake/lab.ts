import { createMotionPlayer, createVerbs, mountMotionLab, releaseOnInput, stageFromLayout, type Layout, type MotionSpec } from '../index.ts';
import gain from './gain.json';
import roll from './roll.json';
import layout from './stage.layout.json';

const specs: Record<string, MotionSpec> = {
  picture: { ...gain as unknown as MotionSpec, whenReady: true, holdUntil: 'press' },
  next: roll as unknown as MotionSpec,
};
const stage = stageFromLayout(layout as unknown as Layout);
const root = document.querySelector<HTMLElement>('#lab')!;
const status = document.querySelector<HTMLElement>('#status')!;
const draw = document.querySelector<HTMLButtonElement>('#draw')!;
const skip = document.querySelector<HTMLButtonElement>('#skip')!;
let drawn = false;
const player = createMotionPlayer({
  specs,
  stages: { table: (zone) => zone === 'tray' && !drawn ? undefined : stage(zone) },
  verbs: createVerbs(),
  speed: () => 1,
  context: undefined,
  onBeatStart: (run) => { status.textContent = run.timeline.id === gain.id ? 'Playing piece gained' : 'Playing roll'; },
  onBeatEnd: () => { status.textContent = player.held() ? 'Press to continue' : 'Ready'; },
  onProblem: (message) => { status.textContent = message; },
});
mountMotionLab(root, { specs, player });
const buttons = root.querySelectorAll('button');
buttons[0]?.addEventListener('click', () => {
  drawn = false;
  status.textContent = 'Waiting for tray. Press Draw tray.';
  player.play('next');
});
draw.addEventListener('click', () => { drawn = true; });
skip.addEventListener('click', () => {
  player.skipAll();
  status.textContent = 'Ready';
});
releaseOnInput(player, window);
