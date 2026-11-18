import { createMotionPlayer, createVerbs, withReducedMotion, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

if (new URLSearchParams(location.search).has('lines')) {
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.x, r.y, r.width, r.height];
  };
  const actors: EffectActor[] = [{ id: 'type-source', at: 'type-source', hideSource: 'start' }];
  const steps: Step[] = [
    { t: 0, dur: 2400, actor: 'type-source', do: 'text', text: resolve('type-source')?.textContent, typewriter: { unit: 'word', pace: 140, rise: false } },
    { t: 0, dur: 2400, actor: 'dash-a', do: 'dash-line', from: 'dash-a', to: 'dash-b', dash: 24, gap: 16, speed: 90, width: 4, colour: '#ddd6ee' },
    { t: 0, dur: 1800, actor: 'lock-target', do: 'reticle', padding: [48, 10], length: 35, width: 4, colour: '218,211,234', closeMs: 550, fade: [1000, 1800] },
    { t: 0, dur: 1850, actor: 'fall-origin', do: 'debris', count: 24, spread: [190, 85], gravity: 220, spin: 230, size: [24, 11], colour: '#bbb1d0', ms: 1850, fade: [1120, 1850] },
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
    player.play({ id: 'lines-lab', actors, steps });
  };
  document.querySelector('button')?.addEventListener('click', play);
  play();
}
