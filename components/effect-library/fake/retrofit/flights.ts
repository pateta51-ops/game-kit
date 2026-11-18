import { createMotionPlayer, createVerbs, type Point, type Rect, type Step } from '../../../motion-frame/index.ts';
import { centre, multiStopPath, registerEffects, type EffectCtx } from '../../index.ts';
import type { QuadraticFlight } from '../../paths.ts';

const pass = {
  blend: 0.85, lookAhead: 0.02, nose: 148, rollAxis: 148, rollSquash: 0.15,
  reverseBrightness: 0.62, juke: 26, fadeSlope: 6,
  afterimages: { count: 4, spacing: 28, opacity: 0.32, filter: 'brightness(.85)' },
};

const pathSettings = {
  arrival: {
    dur: 700,
    cubic: {
      controls: [0.18, 0.75, 0.28, 0.7], minLift: 24, startScale: 0.14,
      bank: 65, lean: 32, levelFrom: 0.62, curvature: 14, leanIn: 0.2, fadeIn: 0.12, perspective: 700,
    },
  },
  evasion: [
    { t: 250, dur: 650, from: [930, 790], to: [760, 300], quadratic: { ...pass, control: [700, 560], roll: [0.35, 0.7], side: 1 } },
    { t: 1250, dur: 650, from: [430, 300], to: [330, 800], quadratic: { ...pass, control: [520, 560], roll: [0.3, 0.68], side: -1 } },
    { t: 2250, dur: 520, from: [900, 770], to: [470, 330], quadratic: { ...pass, control: [820, 280], roll: [0.25, 0.6], side: 1 } },
    { t: 2770, dur: 480, from: [470, 330], to: [1280, 110], quadratic: { ...pass, control: [280, 300], blend: 0.7, exitScale: 0.28, exitFade: 0.85 } },
  ] satisfies readonly { t: number; dur: number; from: readonly [number, number]; to: readonly [number, number]; quadratic: QuadraticFlight }[],
  ribbon: { rear: 176 * 0.42, width: 12, tipWidth: 2, fade: 0.7, colour: '200,208,224', samples: 13, spacing: 12 },
  sortie: {
    padding: [52, 32], nose: 0, headingSample: 3, roll: 0.28,
    ghosts: { count: 4, spacing: 24, opacity: 0.18 },
  },
  sortieTimings: {
    loop: { launch: 640, travel: 300, lap: 560, hop: 260, back: 400 },
  },
} as const;

const ease = 'cubic-bezier(0.45, 0, 0.25, 1)';

const glideSettings = {
  card: {
    flightMs: 460, ease: 'cubic-bezier(0.3, 0.7, 0.2, 1)', arcHeight: 48, apex: 0.55,
    glide: { anchor: 'destination', liftRatio: 0.12, progress: 0.55, swell: 0.06, relativeSwell: true, round: 1000, opaque: true },
  },
  token: {
    flightMs: 620, ease, stagger: 110, arcHeight: 60,
    glide: { liftRatio: 0.15, swell: 0.15, opaque: true },
  },
  marker: {
    flightMs: 520, ease, arcHeight: 14,
    glide: { anchor: 'destination', swell: 0.15, plainEnds: true },
  },
} as const;

const waypointSettings = {
  duration: 950,
  viaMultiplier: 1.8,
  rest: [0.4, 0.6],
  ease: 'cubic-bezier(0.45, 0, 0.25, 1)',
  stagger: 70,
  staggerMax: 8,
  staggerUnscaled: true,
} as const;

const resolve = (id: string) => document.getElementById(id) ?? undefined;
const stage = (id: string): Rect | undefined => {
  const box = resolve(id)?.getBoundingClientRect();
  return box && [box.x, box.y, box.width, box.height];
};
const verbs = createVerbs<EffectCtx>();
const layer = registerEffects(verbs, { resolve });
const player = createMotionPlayer({
  specs: {}, stages: { default: stage }, verbs, speed: () => 1, context: layer,
  onBeatEnd: (run) => layer.end(run),
  onProblem: (message) => console.error(message),
});

