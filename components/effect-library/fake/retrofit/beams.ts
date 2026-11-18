import { createMotionPlayer, createVerbs, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('beams')) {
  const resolve = (id: string) => document.getElementById(id) ?? undefined;
  const stage = (id: string): Rect | undefined => {
    const r = resolve(id)?.getBoundingClientRect();
    return r && [r.left, r.top, r.width, r.height];
  };
  const ids = ['transfer', 'radial', 'collapse', 'column', 'beacon'];
  const actors = ids.map((id) => ({ id, at: id }));
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve: (id) => id === 'radial' || id === 'beacon' ? undefined : resolve(id) });
  const player = createMotionPlayer({ specs: {}, stages: { default: stage }, verbs, context: layer,
    speed: () => 1, onBeatEnd: (run) => layer.end(run), onProblem: (message) => console.error(message) });
  const steps: Step[] = [
    { t: 0, actor: 'transfer', do: 'warp-transfer', dur: 2600, to: 'transfer-to', destination: stage('transfer-to'), count: 3, colour: '213 188 143',
      totalLabel: { text: '+3', at: [stage('transfer-to')![0], stage('transfer-to')![1] + stage('transfer-to')![3] + 8], colour: '#ead6aa' } },
    { t: 0, actor: 'radial', do: 'radial-streaks', dur: 1700, count: 65, unit: .27, palette: ['207,185,249', '171,207,218', '229,224,211'] },
    { t: 0, actor: 'collapse', do: 'collapse-jump', dur: 1500, to: 'collapse-to', colour: '#d8e9cd', n: 16 },
    { t: 0, actor: 'column', do: 'column-beam', dur: 1000, colour: '197 173 239', way: 'in', tuck: 18, core: true },
    { t: 0, actor: 'beacon', do: 'rotating-beam', dur: 1600, colour: '255 200 150', turns: 2 },
  ];
  const play = (): void => {
    player.skipAll();
    player.play({ id: 'beam-lab', actors, steps });
  };
  document.querySelector('button')?.addEventListener('click', play);
  play();
}
