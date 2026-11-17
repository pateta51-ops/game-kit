import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planTrackUps } from './ups.ts';
import type { Space, TrackWords } from './track.ts';
import { HopTrack, StepTrack, Track } from './ui.tsx';

const words: TrackWords = { space: (n) => `Space ${String(n)}`, value: (v) => `value ${String(v)}`, max: 'last', skipped: 'skipped', here: 'here' };
const spaces: Space[] = [{ value: 1, marks: [{ id: 'r', letter: 'R', name: 'red' }] }, { value: 2 }, { value: 3, max: true }];

describe('Track', () => {
  it('drawn row: states, aria-current, labels, mark letter, marker label', () => {
    const { container } = render(<Track spaces={spaces} index={1} words={words} label="Danger" markerLabel="Marker" speed={() => 0} />);
    const li = container.querySelectorAll('[data-part=space]');
    expect(li[1]!.getAttribute('aria-current')).toBe('step');
    expect(li[1]!.getAttribute('aria-label')).toBe('Space 2, value 2, here');
    expect(li[0]!.getAttribute('data-state')).toBe('past');
    expect(li[0]!.querySelector('[data-part=mark]')!.textContent).toBe('R');
    expect(container.querySelector('[data-part=marker]')!.textContent).toBe('Marker');
    expect(container.querySelector('[data-part=track]')!.getAttribute('aria-label')).toBe('Danger');
  });
  it('mat: spaces at printed positions over the image, marker image in the current one', () => {
    const { container } = render(
      <Track spaces={spaces} index={0} words={words} label="T" marker={<b>M</b>} mat={{ src: 'm.png', spots: [[0.1, 0.2], [0.5, 0.5], [0.9, 0.9]] }} />,
    );
    expect(container.querySelector('[data-part=mat-image]')!.getAttribute('src')).toBe('m.png');
    expect((container.querySelectorAll('[data-part=space]')[1] as HTMLElement).style.left).toBe('50%');
    expect(container.querySelector('[data-part=glide]')!.textContent).toBe('M');
  });
  it('a move at speed 0 keeps one current space', () => {
    const { container, rerender } = render(<Track spaces={spaces} index={0} words={words} label="T" speed={() => 0} />);
    rerender(<Track spaces={spaces} index={2} words={words} label="T" speed={() => 0} />);
    expect(container.querySelectorAll('[aria-current=step]').length).toBe(1);
  });
});

describe('HopTrack', () => {
  it('shows the number and badge; at speed 0 it just updates', () => {
    const { container, rerender } = render(<HopTrack value={2} max={9} label="Crew" speed={() => 0} />);
    expect(container.querySelector('[data-part=badge]')).toBeNull();
    rerender(<HopTrack value={5} max={9} mult={2} label="Crew" speed={() => 0} />);
    expect(container.querySelector('[data-part=number]')!.textContent).toBe('5');
    expect(container.querySelector('[data-part=badge]')!.textContent).toBe('×2');
    expect(container.querySelector<HTMLElement>('[data-part=bar]')!.style.getPropertyValue('--v')).toBe('5');
  });
});

describe('StepTrack', () => {
  it('lights one step', () => {
    const { container } = render(<StepTrack steps={[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]} current="b" label="Steps" />);
    expect(container.querySelector('[aria-current=step]')!.textContent).toBe('B');
  });
});

