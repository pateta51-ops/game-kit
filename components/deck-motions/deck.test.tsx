import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs } from '../motion-frame/player.ts';
import { dealFrom, finishDeckMotions, registerRiffle, riffle, type RiffleVerbOpts } from './ui.ts';

const rect = { left: 0, top: 0, width: 10, height: 14 } as DOMRect;
const made: { frames: Keyframe[]; opts: KeyframeAnimationOptions }[] = [];

const setup = () => {
  document.body.innerHTML = '<div data-pile="deck"><i></i></div><div id="slot"></div>';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  HTMLElement.prototype.animate = function (this: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    let ok!: () => void;
    const finished = new Promise<Animation>((r) => { ok = () => { r(a); }; });
    const a = { finished, effect: { target: this }, finish: () => { ok(); } } as unknown as Animation;
    made.push({ frames, opts });
    return a;
  };
};
// K396: a fake frame clock and canvas (jsdom has neither WebGL2 nor a 2D context): `frame(ms)` draws the riffle at ms.
let next: FrameRequestCallback | undefined;
const asked: string[] = [];
const drawn: unknown[] = [];
const frame = (ms: number) => { const f = next; next = undefined; f?.(ms); };
const fakeCanvas = () => {
  next = undefined;
  asked.length = 0;
  drawn.length = 0;
  vi.spyOn(window.performance, 'now').mockReturnValue(0);
  window.requestAnimationFrame = (f) => { next = f; return 1; };
  window.cancelAnimationFrame = () => { next = undefined; };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string) {
    asked.push(type);
    if (type !== '2d') return null;
    const target = { canvas: this, drawImage: (...a: unknown[]) => { drawn.push(a); } } as Record<string, unknown>;
    return new Proxy(target, { get: (t, k: string) => k in t ? t[k] : () => ({ addColorStop: () => undefined }), set: () => true }) as never;
  } as never);
};
const layer = () => document.querySelector('[data-riffle-motion="deck"]');
afterEach(() => { made.length = 0; vi.restoreAllMocks(); });

const slot = () => document.getElementById('slot');

