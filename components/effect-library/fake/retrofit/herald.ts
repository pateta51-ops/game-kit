import { createMotionPlayer, createVerbs, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('herald')) {
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.x, r.y, r.width, r.height];
  };
  const actors: EffectActor[] = ['collapse', 'count', 'banner', 'glow', 'stamp'].map((k) => ({ id: `herald-${k}`, at: `herald-${k}` }));
  const steps: Step[] = [
    { actor: 'herald-collapse', t: 0, dur: 1600, do: 'unroll', reverse: true, axis: 'y', colour: '#df7187', lineMs: 200, gutter: 3 },
    { actor: 'herald-count', t: 0, dur: 1600, do: 'count', from: 0, to: 128, suffix: ' VP', colour: '#9ccd88' },
    { actor: 'herald-banner', t: 0, dur: 1600, do: 'banner', text: 'ACT II', unrollMs: 400, fadeMs: 400 },
    { actor: 'herald-glow', t: 0, dur: 1600, do: 'glow', to: 'off', colour: '#9fe9ef' },
    { actor: 'herald-stamp', t: 0, dur: 1600, do: 'stamp', text: 'DEFEAT', ms: 500, cracked: true, style: { background: '#4a2a22', color: '#f0c9a0' } },
  ];
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve });
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, speed: () => 1, context: layer,
    onBeatStart: (run) => layer.start(run, actors),
    onBeatEnd: (run) => layer.end(run),
    onProblem: (message) => console.error(message),
  });
  const play = (): void => {
    player.skipAll();
    player.play({ id: 'herald', actors, steps });
  };
  document.querySelector('button')?.addEventListener('click', play);
  play();
}
