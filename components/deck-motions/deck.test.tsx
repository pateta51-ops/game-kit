import { afterEach, describe, expect, it, vi } from 'vitest';
import { dealFrom, finishDeckMotions, riffle } from './ui.ts';

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
    expect(String(made[0]?.frames[1]?.transform)).toContain('rotateY(90deg)');
    made.length = 0;
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: true }], { speed: 1, axis: 'y' });
    expect(String(made[0]?.frames[1]?.transform)).toContain('rotateX(90deg)');
    expect(String(made[1]?.frames[0]?.transform)).toContain('rotateX(-90deg)');
    finishDeckMotions();
  });
  it('turns the other way with direction -1', () => {
    setup();
    dealFrom([{ id: 'c1', dir: 'out', pile: 'deck', at: slot, faceDown: true }], { speed: 1, direction: -1 });
    expect(String(made[0]?.frames[1]?.transform)).toContain('rotateY(-90deg)');
    expect(String(made[1]?.frames[0]?.transform)).toContain('rotateY(90deg)');
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
  it('riffles with 12 backs, hides the deck, and restores it', async () => {
    setup();
    const deck = document.querySelector<HTMLElement>('[data-pile=deck]')!;
    const p = riffle(deck, 1);
    expect(riffle(deck, 1)).toBe(p);
    expect(made).toHaveLength(12);
    expect(made[0]!.opts.duration).toBe(2200);
    expect(deck.style.visibility).toBe('hidden');
    finishDeckMotions();
    await p;
    expect(deck.style.visibility).toBe('');
    expect(document.querySelectorAll('[data-motion-standin]')).toHaveLength(0);
  });
});
