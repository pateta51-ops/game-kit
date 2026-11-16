import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, createStepper, foldBefore, foldView, noSteps, pushSteps, questionZone, skip, type Fold, type FoldOptions, type Steps } from './index';

// the fake game: a score and a pool of dice; events gain or roll
interface View { score: number; pool: number }
type Ev = { seq: number; t: 'gain' | 'roll' | 'note'; n: number };
const ev = (seq: number, t: Ev['t'], n = 0): Ev => ({ seq, t, n });
const isStep = (e: Ev) => e.t !== 'note';
// the score counts forward from the base; the pool counts back from the live view over the steps still to play
const fold: Fold<View, Ev, View> = (base, events, live, later) => ({
  score: events.reduce((a, e) => a + (e.t === 'gain' ? e.n : 0), base.score),
  pool: later.reduce((a, e) => a + (e.t === 'roll' ? e.n : 0), live.pool),
});

describe('step queue', () => {
  it('an answer queues its steps on the view before it; later answers join the queue and keep the base', () => {
    const a = [ev(1, 'gain', 2), ev(2, 'note'), ev(3, 'roll', 1)], b = [ev(4, 'gain', 1)];
    let s = pushSteps(noSteps<View, Ev>(), { score: 0, pool: 3 }, a, isStep);
    expect(s.queue.map((e) => e.seq)).toEqual([1, 3]);
    expect(s.events).toBe(a);
    s = pushSteps(advance(s), { score: 2, pool: 2 }, b, isStep);
    expect(s.base).toEqual({ score: 0, pool: 3 });
    expect(s.queue.map((e) => e.seq)).toEqual([3, 4]);
    expect(s.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    s = pushSteps(skip(s), { score: 3, pool: 2 }, b, isStep);
    expect(s.base).toEqual({ score: 3, pool: 2 });
    expect(s.events).toBe(b);
  });
  it('Instant queues nothing', () => {
    expect(pushSteps(noSteps<View, Ev>(), { score: 0, pool: 0 }, [ev(1, 'gain', 1)], isStep, true).queue).toEqual([]);
  });
});

describe('foldView', () => {
  const evs = [ev(1, 'gain', 2), ev(2, 'roll', 2), ev(3, 'gain', 5)];
  const live: View = { score: 7, pool: 1 };
  const at = (n: number, o: FoldOptions<Ev> = {}) => foldView({ base: { score: 0, pool: 3 }, events: evs, queue: evs.slice(n) }, live, fold, o);
  it('the view as of the step on screen: earlier steps and its own applied, later ones not yet', () => {
    expect(at(0)).toEqual({ score: 2, pool: 3 });
    expect(at(1)).toEqual({ score: 2, pool: 1 });
    expect(at(2)).toEqual({ score: 7, pool: 1 });
  });
  it('nothing paced, no base or no live view: null (the game shows the live view)', () => {
    expect(at(3)).toBeNull();
    expect(foldView({ base: null, events: evs, queue: evs }, live, fold)).toBeNull();
    expect(foldView({ base: live, events: evs, queue: evs }, null, fold)).toBeNull();
  });
  it("the game's own shown and later rules", () => {
    // a roll's dice leave the pool with its own beat; a gain is shown one step early
    expect(at(1, { later: (e, st) => e.seq > st.seq || (e === st && e.t === 'roll') })).toEqual({ score: 2, pool: 3 });
    expect(at(1, { shown: (es, st) => es.filter((e) => e.seq <= st.seq + 1) })).toEqual({ score: 7, pool: 1 });
  });
  it('foldBefore: the view where the step starts', () => {
    const s: Steps<View, Ev> = { base: { score: 0, pool: 3 }, events: evs, queue: evs };
    expect(foldBefore(s, evs[2] as Ev, live, fold)).toEqual({ score: 2, pool: 1 });
    expect(foldBefore(s, evs[0] as Ev, live, fold)).toEqual({ score: 0, pool: 1 });
    expect(foldBefore(s, ev(9, 'gain'), live, fold)).toEqual({ score: 0, pool: 1 });
    expect(foldBefore({ ...s, base: null }, evs[0] as Ev, live, fold)).toBeNull();
  });
});

describe('stepper', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const setup = (instant = false) => {
    let s = pushSteps(noSteps<View, Ev>(), { score: 0, pool: 0 }, [ev(1, 'gain'), ev(2, 'note'), ev(3, 'roll'), ev(4, 'gain')], () => true);
    const log: string[] = [];
    const ends = new Map<number, () => void>();
    const drive = () => { st.drive(); };
    const st = createStepper<Ev>({
      head: () => s.queue[0] ?? null, instant: () => instant,
      advance: () => { s = advance(s); drive(); }, skip: () => { s = skip(s); drive(); },
      play: (e, next, read) => { log.push(`play ${String(e.seq)}`); if (e.t === 'note') read(900); else if (e.t === 'roll') throw new Error('x'); else ends.set(e.seq, next); },
      left: () => { log.push('left'); }, idle: () => { log.push('idle'); },
    });
    return { st, log, ends, set: (f: (x: Steps<View, Ev>) => Steps<View, Ev>) => { s = f(s); drive(); }, q: () => s.queue.map((e) => e.seq) };
  };
  it('one step at a time; a reading step waits its time; a step that throws is passed', () => {
    const { st, log, ends, q } = setup();
    st.drive(); st.drive();
    expect(log).toEqual(['left', 'play 1']);
    ends.get(1)?.();
    expect(q()).toEqual([2, 3, 4]);
    vi.advanceTimersByTime(899);
    expect(st.current()?.seq).toBe(2);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(['left', 'play 1', 'play 2', 'play 3', 'play 4']);
    ends.get(1)?.(); // a late end of an old step does nothing
    expect(q()).toEqual([4]);
    ends.get(4)?.();
    expect(log.at(-1)).toBe('idle');
    expect(st.current()).toBeNull();
  });
  it('a press ends a reading step only', () => {
    const { st, ends, q } = setup();
    st.drive();
    expect(st.press()).toBe(false);
    ends.get(1)?.();
    expect(st.press()).toBe(true);
    expect(q()).toEqual([4]);
    vi.advanceTimersByTime(2000);
    expect(q()).toEqual([4]);
  });
  it('leaving the step (skip, undo, load) tells the game and drops the reading timer', () => {
    const { st, log, ends, set, q } = setup();
    st.drive(); ends.get(1)?.();
    set(skip);
    expect(log.slice(-2)).toEqual(['left', 'idle']);
    expect(st.press()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(q()).toEqual([]);
  });
  it('a late read from an old step does nothing', () => {
    let s = pushSteps(noSteps<View, Ev>(), { score: 0, pool: 0 }, [ev(1, 'note'), ev(2, 'gain')], () => true);
    const reads = new Map<number, (ms: number) => void>(), ends = new Map<number, () => void>();
    const st = createStepper<Ev>({
      head: () => s.queue[0] ?? null, instant: () => false,
      advance: () => { s = advance(s); st.drive(); }, skip: () => { s = skip(s); st.drive(); },
      play: (e, next, read) => { reads.set(e.seq, read); ends.set(e.seq, next); },
    });
    st.drive();
    reads.get(1)?.(500);
    expect(st.press()).toBe(true);
    expect(st.current()?.seq).toBe(2);
    reads.get(1)?.(100);
    expect(st.press()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(st.current()?.seq).toBe(2);
    reads.get(2)?.(300); reads.get(2)?.(600);
    vi.advanceTimersByTime(300);
    expect(st.current()?.seq).toBe(2);
    vi.advanceTimersByTime(300);
    expect(st.current()).toBeNull();
  });
  it('play may call next synchronously', () => {
    let s = pushSteps(noSteps<View, Ev>(), { score: 0, pool: 0 }, [ev(1, 'gain'), ev(2, 'gain'), ev(3, 'gain')], () => true);
    const log: string[] = [];
    const st = createStepper<Ev>({
      head: () => s.queue[0] ?? null, instant: () => false,
      advance: () => { s = advance(s); st.drive(); }, skip: () => { s = skip(s); st.drive(); },
      play: (e, next) => { log.push(`play ${String(e.seq)}`); next(); },
      left: () => { log.push('left'); }, idle: () => { log.push('idle'); },
    });
    st.drive();
    expect(log).toEqual(['left', 'play 1', 'play 2', 'play 3', 'idle']);
    expect(s.queue).toEqual([]);
    expect(st.current()).toBeNull();
  });
  it('Instant drops the queue and plays nothing', () => {
    const { st, log, q } = setup(true);
    st.drive();
    expect(q()).toEqual([]);
    expect(log.some((l) => l.startsWith('play'))).toBe(false);
  });
});

describe('questionZone', () => {
  const z = { question: { r: [100, 100, 100, 100] as const }, 'question.alt': { r: [0, 0, 10, 10] as const }, field: { r: [150, 150, 100, 100] as const }, lineup: { r: [150, 150, 10, 10] as const }, tray: { r: [500, 500, 10, 10] as const } };
  const altOk = ['field', 'tray', 'pool', 'batter', 'team'];
  it('the band moves only for allowed targets under its home', () => {
    expect(questionZone(['field'], z, { altOk })).toBe('question.alt');
    expect(questionZone(['tray'], z, { altOk })).toBe('question');
    expect(questionZone(['field', 'lineup'], z, { altOk })).toBe('question');
    expect(questionZone([], z, { altOk })).toBe('question');
    expect(questionZone(['nowhere'], z)).toBe('question');
  });
  it('without altOk every target may move it; touching edges do not meet', () => {
    expect(questionZone(['field', 'lineup'], z)).toBe('question.alt');
    expect(questionZone(['edge'], { ...z, edge: { r: [200, 100, 50, 50] as const } })).toBe('question');
  });
  it('no second rect, or other zone names', () => {
    expect(questionZone(['field'], { question: z.question, field: z.field }, { altOk })).toBe('question');
    expect(questionZone(['field'], { band: z.question, 'band.2': z['question.alt'], field: z.field }, { home: 'band', alt: 'band.2' })).toBe('band.2');
    expect(questionZone(['field'], z, { home: 'band' })).toBe('band');
  });
});
