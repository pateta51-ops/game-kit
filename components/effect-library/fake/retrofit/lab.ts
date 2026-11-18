import { createMotionPlayer, createVerbs, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';
import { seventhInning as preset } from '../../presets/seventh-inning.ts';

const { look } = preset;
for (const [name, value] of Object.entries(look)) document.documentElement.style.setProperty(`--${name}`, value);

const resolve = (id: string) => document.getElementById(id) ?? undefined;
const stage = (id: string): Rect | undefined => {
  const rect = resolve(id)?.getBoundingClientRect();
  return rect && [rect.x, rect.y, rect.width, rect.height];
};
const actors: EffectActor[] = ['ball', 'card', 'lamp', 'plates', 'pennant', 'die'].map((id) => ({
  id, at: id, ...(id === 'die' && { hideSource: preset.hideSource }), ...(id === 'pennant' && { hidden: true }),
}));
const verbs = createVerbs<EffectCtx>();
const layer = registerEffects(verbs, { resolve: (id) => id === 'plates' ? undefined : resolve(id) });
const params = new URLSearchParams(location.search);
const steps: Step[] = [
  { t: 0, dur: 1300, actor: 'ball', do: 'arc-move', to: 'landing', ...preset.arcMove },
  { t: 0, dur: 1300, actor: 'ball', do: 'scale', to: 0.2 },
  { t: 0, dur: 1300, actor: 'card', do: 'glow', ...preset.glow },
  { t: 0, dur: 1300, actor: 'lamp', do: 'flip', ...preset.flip },
  { t: 0, dur: 1300, actor: 'plates', do: 'shake-group', ...preset.shakeGroup },
  { t: 0, dur: 1300, actor: 'pennant', do: 'unroll', ...preset.unroll },
  { t: 300, dur: 1000, actor: 'die', do: 'move', to: 'tray' },
];
const player = createMotionPlayer({
  specs: {}, stages: { default: stage }, verbs, speed: () => params.has('frame') ? 100 : 1, context: layer,
  onBeatStart: (run) => layer.start(run, actors),
  onBeatEnd: (run) => layer.end(run),
  onProblem: (message) => console.error(message),
});
function play(): void {
  player.skipAll();
  player.play({ id: 'motion-lab', actors, steps: params.has('frame') ? steps.map((s) => ({ ...s, t: 0 })) : steps });
  if (params.has('frame')) setTimeout(() => {
    const frame = Number(params.get('frame'));
    for (const animation of document.getAnimations()) {
      animation.pause();
      const delay = animation.effect?.getTiming().duration === 100000 ? 300 : 0;
      animation.currentTime = Math.max(0, frame - delay) * 100;
    }
  }, 50);
}
document.querySelector('button')?.addEventListener('click', play);
if (params.get('frame') !== 'before') play();
