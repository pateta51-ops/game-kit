import { createMotionPlayer, createVerbs, withReducedMotion, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('finish')) {
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.x, r.y, r.width, r.height];
  };
  const actors: EffectActor[] = [
    { id: 'finish-sheen', at: 'finish-sheen', hideSource: 'start' },
    { id: 'finish-drift', at: 'finish-drift', hideSource: 'start' },
  ];
  const steps: Step[] = [
    { t: 0, dur: 3200, actor: 'finish-sheen', do: 'sheen', angle: 110, bandWidth: 45, stops: [25, 75], colour: '#ecf4ff70', loop: true, period: 1500 },
    { t: 0, dur: 3200, actor: 'finish-drift', do: 'idle', kind: 'drift', drift: { x: 42, y: -28, scale: 1.1 }, period: 2200 },
    { t: 0, dur: 1400, actor: 'finish-slash', do: 'slash', width: 18, colour: ['170,195,255', '215,198,255'], stagger: 170, drawMs: 360, fade: [650, 1000] },
  ];
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve });
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, speed: () => withReducedMotion(1), context: layer,
    onBeatStart: (run) => layer.start(run, actors),
    onBeatEnd: (run) => layer.end(run),
    onProblem: (message) => console.error(message),
  });
  const play = (): void => {
    player.skipAll();
    player.play({ id: 'finish-lab', actors, steps });
  };
  document.querySelector('button')?.addEventListener('click', play);
  if (!params.has('still')) play();
}
