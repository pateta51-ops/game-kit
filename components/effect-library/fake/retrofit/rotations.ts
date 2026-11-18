import { createMotionPlayer, createVerbs, withReducedMotion, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('rotations')) {
  const frame = params.get('frame');
  const dur = 800;
  const speed = frame === null ? 1 : 100;
  const steps: Step[] = [
    { t: 0, dur, do: 'spin', actor: 'spin-sample', turns: 1.5, scaleFrom: .6, ease: 'out' },
    { t: 0, dur: 2400, do: 'spin', actor: 'loop-sample', endless: true, period: dur },
    { t: 0, dur: 450, do: 'tap', actor: 'tap-sample', overshoot: 6 },
    { t: 0, dur, do: 'untap', actor: 'untap-sample' },
  ];
  const actors: EffectActor[] = steps.map(({ actor }) => ({ id: actor, at: actor, hideSource: 'start' }));
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.x, r.y, r.width, r.height];
  };
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve });
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, speed: () => withReducedMotion(speed), context: layer,
    onBeatStart: (run) => layer.start(run, actors),
    onProblem: (message) => console.error(message),
  });

  function replay(): void {
    player.skipAll();
    layer.clear();
    player.play({ id: 'rotations', actors, steps });
    if (frame !== null) setTimeout(() => {
      for (const animation of layer.el.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Number(frame) * speed;
      }
    }, 50);
  }

  document.querySelector('button')?.addEventListener('click', replay);
  replay();
}
