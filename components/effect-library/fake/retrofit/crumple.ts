import { createMotionPlayer, createVerbs, type Rect, type Step } from '../../../motion-frame/index.ts';
import { registerEffects, type EffectActor, type EffectCtx } from '../../index.ts';

const params = new URLSearchParams(location.search);
const panel = document.getElementById('crumple-lab');

if (panel && params.has('crumple')) {
  document.documentElement.classList.add('crumple-only');
  const ids = ['fold-piece', 'fade-piece'];
  const stage = (id: string): Rect | undefined => {
    const box = document.getElementById(id)?.getBoundingClientRect();
    return box && [box.x, box.y, box.width, box.height];
  };
  for (const id of ids) {
    const card = document.querySelector<HTMLCanvasElement>(`#${id}`);
    const ctx = card?.getContext('2d');
    if (!card || !ctx) continue;
    ctx.fillStyle = '#e6d9bf';
    ctx.fillRect(0, 0, card.width, card.height);
    ctx.fillStyle = '#363948';
    ctx.fillRect(18, 18, card.width - 36, card.height - 36);
    ctx.strokeStyle = '#e6d9bf';
    ctx.lineWidth = 4;
    for (let radius = 20; radius <= 94; radius += 14) {
      ctx.beginPath();
      ctx.arc(card.width / 2, card.height / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve: (id) => document.getElementById(id) ?? undefined });
  const actors: EffectActor[] = ids.map((id) => ({ id, at: id, hideSource: 'start', hidden: true }));
  const player = createMotionPlayer({
    specs: {}, stages: { default: stage }, verbs, context: layer, speed: () => Number(params.get('speed')) || 1,
    onBeatStart: (run) => layer.start(run, actors),
    onBeatEnd: (run) => layer.end(run),
    onProblem: (message) => console.error(message),
  });
  function play(): void {
    player.skipAll();
    const steps: Step[] = ids.map((id, i) => ({
      do: 'crumple', actor: id, t: 0, dur: 1800, image: document.getElementById(id),
      destination: stage(`${id}-target`),
      seed: 24, creases: 8, fadeOut: i === 1 ? [1080, 1350] : false,
      shadow: { colour: 'rgb(0 0 0 / .65)', blur: .03, offset: [.025, .17], side: .4, alpha: [.85, .45], width: 1.05 },
    }));
    player.play({ id: 'crumple-lab', actors, steps });
  }
  document.querySelector('header button')?.addEventListener('click', play);
}
