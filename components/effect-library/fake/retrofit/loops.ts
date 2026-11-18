import { createMotionPlayer, createVerbs, withReducedMotion, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('loops')) {
  document.documentElement.classList.add('loops-only');
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const rect = resolve(id)?.getBoundingClientRect();
    return rect && [rect.x, rect.y, rect.width, rect.height];
  };
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, {
    resolve,
    onActor: (_, clone, id) => {
      if (id !== 'refresh') return;
      const template = document.querySelector<HTMLTemplateElement>('#banner-template');
      if (template) clone.append(template.content.cloneNode(true));
    },
  });
  const actors: EffectActor[] = ['refresh', 'pulse', 'bob', 'breathe', 'orbit'].map((id) => ({ id, at: id, hideSource: 'start' }));
  const steps: Step[] = [
    { t: 0, dur: 660, actor: 'refresh', do: 'refresh', banner: '.loop-banner', liftMs: 560, drainMs: 520,
      lineBackground: 'linear-gradient(90deg, transparent, white, transparent)', lineShadow: '0 0 12px #f2eef5' },
    { t: 0, dur: 3600, actor: 'pulse', do: 'pulse', period: 1200,
      frames: [{ outlineColor: '#cab9d9' }, { outlineColor: '#cab9d944' }, { outlineColor: '#cab9d9' }] },
    { t: 0, dur: 3600, actor: 'bob', do: 'idle', kind: 'bob', rise: 24, period: 1500 },
    { t: 0, dur: 3600, actor: 'breathe', do: 'idle', kind: 'breathe', period: 1500,
      frames: [{ boxShadow: '0 0 5px #cab9d9' }, { boxShadow: '0 0 26px 8px #cab9d9' }, { boxShadow: '0 0 5px #cab9d9' }] },
    { t: 0, dur: 3600, actor: 'orbit', do: 'idle', kind: 'orbit', period: 2200,
      orbit: { referenceWidth: 140, radii: [58, 14], centerY: -10, size: [7, 10], track: '#cab9d966', spin: 0.6 } },
  ];
  const frame = params.get('frame');
  const speed = frame === null ? 1 : 100;
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, speed: () => withReducedMotion(speed), context: layer,
    onBeatStart: (run) => layer.start(run, actors),
    onBeatEnd: (run) => layer.end(run),
    onProblem: (message) => console.error(message),
  });
  let seek: ReturnType<typeof setTimeout>;
  const play = (): void => {
    clearTimeout(seek);
    player.skipAll();
    player.play({ id: 'loops', actors, steps });
    if (frame !== null) seek = setTimeout(() => {
      for (const animation of layer.el.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Number(frame) * speed;
      }
    }, 60);
  };
  document.querySelector('button')?.addEventListener('click', play);
  if (frame !== 'still') play();
}
