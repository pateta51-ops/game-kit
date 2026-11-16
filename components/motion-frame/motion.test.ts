import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTimeline,
  automatedWithoutMotion,
  createMotionPlayer,
  createVerbs,
  prefersReducedMotion,
  putMotionSpeed,
  bindMotionSpeed,
  skipOnInput,
  stageFromLayout,
  validateSpec,
  validateSpecs,
  withAutomationOff,
  withReducedMotion,
  type Layout,
  type MotionSpec,
  type Speed,
} from './index';

const load = (n: string): unknown => JSON.parse(readFileSync(new URL(`./fake/${n}.json`, import.meta.url), 'utf8'));
const stage = stageFromLayout(load('stage.layout') as Layout);
const gain = load('gain') as MotionSpec;
const roll = load('roll') as MotionSpec;
const call = load('call') as MotionSpec;
const specs = { gain, roll, call };
const VERBS = ['move', 'lift', 'settle', 'fade-in', 'fade-out', 'show', 'hide', 'flip', 'scale', 'shake', 'glow', 'text'];

describe('timeline', () => {
  it('the three sample specs validate and give timelines', () => {
    expect(validateSpecs(specs, { table: stage }, VERBS)).toEqual([]);
    for (const s of Object.values(specs)) {
      const tl = buildTimeline(s, stage);
      expect(tl.calls).toHaveLength(s.steps.length);
      expect(tl.ms).toBeLessThanOrEqual(s.maxMs ?? 0);
    }
  });

  it('resolves rectangles: centres, the move origin, a zone as actor, a scale value', () => {
    const tl = buildTimeline(gain, stage);
    expect(tl.actors).toEqual([{ id: 'piece', label: 'Piece', rect: [200, 1640, 100, 100], hidden: true }]);
    expect(tl.calls.map((c) => [c.t, c.dur, c.actor, c.verb])).toEqual([
      [0, 160, 'piece', 'fade-in'],
      [160, 440, 'piece', 'move'],
      [600, 160, 'piece', 'settle'],
      [600, 200, 'tray', 'glow'],
    ]);
    expect(tl.calls[1]).toMatchObject({ from: [200, 1640, 100, 100], to: [350, 1600, 100, 100], zone: false });
    expect(tl.calls[2]?.from).toEqual([350, 1600, 100, 100]);
    expect(tl.calls[3]).toMatchObject({ from: [100, 1500, 600, 300], zone: true });
    expect(tl.cues).toEqual([{ t: 600, cue: 'drop' }]);
    expect(tl.ms).toBe(800);
    const c = buildTimeline(call, stage);
    expect(c.calls[1]).toMatchObject({ verb: 'scale', value: 1.3 });
    expect(c.calls[0]?.from).toEqual([1855, 1795, 300, 120]);
  });

  it('scales by the speed factor and orders by time', () => {
    const tl = buildTimeline(roll, stage, 0.5);
    expect(tl.ms).toBe(400);
    expect(tl.calls.map((c) => c.t)).toEqual([0, 20, 120, 120, 300, 300, 300, 300]);
    expect(tl.calls[1]).toMatchObject({ actor: 'p1', to: [370, 2000, 100, 100] });
  });

  it('a live resolver is asked before the layout', () => {
    const live = stageFromLayout(load('stage.layout') as Layout, (z) => (z === 'tray' ? [0, 0, 10, 10] : undefined));
    expect(buildTimeline(gain, live).calls[3]?.from).toEqual([0, 0, 10, 10]);
    expect(live('lamp')).toEqual([3000, 100, 200, 100]);
  });

  it('the validator names each problem', () => {
    const bad = {
      ...gain,
      maxMs: 700,
      actors: [{ id: 'piece', at: 'nowhere' }],
      steps: [...gain.steps, { t: 0, dur: 10, actor: 'ghost', do: 'explode', to: 'void' }],
    };
    expect(validateSpec(bad, stage, VERBS)).toEqual([
      'actor piece: zone nowhere is not on the stage',
      'step 5: unknown verb explode',
      'step 5: ghost is neither an actor nor a zone',
      'step 5: zone void is not on the stage',
      'the last step ends at 800 ms, after maxMs 700',
    ]);
    expect(validateSpecs({ x: { ...gain, stage: 'moon' } }, { table: stage }, VERBS)).toEqual(['x: stage moon is not known']);
    expect(validateSpec({ id: 'a', frequency: 'daily' }, stage, VERBS)).toHaveLength(3);
    const { stage: _s, maxMs: _m, ...bare } = gain;
    expect(validateSpecs({ x: { ...bare, maxMs: 800 } }, { default: stage }, VERBS)).toEqual([]);
    expect(
      validateSpec({ ...bare, actors: [{ id: 'piece', at: [1, 2] }], sound: [{ t: 801, cue: 'late' }] }, stage, VERBS),
    ).toEqual(['maxMs missing', 'actor piece: at is a point, so w and h are needed', "cue late at 801 ms is after the last step's end (800 ms)"]);
    expect(() => buildTimeline(bad, stage)).toThrow(/nowhere/);
    expect(validateSpec(gain, stage, createVerbs())).toHaveLength(4);
  });
});

