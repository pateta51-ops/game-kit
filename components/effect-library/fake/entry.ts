import { createMotionPlayer, createVerbs, withReducedMotion, type MotionSpec, type Speed } from '../../motion-frame/index.ts';
import { createAmbience, particles, registerCanvasEffect, registerEffect, registerEffects, type EffectActor, type EffectCtx } from '../index.ts';

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
  let midScale = '';
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
      if (mid) ({ boxShadow: midShadow, transform: midTransform, opacity: midOpacity, scale: midScale } = getComputedStyle(mid));
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
    midScale,
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
    const sample = (): void => {
      const a = layer.el.querySelector<HTMLElement>('.fx-actor');
      const t = Number(a?.getAnimations()[0]?.currentTime ?? 0);
      if (a && t >= 100) mid = { scale: getComputedStyle(a).scale, transform: getComputedStyle(a).transform };
      else if (t < 190) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
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

async function sourceCut(redraw = false) {
  const sources = ['a', 'b'].map(id => {
    const source = document.createElement('div');
    source.id = id;
    source.style.cssText = 'position:fixed;width:20px;height:20px;background:teal;visibility:visible!important';
    if (!redraw) document.body.append(source);
    return source;
  });
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs, { resolve: id => sources.find(source => source.id === id) });
  const started: string[] = [], move = verbs.get('move')!;
  let launchAt = 0, ready = !redraw;
  verbs.register('move', (call, run) => { started.push(call.actor); if (call.actor === 'a') launchAt = performance.now(); return move(call, run); });
  const actors: EffectActor[] = sources.map((source, i) => ({ id: source.id, at: [50, 50 + i * 40], w: 20, h: 20, hideSource: 'step' }));
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => ready ? [0, 0, 1, 1] : undefined }, verbs, speed: () => 1, context: layer,
    onBeatStart: run => layer.start(run, actors), onBeatEnd: run => layer.end(run),
  });
  let mid = { visibility: [] as string[], running: false };
  await new Promise<void>((done, fail) => {
    let cut = false, sampled = false;
    player.play({ id: 'source-cut', actors, ...(redraw ? { awaitRects: ['ready'] } : {}), steps: [
      { actor: 'a', do: 'move', t: 0, dur: 1200, to: [250, 50] },
      { actor: 'b', do: 'move', t: 400, dur: 200, to: [250, 90] },
    ] }, {
      ...(redraw ? { commit: () => requestAnimationFrame(() => requestAnimationFrame(() => { document.body.append(...sources); ready = true; })) } : {}),
      onEnd: () => sampled ? done() : fail(new Error('native source sample did not run before the beat ended')),
    });
    const frame = (): void => {
      const animation = layer.el.querySelector<HTMLElement>('.fx-actor')?.getAnimations()[0];
      if (!cut && animation?.playState === 'running') { cut = true; player.skipAll({ finishStep: true }); }
      if (cut && performance.now() - launchAt >= 600) {
        sampled = true;
        mid = { visibility: sources.map(source => getComputedStyle(source).visibility), running: animation?.playState === 'running' };
      } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const result = {
    started, mid, after: sources.map(source => getComputedStyle(source).visibility),
    priorities: sources.map(source => source.style.getPropertyPriority('visibility')),
    clones: layer.el.querySelectorAll('.fx-actor').length, animations: layer.el.getAnimations({ subtree: true }).length,
  };
  layer.clear(); layer.el.remove(); sources.forEach(source => source.remove());
  return result;
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

async function canvas(skip: boolean) {
  const verbs = createVerbs<EffectCtx>();
  const layer = registerEffects(verbs);
  let frames = 0;
  let at: number[] = [];
  registerCanvasEffect(verbs, 'burst', (ctx, t, fx) => {
    frames += 1;
    at = [fx.x, fx.y];
    particles.sparks(ctx, t, { seed: 1, n: 8, x: fx.x, y: fx.y, t0: 0 });
  });
  const player = createMotionPlayer({ specs: {}, stages: { default: () => undefined }, verbs, speed: () => 0.5, context: layer, onBeatEnd: (run) => layer.end(run) });
  let mid = -1;
  await new Promise<void>((done) => {
    player.play({ id: 'cv', maxMs: 400, actors: [{ id: 'a', at: [50, 50], w: 40, h: 30 }], steps: [{ t: 0, dur: 300, actor: 'a', do: 'burst' }] }, { onEnd: done });
    setTimeout(() => {
      mid = layer.el.querySelectorAll('canvas.fx-canvas').length;
    }, 20);
    if (skip) setTimeout(() => player.skipAll(), 40);
  });
  return { mid, after: layer.el.querySelectorAll('canvas').length, frames, at, actors: layer.el.querySelectorAll('.fx-actor').length, names: verbs.names() };
}

async function ambience() {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:20px;top:30px;width:200px;height:100px';
  document.body.appendChild(box);
  let speed: Speed = 1;
  let frames = 0;
  let size: number[] = [];
  const a = createAmbience({
    target: () => box,
    speed: () => speed,
    draw: (_ctx, _t, w, h) => {
      frames += 1;
      size = [w, h];
    },
    className: 'mist',
  });
  await wait(100);
  const r = a.el.getBoundingClientRect();
  const on = [r.left, r.top, r.width, r.height, a.el.className, a.el.style.display, getComputedStyle(a.el).pointerEvents, getComputedStyle(a.el).overflow];
  const seen = frames;
  speed = 'instant';
  await wait(80);
  const off = a.el.style.display;
  const f1 = frames;
  await wait(80);
  const still = frames === f1;
  speed = 1;
  box.style.width = '120px';
  a.update();
  const back = [a.el.style.display, a.el.style.width];
  a.destroy();
  const gone = !a.el.isConnected;
  box.remove();
  return { on, size, frames: seen, off, still, back, gone };
}

(window as unknown as Record<string, unknown>)['fxTest'] = { runOne, own, reduced, together, early, sourceCut, canvas, ambience };