describe('deck-motions DOM', () => {
  it('flies a face-down card out as a back and a face, and removes the stand-ins when finished', async () => {
    setup();
    const d = dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: true }], { speed: 1 });
    expect(made).toHaveLength(2);
    expect(document.querySelectorAll('[data-motion-standin]')).toHaveLength(2);
    finishDeckMotions();
    await d.done;
    expect(document.querySelectorAll('[data-motion-standin]')).toHaveLength(0);
  });
  it('turns over side to side by default and top to bottom with axis y', () => {
    setup();
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: true }], { speed: 1 });
    expect(String(made[0]?.frames.at(-1)?.transform)).toContain('rotateY(90deg)');
    made.length = 0;
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: true }], { speed: 1, axis: 'y' });
    expect(String(made[0]?.frames.at(-1)?.transform)).toContain('rotateX(90deg)');
    expect(String(made[1]?.frames[0]?.transform)).toContain('rotateX(-90deg)');
    finishDeckMotions();
  });
  it('turns the other way with direction -1', () => {
    setup();
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: true }], { speed: 1, direction: -1 });
    expect(String(made[0]?.frames.at(-1)?.transform)).toContain('rotateY(-90deg)');
    expect(String(made[1]?.frames[0]?.transform)).toContain('rotateY(90deg)');
    finishDeckMotions();
  });
  it('K406: a face-down pile deals face down, then turns over (faceDown unset)', () => {
    setup();
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot }], { speed: 1 });
    expect(made).toHaveLength(2);
    const [back, face] = made.map((m) => m.frames);
    expect(back![0]).toMatchObject({ opacity: 1 });
    expect(String(back![0]!.transform)).toContain('rotateY(0deg)');
    expect(face![0]).toMatchObject({ opacity: 0 });
    expect(face!.at(-1)).toMatchObject({ opacity: 1 });
    expect(String(face!.at(-1)!.transform)).toContain('rotateY(0deg)');
    finishDeckMotions();
  });
  it('K406: a pile marked face down turns even with faceDown false; one marked face up opts out', () => {
    setup();
    document.querySelector('[data-pile=deck]')!.setAttribute('data-face', 'down');
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: false }], { speed: 1 });
    expect(made).toHaveLength(2);
    made.length = 0;
    document.querySelector('[data-pile=deck]')!.setAttribute('data-face', 'up');
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot }], { speed: 1 });
    expect(made).toHaveLength(1);
    finishDeckMotions();
  });
  it('K406: the deck cycle turns the card face down on its way in, then it vanishes', () => {
    setup();
    dealFrom([{ id: 'c1', dir: 'in', pile: 'deck', at: slot, faceDown: true }], { speed: 1 });
    expect(made).toHaveLength(2);
    expect(made[0]!.frames[0]).toMatchObject({ opacity: 1 });
    expect(made[1]!.frames.at(-1)).toMatchObject({ opacity: 0 });
    expect(String(made[1]!.frames.at(-1)!.transform)).toContain('rotateY(0deg)');
    finishDeckMotions();
  });
  it('K406: the flip takes lift, perspective and its share of the travel', () => {
    setup();
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot }], { speed: 1, flipLift: 1.2, perspective: 500, flipStart: 0.1, flipEnd: 0.5 });
    const back = made[0]!.frames;
    expect(back.map((k) => k.offset)).toContain(0.1);
    expect(String(back.find((k) => k.offset === 0.3)!.transform)).toMatch(/scale\(1\.2\) perspective\(500px\) rotateY\(90deg\)/);
    finishDeckMotions();
  });
  it('K443: dealFrom takes its timing; defaults stay 520/90', () => {
    setup();
    const two = [{ id: 'a', dir: 'out' as const, pile: 'deck', at: slot, faceDown: false }, { id: 'b', dir: 'out' as const, pile: 'deck', at: slot, faceDown: false }];
    dealFrom(two, { speed: 1 });
    expect(made.map((x) => [x.opts.duration, x.opts.delay])).toEqual([[520, 0], [520, 90]]);
    made.length = 0;
    dealFrom(two, { speed: 1, dealMs: 680, staggerMs: 190 });
    expect(made.map((x) => [x.opts.duration, x.opts.delay])).toEqual([[680, 0], [680, 190]]);
    finishDeckMotions();
  });
  it('K443: a move starts from a tilt and a scale and rests at its own turn (flat and turning)', () => {
    setup();
    dealFrom([{ id: 'a', dir: 'out', pile: 'deck', at: slot, faceDown: false, from: { x: 5, y: -4, tilt: 9, scale: 0.9 }, turn: -4 }], { speed: 1 });
    const fr = made[0]!.frames;
    expect(String(fr[0]!.transform)).toBe('translate(5px, -4px) scale(0.9, 0.9) rotate(9deg)');
    expect(String(fr.at(-1)!.transform)).toBe('translate(0px, 0px) scale(1, 1) rotate(-4deg)');
    made.length = 0;
    dealFrom([{ id: 'a', dir: 'out', pile: 'deck', at: slot, faceDown: true, from: { tilt: 9, scale: 0.9 }, turn: -4 }], { speed: 1, liftCurve: () => 1, flipLift: 1.07 });
    expect(String(made[0]!.frames[0]!.transform)).toContain('rotate(9deg)');
    expect(String(made[1]!.frames.at(-1)!.transform)).toContain('rotate(-4deg)');
    expect(String(made[0]!.frames.find((k) => k.offset === 0.5)!.transform)).toContain('scale(1.07)');
    finishDeckMotions();
  });
  it('plays nothing at speed 0', async () => {
    setup();
    await dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: false }], { speed: 0 }).done;
    expect(made).toHaveLength(0);
  });
  it('finishing cancels the pending riffle: none starts later', async () => {
    vi.useFakeTimers();
    setup();
    const d = dealFrom([{ id: 'c1', dir: 'in', pile: 'deck', at: slot, faceDown: true }], { speed: 1, shuffled: ['deck'] });
    const n = made.length;
    finishDeckMotions();
    await d.done;
    vi.advanceTimersByTime(5000);
    expect(made).toHaveLength(n);
    vi.useRealTimers();
  });
  it('K396: riffles the top view by default: 20 cards, RIFFLE_MS in all, the deck hidden then restored', async () => {
    setup();
    fakeCanvas();
    const deck = document.querySelector<HTMLElement>('[data-pile=deck]')!;
    let over = false;
    const p = riffle(deck, 1).then(() => { over = true; });
    expect(layer()?.querySelector('canvas')).not.toBeNull();
    expect(drawn).toHaveLength(20);
    expect(deck.style.visibility).toBe('hidden');
    frame(2199);
    expect(layer()).not.toBeNull();
    frame(2200);
    await p;
    expect(over).toBe(true);
    expect(layer()).toBeNull();
    expect(deck.hasAttribute('style')).toBe(false);
  });
  it('K396: takes cards, durations and speed', () => {
    setup();
    fakeCanvas();
    const deck = document.querySelector<HTMLElement>('[data-pile=deck]')!;
    void riffle(deck, 2, { cards: 8, durations: [100, 200, 300, 400] });
    expect(drawn).toHaveLength(8);
    frame(1999);
    expect(layer()).not.toBeNull();
    frame(2000);
    expect(layer()).toBeNull();
  });
  it('K396: one riffle per deck at a time; finishDeckMotions restores the deck at once', async () => {
    setup();
    fakeCanvas();
    const deck = document.querySelector<HTMLElement>('[data-pile=deck]')!;
    deck.style.color = 'red';
    const p = riffle(deck, 1);
    expect(riffle(deck, 1, { view: 'side' })).toBe(p);
    expect(document.querySelectorAll('[data-riffle-motion]')).toHaveLength(1);
    finishDeckMotions();
    await p;
    expect(layer()).toBeNull();
    expect(deck.style.visibility).toBe('');
    expect(deck.style.color).toBe('red');
    expect(next).toBeUndefined();
  });
  it('K396: still at speed 0 and under reduced motion', async () => {
    setup();
    fakeCanvas();
    const deck = document.querySelector<HTMLElement>('[data-pile=deck]')!;
    await riffle(deck, 0);
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as never;
    await riffle(deck, 1);
    Reflect.deleteProperty(window, 'matchMedia');
    expect(asked).toHaveLength(0);
    expect(layer()).toBeNull();
  });
  it('K396: the side view turns a portrait deck, not a landscape one, and draws the game back', () => {
    setup();
    fakeCanvas();
    const deck = document.querySelector<HTMLElement>('[data-pile=deck]')!;
    const back = vi.fn(() => Object.assign(document.createElement('b'), { className: 'mine' }));
    void riffle(deck, 1, { view: 'side', back });
    expect(back).toHaveBeenCalledWith('deck', rect);
    expect(layer()?.querySelectorAll('b.mine')).toHaveLength(20 * 7);
    expect(layer()?.innerHTML).toContain('rotateZ(90deg)');
    finishDeckMotions();
    void riffle(deck, 1, { view: 'side', orientation: 'landscape' });
    expect(layer()?.innerHTML).toContain('rotateZ(0deg)');
    expect(layer()?.querySelector('canvas')).toBeNull();
    finishDeckMotions();
  });
  it('K396: the top view falls back to 2D canvas strips without WebGL2', () => {
    setup();
    fakeCanvas();
    void riffle(document.querySelector<HTMLElement>('[data-pile=deck]')!, 1);
    expect(asked).toContain('webgl2');
    expect(asked.at(-1)).toBe('2d');
    expect(drawn.length).toBeGreaterThan(0);
    finishDeckMotions();
  });
});