describe('animation (animate mocked)', () => {
  const calls: { el: Element; frames: unknown; o: unknown; cancel: ReturnType<typeof vi.fn> }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    Element.prototype.animate = function (this: Element, frames: unknown, o: unknown) {
      const cancel = vi.fn();
      calls.push({ el: this, frames, o, cancel });
      return { cancel, finished: new Promise((r) => setTimeout(r, (o as { duration: number }).duration)) } as unknown as Animation;
    };
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const i = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
      return { x: i * 100, y: 0, left: i * 100, top: 0, width: 10, height: 10, right: 0, bottom: 0, toJSON: () => ({}) };
    };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (Element.prototype as { animate?: unknown }).animate;
    document.querySelectorAll('[data-part=spark],[data-part=light]').forEach((e) => e.remove());
  });
  const hopNum = (c: HTMLElement) => c.querySelector('[data-part=number]')!.textContent;

  it('hop: old number and hidden badge during the hop; tick, bump, light, then badge pops with 22 sparks, pulses and a rise', async () => {
    const { container, rerender } = render(<HopTrack value={2} max={9} mult={1} label="C" speed={() => 1} />);
    rerender(<HopTrack value={5} max={9} mult={2} label="C" speed={() => 1} />);
    expect(hopNum(container)).toBe('2');
    expect(container.querySelector<HTMLElement>('[data-part=badge]')!.style.visibility).toBe('hidden');
    expect(calls.some((c) => (c.o as { duration: number }).duration === 600)).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(hopNum(container)).toBe('5');
    expect(container.querySelector<HTMLElement>('[data-part=badge]')!.style.visibility).toBe('');
    expect(document.querySelectorAll('[data-part=spark]').length).toBe(22);
    expect(document.querySelectorAll('[data-part=light]').length).toBe(1);
    expect(container.querySelectorAll('[data-part=pulse]').length).toBe(2);
    expect(container.querySelector('[data-part=rise]')!.textContent).toBe('×2');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(container.querySelector('[data-part=rise]')).toBeNull();
    expect(document.querySelectorAll('[data-part=spark]').length).toBe(0);
  });
  it('no new multiplier: light only, no badge pop, no sparks', async () => {
    const { container, rerender } = render(<HopTrack value={2} max={9} mult={2} label="C" speed={() => 1} />);
    rerender(<HopTrack value={3} max={9} mult={2} label="C" speed={() => 1} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
    });
    expect(hopNum(container)).toBe('3');
    expect(document.querySelectorAll('[data-part=spark]').length).toBe(0);
    expect(container.querySelector('[data-part=rise]')).toBeNull();
  });
  it('a new value mid-hop ends the run cleanly: no sparks, pulses or rise left', async () => {
    const { container, rerender } = render(<HopTrack value={2} max={9} mult={1} label="C" speed={() => 1} />);
    rerender(<HopTrack value={5} max={9} mult={2} label="C" speed={() => 1} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    rerender(<HopTrack value={6} max={9} mult={2} label="C" speed={() => 0} />);
    expect(document.querySelectorAll('[data-part=spark]').length).toBe(0);
    expect(container.querySelector('[data-part=rise]')).toBeNull();
    expect(container.querySelectorAll('[data-part=pulse]').length).toBe(0);
    expect(hopNum(container)).toBe('6');
    expect(container.querySelector<HTMLElement>('[data-part=badge]')!.style.visibility).toBe('');
  });
  it('backward only with the option; an undo jumps', () => {
    const { container, rerender } = render(<HopTrack value={5} max={9} label="C" speed={() => 1} />);
    rerender(<HopTrack value={3} max={9} label="C" speed={() => 1} />);
    expect(hopNum(container)).toBe('3');
    expect(calls.length).toBe(0);
    rerender(<HopTrack value={1} max={9} label="C" speed={() => 1} backward />);
    expect(hopNum(container)).toBe('3');
    expect(calls.length).toBeGreaterThan(0);
    calls.length = 0;
    rerender(<HopTrack value={4} max={9} label="C" speed={() => 1} backward undone={1} />);
    expect(hopNum(container)).toBe('4');
    expect(calls.length).toBe(0);
  });
  it('mat glide: the marker piece animates from the old spot; an undo and a move back do not', () => {
    const mat = { src: 'm.png', spots: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]] as [number, number][] };
    const t = (index: number, extra: object = {}) => <Track spaces={spaces} index={index} words={words} label="T" marker={<b>M</b>} mat={mat} speed={() => 1} {...extra} />;
    const { rerender } = render(t(0));
    rerender(t(1));
    const g = calls.filter((c) => (c.el as HTMLElement).dataset['part'] === 'glide');
    expect(g.length).toBe(1);
    expect((g[0]!.o as { duration: number }).duration).toBe(650);
    calls.length = 0;
    rerender(t(0));
    expect(calls.length).toBe(0);
    rerender(t(1, { backward: true }));
    expect(calls.length).toBe(1);
    calls.length = 0;
    rerender(t(2, { undone: 1 }));
    expect(calls.length).toBe(0);
  });
  it('planTrackUps: hold primes, arrive hops in order, release restores; null when nothing rose or cannot', async () => {
    const log: string[] = [];
    const fns = { prime: (u: { id: string }) => log.push('p' + u.id), hop: (u: { id: string }) => Promise.resolve(void log.push('h' + u.id)), restore: (u: { id: string }) => log.push('r' + u.id) };
    const leg = planTrackUps({ a: { value: 1 }, b: { value: 3 } }, { a: { value: 2 }, b: { value: 3 } }, fns)!;
    leg.hold();
    await leg.arrive();
    leg.release();
    expect(log).toEqual(['pa', 'ha', 'ra']);
    expect(planTrackUps({ a: { value: 1 } }, { a: { value: 1 } }, fns)).toBeNull();
    expect(planTrackUps({ a: { value: 1 } }, { a: { value: 2 } }, { ...fns, can: false })).toBeNull();
    expect(planTrackUps(null, { a: { value: 2 } }, fns)).toBeNull();
  });
});
