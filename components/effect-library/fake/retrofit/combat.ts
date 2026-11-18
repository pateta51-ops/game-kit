import { createMotionPlayer, createVerbs, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

if (new URLSearchParams(location.search).has('combat')) {
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.left, r.top, r.width, r.height];
  };
  const ids = ['shot-source', 'dissolve', 'shatter', 'shimmer', 'shield-bubble', 'ring-pulse'];
  const actors: EffectActor[] = ids.map((id) => ({
    id, at: id, ...(id === 'dissolve' || id === 'shatter' ? { hideSource: 'step' } : { hidden: true }),
  }));
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve });
  const player = createMotionPlayer({ specs: {}, stages: { default: stage }, verbs, context: layer,
    speed: () => 1, onBeatStart: (run) => layer.start(run, actors), onBeatEnd: (run) => layer.end(run),
    onProblem: (message) => console.error(message) });
  const steps: Step[] = [
    { t: 0, actor: 'shot-source', do: 'projectile', to: 'shot-target', dur: 1100, travelMs: 500, colour: '200 181 230' },
    { t: 0, actor: 'dissolve', do: 'dissolve', dur: 1550, cols: 6, embers: 24, heat: '193 188 244', emberColour: '220 216 252' },
    { t: 0, actor: 'shatter', do: 'shatter', dur: 1400, delay: 210, ms: 950, unit: .8, hotColour: '220 211 247' },
    { t: 0, actor: 'shimmer', do: 'shimmer', dur: 1200, delay: 120, colour: '186 173 228' },
    { t: 0, actor: 'shield-bubble', do: 'shield-bubble', dur: 1300, hit: 170, hitAngle: -2.4, breaks: true, colour: '176,162,216', cellColour: '207,191,244' },
    { t: 0, actor: 'ring-pulse', do: 'ring-pulse', dur: 1300, count: 2, colour: '206 223 225', shadow: '0 0 24px #d0e2ea' },
  ];
  const play = (): void => {
    player.skipAll();
    player.play({ id: 'combat-lab', actors, steps });
  };
  document.querySelector('button')?.addEventListener('click', play);
  play();
}
