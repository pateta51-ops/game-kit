import { describe, expect, it } from 'vitest';
import { createPlayClock, type StatsStorage } from './index.ts';

const KEY = 'fake.session.v1';
const memory = (init: Record<string, string> = {}): StatsStorage & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
};
const refusing: StatsStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};
const setup = (storage: StatsStorage, idleMs?: number) => {
  const t = { now: 1000 };
  const clock = createPlayClock({ key: KEY, storage, now: () => t.now, ...(idleMs === undefined ? {} : { idleMs }) });
  return { t, clock };
};

describe('createPlayClock', () => {
  it('has no session before a game starts, and a tick then counts nothing', () => {
    const { clock } = setup(memory());
    clock.tick();
    expect(clock.session()).toBeNull();
  });

  it('counts the time between moves, a long gap only up to the idle cap', () => {
    const { t, clock } = setup(memory(), 100);
    clock.start('g1');
    t.now += 40;
    clock.tick();
    t.now += 5000;
    clock.tick();
    expect(clock.session()).toEqual({ id: 'g1', playMs: 140 });
  });

  it('defaults to a five-minute cap and ignores a clock that went back', () => {
    const { t, clock } = setup(memory());
    clock.start('g1');
    t.now += 400_000;
    clock.tick();
    t.now -= 50;
    clock.tick();
    expect(clock.session()?.playMs).toBe(300_000);
  });

  it('does not count the time between pause and resume', () => {
    const { t, clock } = setup(memory());
    clock.start('g1');
    t.now += 10;
    clock.pause();
    t.now += 30;
    clock.tick();
    t.now += 40;
    clock.tick();
    expect(clock.session()?.playMs).toBe(10);
    clock.resume('g1');
    t.now += 5;
    clock.tick();
    expect(clock.session()?.playMs).toBe(15);
  });

  it('goes on after a reload for the same game, and starts at zero for another', () => {
    const m = memory();
    const a = setup(m);
    a.clock.start('g1');
    a.t.now += 30;
    a.clock.tick();
    const b = setup(m);
    b.clock.resume('g1');
    b.t.now += 7;
    b.clock.tick();
    expect(b.clock.session()).toEqual({ id: 'g1', playMs: 37 });
    const c = setup(m);
    c.clock.resume('g2');
    expect(c.clock.session()).toEqual({ id: 'g2', playMs: 0 });
  });

  it('stop removes the session', () => {
    const m = memory();
    const { clock } = setup(m);
    clock.start('g1');
    clock.stop();
    clock.tick();
    expect(clock.session()).toBeNull();
    expect(KEY in m.data).toBe(false);
  });

  it.each(['junk', '5', '{"id":1,"playMs":2}', '{"id":"g1","playMs":"x"}', '{"id":"g1","playMs":-4}'])('reads stored %s as no session', (text) => {
    expect(setup(memory({ [KEY]: text })).clock.session()).toBeNull();
  });

  it('ignores a clock that gives no number', () => {
    const { t, clock } = setup(memory());
    clock.start('g1');
    t.now += 10;
    clock.tick();
    const at = t.now;
    t.now = Number.NaN;
    clock.tick();
    t.now = at + 5;
    clock.tick();
    expect(clock.session()).toEqual({ id: 'g1', playMs: 15 });
  });

  it('holds for the page when storage refuses', () => {
    const { t, clock } = setup(refusing);
    expect(clock.session()).toBeNull();
    clock.start('g1');
    t.now += 20;
    clock.tick();
    expect(clock.session()).toEqual({ id: 'g1', playMs: 20 });
  });
});
