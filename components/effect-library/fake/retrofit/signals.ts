import { createMotionPlayer, createVerbs, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('signals')) {
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.x, r.y, r.width, r.height];
  };
  const actors: EffectActor[] = ['stamp', 'motes', 'flicker', 'bar'].map((key) => ({
    id: `signal-${key}`, at: `signal-${key}`, ...(['motes', 'flicker'].includes(key) && { hideSource: 'step' }),
    ...(key === 'flicker' && { opacity: .99 }),
  }));
  const steps: Step[] = [
    { actor: 'signal-stamp', t: 0, dur: 1000, ms: 400, do: 'stamp', text: 'APPROVED', tilt: -8,
      style: { height: '23%', background: '#242230', color: '#ded5ff', fontSize: 'clamp(9px,.8vw,30px)' } },
    { actor: 'signal-motes', t: 0, dur: 1000, do: 'motes', count: 32, size: 10, colour: '#d8c8ff',
      dissolve: [{ opacity: 1 }, { opacity: .9, filter: 'brightness(1.8)', offset: .3 }, { opacity: 0, filter: 'brightness(2.5) blur(2px)' }] },
    { actor: 'signal-flicker', t: 0, dur: 1000, do: 'flicker', times: 3, grey: { brightness: .75 }, colour: 'rgb(190 190 190 / .2)', style: { borderRadius: '.25rem' } },
    { actor: 'signal-bar', t: 0, dur: 1000, do: 'bar-fill', from: .12, to: .88, colour: '#c7b6ff' },
  ];
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve });
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, speed: () => params.has('frame') ? 100 : 1, context: layer,
    onBeatStart: (run) => layer.start(run, actors),
    onBeatEnd: (run) => layer.end(run),
    onProblem: (message) => console.error(message),
  });
  const play = (): void => {
    player.skipAll();
    player.play({ id: 'signals', actors, steps });
    if (params.has('frame')) setTimeout(() => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = Number(params.get('frame')) * 100;
      }
    }, 50);
  };
  document.querySelector('button')?.addEventListener('click', play);
  play();
}