function play(): void {
  player.skipAll();
  const panel = stage('flight-curves')!;
  const unit = Math.min(panel[2] / 1400, panel[3] / 920);
  const point = ([x, y]: Point): Point => [panel[0] + (panel[2] - 1400 * unit) / 2 + x * unit, panel[1] + y * unit];
  const ship = (id: string, at: Point) => ({ id, at, w: 176 * unit, h: 100 * unit });
  const home = point([220, 690]);
  const sortieHome = point([240, 530]);
  const sortie = {
    ...pathSettings.sortie, ...pathSettings.sortieTimings.loop,
    padding: [pathSettings.sortie.padding[0] * unit, pathSettings.sortie.padding[1] * unit] as const,
    stops: [[675, 425], [1040, 540]].map(([x, y]) => ({ box: [...point([x!, y!]), 100 * unit, 70 * unit] as const, laps: 1 })),
  };
  const actors = [ship('arrival-ship', home), ship('sortie-ship', sortieHome)];
  const steps: Step[] = [
    { t: 0, actor: 'arrival-ship', do: 'arc-move', to: point([550, 225]), ...pathSettings.arrival, then: 'hide' },
    { t: 0, actor: 'sortie-ship', do: 'multi-stop-path', dur: multiStopPath(sortieHome, sortie).finish, path: sortie },
  ];
  for (const [i, pass] of pathSettings.evasion.entries()) {
    const actor = `pass-ship-${String(i)}`;
    const trail = `pass-trail-${String(i)}`;
    const { t, dur, from, to } = pass;
    const quadratic = { ...pass.quadratic, control: point(pass.quadratic.control), juke: (pass.quadratic.juke ?? 0) * unit };
    const { width, tipWidth, rear } = pathSettings.ribbon;
    actors.push(ship(actor, point(from)));
    actors.push({ ...ship(trail, point(from)), w: 0, h: 0 });
    steps.push({ t, dur, actor: trail, do: 'trail', to: point(to), ribbon: { ...pathSettings.ribbon, quadratic, width: width * unit, tipWidth: tipWidth * unit, rear: rear * unit } });
    steps.push({ t, dur, actor, do: 'arc-move', to: point(to), quadratic, then: 'hide' });
  }

  const tokens = ['token-a', 'token-b', 'token-c'];
  const cards = ['via-a', 'via-b'];
  const viaMs = waypointSettings.duration * waypointSettings.viaMultiplier;
  const token = glideSettings.token;
  const tableActors = ['hand-card', 'glide-marker', ...tokens, ...cards].map((id) => ({ id, at: id }));
  steps.push(
    { t: 0, dur: glideSettings.card.flightMs, actor: 'hand-card', do: 'arc-move', to: 'hand-target', ...glideSettings.card, landingWidth: stage('hand-target')![2] },
    { t: 0, dur: glideSettings.marker.flightMs, actor: 'glide-marker', do: 'arc-move', to: 'marker-target', ...glideSettings.marker },
    ...tokens.map((id, i) => ({
      t: 0, dur: token.flightMs + i * token.stagger, actor: id, do: 'arc-move', to: 'token-target',
      ...token, staggerGroup: 'tokens', clipPath: 'polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%)',
    })),
    ...cards.map((id, i) => ({
      t: 0, dur: viaMs + i * waypointSettings.stagger, actor: id, do: 'arc-move', to: 'via-target',
      ...waypointSettings, staggerGroup: 'cards', flightMs: viaMs, via: { point: centre(stage('via-rest')!), rest: waypointSettings.rest, width: stage('via-rest')![2] },
      landingWidth: stage('via-target')![2],
    })),
  );
  player.play({ id: 'flight-lab', maxMs: 3500, actors: [...actors, ...tableActors], steps });
}

const params = new URLSearchParams(location.search);
if (!params.has('frame') && !params.has('beams') && !params.has('rotations') && !params.has('signals')) {
  document.querySelector('button')?.addEventListener('click', play);
  play();
}
