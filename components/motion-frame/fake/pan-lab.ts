import { createMotionPlayer, createVerbs, scrollPan, type MotionSpec } from '../index.ts';

const photo = new URLSearchParams(location.search).get('photo');
const main = document.querySelector('main')!;
const tab = (id: string): HTMLButtonElement => document.querySelector(`[aria-controls="${id}"]`)!;
const status = document.querySelector('output')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const actor = document.querySelector<HTMLElement>('#actor')!;
const beats: MotionSpec[] = ['Signal', 'Confirm'].map((id) => ({
  id, pan: '#actor', whenReady: true,
  steps: [{ t: 0, dur: 800, actor: 'token', do: 'highlight' }],
}));
for (const button of document.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
  button.onclick = () => {
    for (const other of document.querySelectorAll('[role="tab"]')) {
      other.setAttribute('aria-selected', String(button === other));
      document.getElementById(other.getAttribute('aria-controls')!)!.hidden = button !== other;
    }
    main.scrollTop = 0;
  };
}
const verbs = createVerbs();
verbs.register('highlight', () => {
  actor.dataset.playing = '';
  return () => { delete actor.dataset.playing; };
});
const player = createMotionPlayer({
  specs: {}, stages: { default: () => actor.offsetHeight ? [0, 0, 20, 20] : undefined },
  verbs, speed: () => 1, context: undefined,
  pan: scrollPan({
    scroller: () => main,
    tabs: () => tab('tray'),
    activeTab: () => document.querySelector('[aria-selected="true"]'),
  }),
  onBeatStart: ({ timeline }) => { status.value = timeline.id; },
});
play.onclick = () => {
  player.playRun(beats, { onEnd: () => { status.value = 'Both beats complete'; } });
};
main.scrollTop = 85;
if (photo === 'sheet') {
  const sheet = document.createElement('div');
  sheet.id = 'sheet';
  for (const stage of ['before', 'actor', 'after']) {
    const frame = document.createElement('iframe');
    frame.title = stage;
    frame.src = '?photo=' + stage;
    sheet.append(frame);
  }
  document.body.replaceChildren(sheet);
} else if (photo === 'actor' || photo === 'after') {
  setTimeout(() => { play.click(); }, photo === 'actor' ? 2300 : 0);
}