describe('player', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (first: Speed = 1) => {
    const log: string[] = [];
    const verbs = createVerbs<string>();
    for (const v of VERBS)
      verbs.register(v, (c, run) => {
        log.push(`${run.timeline.id} ${v} ${c.actor} ${run.context}`);
        return () => {
          log.push(`${run.timeline.id} /${v} ${c.actor}`);
        };
      });
    verbs.register('glow', () => {
      throw new Error('boom');
    });
    let now = first;
    const problems: string[] = [];
    const player = createMotionPlayer({
      specs,
      stages: { table: stage },
      verbs,
      speed: () => now,
      context: 'ctx',
      onCue: (c, b) => {
        log.push(`cue ${c} ${b}`);
      },
      onBeatStart: (r) => {
        log.push(`start ${r.timeline.id} ${String(r.id)}`);
      },
      onBeatEnd: (r) => {
        log.push(`end ${r.timeline.id}`);
      },
      onProblem: (m) => {
        problems.push(m);
      },
    });
    return {
      log,
      player,
      problems,
      setSpeed: (s: Speed) => {
        now = s;
      },
    };
  };

  it('plays a beat on its times; a verb that throws does not stop it', () => {
    const { log, player, problems } = setup();
    player.play('gain', { onEnd: () => log.push('done') });
    expect(player.busy()).toBe(false);
    expect(player.pending()).toBe(1);
    expect(log).toEqual(['start F-1 1']);
    vi.advanceTimersByTime(0);
    expect(log.at(-1)).toBe('F-1 fade-in piece ctx');
    vi.advanceTimersByTime(599);
    expect(log).not.toContain('cue drop F-1');
    vi.advanceTimersByTime(1);
    expect(log).toContain('cue drop F-1');
    vi.advanceTimersByTime(200);
    expect(log).toEqual([
      'start F-1 1',
      'F-1 fade-in piece ctx',
      'F-1 /fade-in piece',
      'F-1 move piece ctx',
      'F-1 /move piece',
      'F-1 settle piece ctx',
      'cue drop F-1',
      'F-1 /settle piece',
      'end F-1',
      'done',
    ]);
    expect(problems).toEqual(['F-1 glow: boom']);
    expect(player.pending()).toBe(0);
  });

  it('beats play in order; a rare beat holds busy until it ends', () => {
    const { log, player } = setup(0.5);
    const seen: boolean[] = [];
    player.subscribe(() => seen.push(player.busy()));
    player.play('roll');
    player.play('call', { onEnd: () => log.push('call done') });
    expect(player.busy()).toBe(true);
    vi.advanceTimersByTime(399);
    expect(log).not.toContain('start F-3 2');
    vi.advanceTimersByTime(1);
    expect(log).toContain('start F-3 2');
    expect(player.busy()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(log.at(-1)).toBe('call done');
    expect(player.busy()).toBe(false);
    expect(seen).toEqual([false, true, true, false]);
  });

  it('a parallel beat starts at once beside the playing one and skipAll ends both', () => {
    const { log, player } = setup();
    const ends: string[] = [];
    player.play('gain', { onEnd: () => ends.push('gain') });
    player.play('call', { parallel: true, onEnd: () => ends.push('call') });
    expect(log.filter((l) => l.startsWith('start'))).toEqual(['start F-1 1', 'start F-3 2']);
    expect(player.pending()).toBe(2);
    vi.advanceTimersByTime(300);
    player.play('gain', { parallel: true });
    player.skipAll();
    expect(ends.sort()).toEqual(['call', 'gain']);
    expect(player.pending()).toBe(0);
  });

  it('a parallel beat ends on its own once; a rare one holds busy; a parallel play from a skip ends at once', () => {
    const { log, player } = setup();
    const ends: string[] = [];
    player.play('call', { parallel: true, onEnd: () => ends.push('roll') });
    expect(player.busy()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(ends).toEqual(['roll']);
    expect(player.busy()).toBe(false);
    player.play('gain', {
      onEnd: () => player.play('roll', { parallel: true, onEnd: () => ends.push('call') }),
    });
    player.skipAll();
    expect(ends).toEqual(['roll', 'call']);
    expect(player.pending()).toBe(0);
    expect(log.filter((l) => l.startsWith('start'))).toEqual(['start F-3 1', 'start F-1 2']);
  });

  it('instant speed: a parallel beat ends at once and its cues still sound', () => {
    const { log, player, setSpeed } = setup();
    setSpeed('instant');
    const ends: string[] = [];
    player.play('gain', { parallel: true, onEnd: () => ends.push('gain') });
    expect(ends).toEqual(['gain']);
    expect(log).toContain('cue drop F-1');
    expect(player.pending()).toBe(0);
  });

  it('skipAll jumps everything queued to its end and drops the cues not yet due', () => {
    const { log, player } = setup();
    const ends: string[] = [];
    player.play('gain', { onEnd: () => ends.push('gain') });
    player.play('call', { onEnd: () => ends.push('call') });
    player.play('roll', { onEnd: () => ends.push('roll') });
    vi.advanceTimersByTime(200);
    player.skipAll();
    expect(ends).toEqual(['gain', 'call', 'roll']);
    expect(log.slice(-2)).toEqual(['F-1 /move piece', 'end F-1']);
    expect(player.pending()).toBe(0);
    expect(player.busy()).toBe(false);
    const n = log.length;
    vi.runAllTimers();
    expect(log).toHaveLength(n);
    expect(log.some((l) => l.startsWith('cue'))).toBe(false);
  });

  it('a play() from an end callback of a skip starts after every end callback', () => {
    const { log, player } = setup();
    player.play('gain', {
      onEnd: () => {
        log.push('gain done');
        player.play('call');
      },
    });
    player.play('roll', { onEnd: () => log.push('roll done') });
    player.skipAll();
    expect(log.slice(-3)).toEqual(['gain done', 'roll done', 'start F-3 2']);
    expect(player.pending()).toBe(1);
  });

  it('skipOnInput skips on a press or a key, only while something plays', () => {
    const { player } = setup();
    const target = new EventTarget();
    const skip = vi.spyOn(player, 'skipAll');
    const off = skipOnInput(player, target);
    target.dispatchEvent(new Event('keydown'));
    expect(skip).not.toHaveBeenCalled();
    player.play('gain');
    target.dispatchEvent(new Event('pointerdown'));
    expect(player.pending()).toBe(0);
    player.play('gain');
    off();
    target.dispatchEvent(new Event('keydown'));
    expect(player.pending()).toBe(1);
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it('instant builds no timeline: the end fires at once and the cues still sound', () => {
    const { log, player, setSpeed } = setup('instant');
    player.play('call', { onEnd: () => log.push('done') });
    expect(log).toEqual(['cue call F-3', 'cue lamp-on F-3', 'done']);
    expect(player.busy()).toBe(false);
    setSpeed(1);
    player.play({ ...gain, id: 'live', actors: [{ id: 'piece', at: 'lamp' }] });
    vi.advanceTimersByTime(0);
    expect(log.at(-1)).toBe('live fade-in piece ctx');
  });

  it('a beat that cannot play ends at once and the queue goes on', () => {
    const { log, player, problems } = setup();
    player.play('nope', { onEnd: () => log.push('a') });
    player.play({ ...gain, stage: 'moon' }, { onEnd: () => log.push('b') });
    player.play({ ...gain, actors: [] }, { onEnd: () => log.push('c') });
    expect(log).toEqual(['a', 'b', 'c']);
    expect(problems).toHaveLength(3);
    player.play('gain', {
      onEnd: () => {
        player.play('call');
      },
    });
    vi.advanceTimersByTime(800);
    expect(log.at(-1)).toBe('start F-3 2');
  });

  it('reduced motion makes the speed instant', () => {
    expect(withReducedMotion(0.5, true)).toBe('instant');
    expect(withReducedMotion(0.5, false)).toBe(0.5);
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
    expect(prefersReducedMotion()).toBe(true);
    expect(withReducedMotion(1)).toBe('instant');
    vi.unstubAllGlobals();
  });

  it('an automated browser plays instant unless its user agent carries the marker or the address asks for motion', () => {
    const bot = (userAgent: string, search = '') => ({ navigator: { webdriver: true, userAgent }, location: { search } });
    expect(automatedWithoutMotion()).toBe(false);
    expect(automatedWithoutMotion(undefined, { navigator: { webdriver: false, userAgent: 'x' } })).toBe(false);
    expect(automatedWithoutMotion(undefined, bot('Chrome'))).toBe(true);
    expect(automatedWithoutMotion(undefined, { navigator: { webdriver: true } })).toBe(true);
    expect(automatedWithoutMotion(undefined, bot('Chrome KitMotion'))).toBe(false);
    expect(automatedWithoutMotion('MyGame', bot('Chrome KitMotion'))).toBe(true);
    expect(automatedWithoutMotion('MyGame', bot('Chrome MyGame'))).toBe(false);
    expect(automatedWithoutMotion(undefined, bot('Chrome', '?a=1&motion=on'))).toBe(false);
    expect(automatedWithoutMotion(undefined, bot('Chrome', '?motion=off'))).toBe(true);
    expect(withAutomationOff(0.5, undefined, bot('Chrome'))).toBe('instant');
    expect(withAutomationOff(0.5, undefined, bot('Chrome', '?motion=on'))).toBe(0.5);
    expect(withAutomationOff(0.5)).toBe(0.5);
  });

  it('putMotionSpeed writes data-motion and --motion-scale', () => {
    const style: Record<string, string> = {};
    const el = {
      dataset: {} as Record<string, string | undefined>,
      style: {
        setProperty: (k: string, v: string) => {
          style[k] = v;
        },
      },
    };
    putMotionSpeed(0.5, 'fast', el);
    expect([el.dataset.motion, style['--motion-scale']]).toEqual(['fast', '0.5']);
    putMotionSpeed(1, undefined, el);
    expect([el.dataset.motion, style['--motion-scale']]).toEqual(['on', '1']);
    putMotionSpeed('instant', 'fast', el);
    expect([el.dataset.motion, style['--motion-scale']]).toEqual(['off', '0']);
  });

  it('putMotionSpeed and bindMotionSpeed do nothing without a document or matchMedia', () => {
    expect(typeof document).toBe('undefined');
    expect(() => {
      putMotionSpeed(1);
    }).not.toThrow();
    const unbind = bindMotionSpeed(() => 1);
    expect(() => {
      unbind();
    }).not.toThrow();
  });

  it('reduced motion wins over ?motion=on and over the automation marker', () => {
    const bot = (userAgent: string, search = '') => ({ navigator: { webdriver: true, userAgent }, location: { search } });
    expect(withReducedMotion(withAutomationOff(0.5, undefined, bot('Chrome', '?motion=on')), true)).toBe('instant');
    expect(withReducedMotion(withAutomationOff(0.5, undefined, bot('Chrome KitMotion')), true)).toBe('instant');
    expect(withReducedMotion(withAutomationOff(0.5, undefined, bot('Chrome', '?motion=on')), false)).toBe(0.5);
    expect(withReducedMotion(withAutomationOff(0.5, undefined, bot('Chrome')), false)).toBe('instant');
    expect(withReducedMotion(withAutomationOff(0.5, undefined, {}), false)).toBe(0.5);
  });

  it('bindMotionSpeed puts the speed again when the reduced-motion setting changes, until unbound', () => {
    const style: Record<string, string> = {};
    const el = {
      dataset: {} as Record<string, string | undefined>,
      style: {
        setProperty: (k: string, v: string) => {
          style[k] = v;
        },
      },
    };
    const heard = new Set<() => void>();
    const asked: string[] = [];
    let reduced = false;
    const mm = (q: string) => {
      asked.push(q);
      return {
        addEventListener: (_: string, f: unknown) => void heard.add(f as () => void),
        removeEventListener: (_: string, f: unknown) => void heard.delete(f as () => void),
      };
    };
    const unbind = bindMotionSpeed(() => withReducedMotion(0.5, reduced), () => 'fast', el, mm);
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
    expect(el.dataset.motion).toBeUndefined();
    reduced = true;
    heard.forEach((f) => {
      f();
    });
    expect([el.dataset.motion, style['--motion-scale']]).toEqual(['off', '0']);
    reduced = false;
    heard.forEach((f) => {
      f();
    });
    expect([el.dataset.motion, style['--motion-scale']]).toEqual(['fast', '0.5']);
    unbind();
    expect(heard.size).toBe(0);
  });
});