describe('riffle verb', () => {
  const play = (opts?: RiffleVerbOpts, natural = false, speed: number | 'instant' = 0.5, actor = 'deck') => {
    const verbs = createVerbs();
    registerRiffle(verbs, opts);
    const player = createMotionPlayer({
      verbs, stages: { default: () => [0, 0, 10, 14] }, speed: () => speed, context: undefined,
      specs: { shuffle: { id: 'shuffle', steps: [{ t: 0, dur: 1000, actor, do: 'riffle', natural }] } },
    });
    player.play('shuffle');
    vi.advanceTimersByTime(0);
    return player;
  };
  const deck = () => document.querySelector<HTMLElement>('[data-pile=deck]')!;
  const atRest = () => {
    expect(deck().style.visibility).toBe('');
    expect(document.querySelectorAll('[data-motion-standin], [data-riffle-motion]')).toHaveLength(0);
  };

  afterEach(() => { vi.useRealTimers(); });

  it('K396: riffles the pile for the scaled call duration and restores it at the step end', () => {
    vi.useFakeTimers();
    setup();
    fakeCanvas();
    play();
    expect(deck().style.visibility).toBe('hidden');
    frame(499);
    expect(layer()).not.toBeNull();
    frame(500);
    expect(layer()).toBeNull();
    play();
    vi.advanceTimersByTime(500);
    atRest();
  });

  it('uses natural timing with a custom pile resolver and restores the pile on skip', () => {
    vi.useFakeTimers();
    setup();
    const resolvePile = vi.fn(deck);
    fakeCanvas();
    const player = play({ resolvePile }, true, 1, 'draw');
    expect(resolvePile).toHaveBeenCalledWith('draw');
    frame(2199);
    expect(layer()).not.toBeNull();
    expect(deck().style.visibility).toBe('hidden');
    player.skipAll();
    atRest();
  });

  it('does nothing at instant speed', () => {
    vi.useFakeTimers();
    setup();
    const resolvePile = vi.fn(deck);
    play({ resolvePile }, true, 'instant');
    expect(resolvePile).not.toHaveBeenCalled();
    expect(made).toHaveLength(0);
    atRest();
  });

  it('can shake the visible stack with Imperium offsets', () => {
    vi.useFakeTimers();
    setup();
    const player = play({ shake: { degrees: 4, pixels: 3 } });
    expect(made).toEqual([{
      frames: [
        { transform: 'none' },
        { transform: 'rotate(-4deg) translateX(-3px)' },
        { transform: 'rotate(4deg) translateX(3px)' },
        { transform: 'rotate(-2deg)' },
        { transform: 'none' },
      ].map((frame) => ({ ...frame, easing: 'ease-in-out' })),
      opts: { duration: 500 },
    }]);
    player.skipAll();
    atRest();
  });
});
