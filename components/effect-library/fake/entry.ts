import { createMotionPlayer, createVerbs, withReducedMotion, type MotionSpec } from '../../motion-frame';
import { registerEffect, registerEffects, type EffectCtx } from '../index';

// Runs one step of `verb` on an actor over a 200 ms call, either to its natural end or skipped half way; returns what is left.
async function runOne(verb: string, extra: Record<string, unknown>, skip: boolean, actorExtra: Record<string, unknown> = {}) {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve: (id) => document.getElementById(id) ?? undefined });
  let kept: HTMLElement | undefined;
  let anims = -1;
  let mid: HTMLElement | undefined;
  let midShadow = '';
  let midTransform = '';
  let midOpacity = '';
  const player = createMotionPlayer({
    specs: {},
    stages: { default: (z) => (z === 'b' ? [300, 200, 100, 80] : undefined) },
    verbs,
    speed: () => 1,
    context: layer,
    onBeatEnd: (run) => {
      anims = layer.el.querySelector<HTMLElement>('.fx-actor')?.getAnimations().length ?? -1;
      kept = layer.el.querySelector<HTMLElement>('.fx-actor')?.cloneNode(true) as HTMLElement | undefined;
      layer.end(run);
    },
  });
  const spec: MotionSpec = {
    id: verb,
    maxMs: 400,
    actors: [{ id: 'a', at: [50, 50], w: 40, h: 30, hidden: verb === 'fade-in', ...actorExtra }],
    steps: [{ t: 0, dur: 200, actor: 'a', do: verb, ...extra }],
  };
  await new Promise<void>((done) => {
    player.play(spec, { onEnd: done });
    setTimeout(() => {
      mid = layer.el.querySelector<HTMLElement>('.fx-actor') ?? undefined;
      if (mid) ({ boxShadow: midShadow, transform: midTransform, opacity: midOpacity } = getComputedStyle(mid));
    }, 100);
    if (skip) setTimeout(() => player.skipAll(), 80);
  });
  const left = layer.el.querySelectorAll('.fx-actor').length;
  const s = kept?.style;
  return {
    left,
    anims,
    midShadow,
    midTransform,
    midOpacity,
    veil: kept?.classList.contains('fx-veil') ?? null,
    bg: s?.background ?? null,
    label: kept?.getAttribute('data-fx-label') ?? null,
    style: s ? { left: s.left, top: s.top, opacity: s.opacity, visibility: s.visibility, transform: s.transform, scale: s.scale, translate: s.translate, boxShadow: s.boxShadow } : null,
    flipped: kept?.hasAttribute('data-fx-flipped') ?? null,
    text: kept?.textContent ?? null,
  };
}

// scale and flip at once on one actor, and the run handed to resolve
async function together(skip = false, verb = 'flip') {
  const verbs = createVerbs<EffectCtx>();
  const seen: string[] = [];
  const layer = registerEffects(verbs, { resolve: (id, run) => (seen.push(`${id} ${run.timeline.id}`), undefined) });
  let mid = { scale: '', transform: '' };
  let end = '';
  const player = createMotionPlayer({
    specs: {},
    stages: { default: () => undefined },
    verbs,
    speed: () => 1,
    context: layer,
    onBeatEnd: (run) => {
      end = layer.el.querySelector<HTMLElement>('.fx-actor')?.style.scale ?? '';
      layer.end(run);
    },
  });
  await new Promise<void>((done) => {
    player.play(
      { id: 'tg', maxMs: 300, actors: [{ id: 'a', at: [50, 50], w: 40, h: 30 }], steps: [{ t: 0, dur: 200, actor: 'a', do: 'scale', to: 2 }, { t: 0, dur: 200, actor: 'a', do: verb }] },
      { onEnd: done },
    );
    setTimeout(() => {
      const a = layer.el.querySelector<HTMLElement>('.fx-actor');
      if (a) mid = { scale: getComputedStyle(a).scale, transform: getComputedStyle(a).transform };
    }, 100);
    if (skip) setTimeout(() => player.skipAll(), 50);
  });
  return { mid, end, seen };
}

// a stand-in exists from the beat's start when the game calls layer.start, not before the first verb otherwise
async function early(start: boolean) {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  let at50 = -1;
  const player = createMotionPlayer({
    specs: {},
    stages: { default: () => undefined },
    verbs,
    speed: () => 1,
    context: layer,
    onBeatStart: (run) => {
      if (start) layer.start(run);
    },
    onBeatEnd: (run) => layer.end(run),
  });
  await new Promise<void>((done) => {
    player.play({ id: 'e', maxMs: 300, actors: [{ id: 'a', at: [10, 10], w: 5, h: 5 }], steps: [{ t: 150, dur: 50, actor: 'a', do: 'show' }] }, { onEnd: done });
    setTimeout(() => {
      at50 = layer.el.querySelectorAll('.fx-actor').length;
    }, 50);
  });
  return at50;
}

async function own() {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  const log: string[] = [];
  registerEffect(verbs, 'pop', ({ el, animate }) => {
    animate([{ opacity: 0 }, { opacity: 1 }], { opacity: '1' });
    return () => log.push(`done ${el.className}`);
  });
  const player = createMotionPlayer({
    specs: {},
    stages: { default: () => undefined },
    verbs,
    speed: () => 1,
    context: layer,
    onProblem: (m) => log.push(m),
  });
  await new Promise<void>((done) =>
    player.play({ id: 'o', maxMs: 100, actors: [{ id: 'a', at: [10, 10], w: 5, h: 5 }], steps: [{ t: 0, dur: 50, actor: 'a', do: 'pop' }] }, { onEnd: done }),
  );
  return { log, names: verbs.names() };
}

async function reduced() {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  const cues: string[] = [];
  const player = createMotionPlayer({ specs: {}, stages: { default: () => undefined }, verbs, speed: () => withReducedMotion(1), context: layer, onCue: (c) => cues.push(c) });
  const t0 = performance.now();
  await new Promise<void>((done) =>
    player.play({ id: 'r', maxMs: 100, actors: [{ id: 'a', at: [10, 10], w: 5, h: 5 }], steps: [{ t: 0, dur: 500, actor: 'a', do: 'fade-in' }], sound: [{ t: 0, cue: 'c' }] }, { onEnd: done }),
  );
  return { ms: performance.now() - t0, actors: layer.el.querySelectorAll('.fx-actor').length, cues };
}

(window as unknown as Record<string, unknown>)['fxTest'] = { runOne, own, reduced, together, early };
