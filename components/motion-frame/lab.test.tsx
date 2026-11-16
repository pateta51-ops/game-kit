import { describe, expect, it, vi } from 'vitest';
import call from './fake/call.json';
import gain from './fake/gain.json';
import roll from './fake/roll.json';
import layout from './fake/stage.layout.json';
import { createMotionPlayer, createVerbs, mountMotionLab, stageFromLayout, type Layout, type MotionSpec, type Speed } from './index.ts';

const specs = { gain: gain as unknown as MotionSpec, roll: roll as unknown as MotionSpec, call: call as unknown as MotionSpec };

describe('motion lab', () => {
  it('lists every motion of the catalog and plays the one pressed, ending what played', () => {
    vi.useFakeTimers();
    let speed: Speed = 1;
    const started: string[] = [];
    const player = createMotionPlayer({
      specs,
      stages: { table: stageFromLayout(layout as unknown as Layout) },
      verbs: createVerbs(),
      speed: () => speed,
      context: undefined,
      onBeatStart: (r) => {
        started.push(r.timeline.id);
      },
    });
    const unmount = mountMotionLab(document.body, { specs, player });
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('ul.motion-lab button')];
    expect(buttons.map((b) => b.dataset.beat)).toEqual(['gain', 'roll', 'call']);
    expect(buttons[0]?.textContent).toContain(`${String(specs.gain.maxMs)} ms`);
    buttons[1]?.click();
    expect(buttons[1]?.dataset.playing).toBe('true');
    buttons[0]?.click();
    expect(buttons[1]?.dataset.playing).toBeUndefined();
    expect(buttons[0]?.dataset.playing).toBe('true');
    vi.advanceTimersByTime(60_000);
    expect(buttons[0]?.dataset.playing).toBeUndefined();
    expect(started).toEqual([specs.roll.id, specs.gain.id]);
    speed = 'instant';
    buttons[2]?.click();
    expect(buttons[2]?.dataset.playing).toBeUndefined();
    expect(player.pending()).toBe(0);
    unmount();
    expect(document.querySelector('.motion-lab')).toBeNull();
    vi.useRealTimers();
  });

  const make = (problems: string[] = []) =>
    createMotionPlayer({
      specs,
      stages: { table: stageFromLayout(layout as unknown as Layout) },
      verbs: createVerbs(),
      speed: () => 1,
      context: undefined,
      onProblem: (m) => {
        problems.push(m);
      },
    });

  it('a press on a beat the player does not know reports a problem and leaves nothing playing', () => {
    const problems: string[] = [];
    const player = make(problems);
    const unmount = mountMotionLab(document.body, { specs: { ghost: specs.gain }, player });
    const b = document.querySelector<HTMLButtonElement>('button[data-beat="ghost"]');
    b?.click();
    expect(problems).toHaveLength(1);
    expect(b?.dataset.playing).toBeUndefined();
    expect(player.pending()).toBe(0);
    unmount();
  });

  it('two presses of the same button leave one run of it playing', () => {
    vi.useFakeTimers();
    const player = make();
    const unmount = mountMotionLab(document.body, { specs, player });
    const b = document.querySelector<HTMLButtonElement>('button[data-beat="roll"]');
    b?.click();
    b?.click();
    expect(player.pending()).toBe(1);
    expect(b?.dataset.playing).toBe('true');
    vi.advanceTimersByTime(60_000);
    expect(b?.dataset.playing).toBeUndefined();
    expect(player.pending()).toBe(0);
    unmount();
    vi.useRealTimers();
  });

  it('mounting twice on one root leaves one list, made in the document of the root', () => {
    const other = document.implementation.createHTMLDocument('');
    const player = make();
    const first = mountMotionLab(other.body, { specs, player });
    const second = mountMotionLab(other.body, { specs: { gain: specs.gain }, player });
    expect(other.querySelectorAll('ul.motion-lab')).toHaveLength(1);
    expect(other.querySelectorAll('button')).toHaveLength(1);
    expect(other.querySelector('button')?.ownerDocument).toBe(other);
    expect(document.querySelector('.motion-lab')).toBeNull();
    first();
    expect(other.querySelectorAll('ul.motion-lab')).toHaveLength(1);
    second();
    expect(other.querySelector('.motion-lab')).toBeNull();
  });
});
