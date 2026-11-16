import { createMotionPlayer, createVerbs, type MotionSpec } from '../../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from '../../effect-library/index.ts';
import { copyPieces, mountPiecesDemo, registerPieceVerbs } from '../index.ts';

const sum = (c: HTMLCanvasElement | null) => { const g = c?.getContext('2d'); if (!c || !g || !c.width) return 0; const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i] ?? 0; return s; };
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function demo(noGl: boolean) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  if (noGl) { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, k: string, ...a: unknown[]) { return k === 'webgl' ? null : (o as (...x: unknown[]) => unknown).call(this, k, ...a); } as typeof o; }
  const root = document.createElement('div');
  document.body.appendChild(root);
  const r = mountPiecesDemo(root);
  for (let i = 0; i < 10 && r.dice && r.dice.frames() < 16; i += 1) await frame();
  const dice = [...root.querySelectorAll<HTMLElement>('[data-p3-die]')];
  return {
    gl: document.documentElement.classList.contains('p3-gl'), layer: r.dice !== null,
    dice: dice.map((d) => [d.getAttribute('data-p3-die'), sum(d.querySelector('canvas.p3-die-gl')) > 0, getComputedStyle(d.querySelector('.flat') as Element).visibility]),
    ball: sum(root.querySelector('canvas[data-ball]')), chip: getComputedStyle(root.querySelector('.p3-chip') as Element).transformStyle,
    cards: [...root.querySelectorAll('.p3-lying-card,.p3-lifted-card')].map((c) => getComputedStyle(c).boxShadow !== 'none'),
  };
}

async function verbs() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  mountPiecesDemo(root);
  const ball = root.querySelector('canvas[data-ball]') as HTMLCanvasElement, row = root.querySelector('[data-row="d6"]') as HTMLElement;
  const two = document.createElement('div');
  two.className = 'fx-two';
  two.innerHTML = '<span data-p3-die="d6" data-v="2" style="width:64px;height:64px"><span class="flat">2</span></span><span data-p3-die="d6" data-v="5" style="width:64px;height:64px"><span class="flat">5</span></span>';
  root.appendChild(two);
  const v = createVerbs<EffectCtx>(), look = () => undefined;
  const layer = registerEffects(v, { resolve: (id) => (id === 'ball' ? ball : id === 'two' ? two : row), onActor: copyPieces(look) });
  registerPieceVerbs(v, { ballLook: look });
  const px = (c: HTMLCanvasElement | null | undefined) => (c ? c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data.join() ?? '' : '');
  const out = { rolling: false, tumbling: 0, rocking: false, restAtEnd: false, turning: 0, flippedMid: false, flipped: false, after: -1 };
  const clone = () => layer.el.querySelector<HTMLCanvasElement>('canvas[data-ball]');
  const p = createMotionPlayer({
    specs: {}, stages: { default: (z) => (z === 'b' ? [400, 0, 110, 110] : undefined) }, verbs: v, speed: () => 1, context: layer,
    onBeatEnd: (run) => { out.restAtEnd = px(clone()) === px(ball); const t = layer.el.querySelector('.fx-two'); out.flipped = !!t?.hasAttribute('data-fx-flipped') && !t.querySelector('[data-turn]'); layer.end(run); },
  });
  const spec: MotionSpec = {
    id: 't', maxMs: 1200,
    actors: [{ id: 'ball', at: [55, 55], w: 110, h: 110 }, { id: 'dice', at: [300, 300], w: 500, h: 90 }, { id: 'two', at: [300, 500], w: 140, h: 70 }],
    steps: [{ t: 0, dur: 600, actor: 'ball', do: 'move', to: 'b' }, { t: 0, dur: 600, actor: 'dice', do: 'shake' }, { t: 600, dur: 500, actor: 'ball', do: 'settle' }, { t: 600, dur: 400, actor: 'two', do: 'flip' }],
  };
  await new Promise<void>((done) => {
    p.play(spec, { onEnd: done });
    setTimeout(() => { out.rolling = px(clone()) !== px(ball); out.tumbling = layer.el.querySelectorAll('[data-roll]').length; }, 300);
    setTimeout(() => {
      out.rocking = px(clone()) !== px(ball);
      out.turning = layer.el.querySelectorAll('[data-turn]').length;
      out.flippedMid = !!layer.el.querySelector('.fx-two[data-fx-flipped]');
    }, 700);
  });
  out.after = document.querySelectorAll('[data-roll],[data-turn]').length;
  return out;
}

async function context() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const r = mountPiecesDemo(root), d = r.dice;
  if (!d) return null;
  const on = () => document.documentElement.classList.contains('p3-gl');
  // the browser's restore is not dispatched in headless Chromium: both events are sent by hand
  const send = (ev: string) => d.canvas.dispatchEvent(new Event(ev, { cancelable: true }));
  for (let i = 0; i < 10 && d.frames() < 16; i += 1) await frame();
  const out = { start: on(), lost: true, back: false, redrawn: false, stopped: true, freed: false, canvases: -1, still: false };
  send('webglcontextlost'); out.lost = on();
  const n = d.frames();
  root.querySelector('[data-p3-die]')?.setAttribute('data-v', '4');
  await frame(); await frame();
  const idle = d.frames() === n;
  send('webglcontextrestored');
  for (let i = 0; i < 10 && d.frames() <= n; i += 1) await frame();
  out.back = on(); out.redrawn = idle && d.frames() > n;
  d.stop();
  out.stopped = on(); out.freed = d.canvas.getContext('webgl')?.isContextLost() === true; out.canvases = document.querySelectorAll('canvas.p3-die-gl').length;
  const m = d.frames();
  root.querySelector('[data-p3-die]')?.setAttribute('data-v', '3'); send('webglcontextrestored');
  for (let i = 0; i < 4; i += 1) await frame();
  out.still = d.frames() === m && document.querySelectorAll('canvas.p3-die-gl').length === 0 && !on();
  return out;
}

(window as unknown as { piecesTest: unknown }).piecesTest = { demo, verbs, context };
