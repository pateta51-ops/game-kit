import { describe, expect, it } from 'vitest';
import { bindLinkTooltip, type LinkPointerEvent } from './index';

interface Link {
  id: string | null;
  closest: (s: string) => Link | null;
}
const link = (id: string | null): Link => ({ id, closest: function (this: Link) { return this; } });
const plain = { closest: () => null };

function setup() {
  const fns: Record<string, (e: LinkPointerEvent) => void> = {};
  const root = {
    addEventListener: (t: string, f: (e: LinkPointerEvent) => void) => { fns[t] = f; },
    removeEventListener: (t: string) => { delete fns[t]; },
  };
  const tasks = new Map<number, () => void>();
  let n = 0;
  const timers = {
    set: (f: () => void) => { tasks.set(++n, f); return n; },
    clear: (id: unknown) => { tasks.delete(id as number); },
  };
  const log: string[] = [];
  const unbind = bindLinkTooltip<Link>(root, { selector: 'a', read: (l) => l.id, open: (id) => log.push('open ' + id), close: () => log.push('close'), timers });
  const run = (): void => { for (const [k, f] of [...tasks]) { tasks.delete(k); f(); } };
  return { fns, log, run, unbind };
}

describe('bindLinkTooltip', () => {
  it('opens a link after the rest, then the next one at once, closes off a link', () => {
    const s = setup();
    const a = link('a');
    s.fns.pointermove?.({ target: a });
    expect(s.log).toEqual([]);
    s.run();
    expect(s.log).toEqual(['open a']);
    s.fns.pointermove?.({ target: link('b') });
    expect(s.log).toEqual(['open a', 'close', 'open b']);
    s.fns.pointermove?.({ target: plain });
    expect(s.log.at(-1)).toBe('close');
  });
  it('ignores touch and a link with no id', () => {
    const s = setup();
    s.fns.pointermove?.({ target: link('a'), pointerType: 'touch' });
    s.fns.pointermove?.({ target: link(null) });
    s.run();
    expect(s.log).toEqual([]);
  });
  it('a press hides it until the pointer leaves that link', () => {
    const s = setup();
    const a = link('a');
    s.fns.pointermove?.({ target: a });
    s.run();
    s.fns.pointerdown?.({ target: a });
    s.fns.pointermove?.({ target: a });
    s.run();
    expect(s.log).toEqual(['open a', 'close']);
    s.fns.pointermove?.({ target: plain });
    s.fns.pointermove?.({ target: a });
    s.run();
    expect(s.log.at(-1)).toBe('open a');
  });
  it('unbind removes the listeners', () => {
    const s = setup();
    s.unbind();
    expect(s.fns.pointermove).toBeUndefined();
  });
});
