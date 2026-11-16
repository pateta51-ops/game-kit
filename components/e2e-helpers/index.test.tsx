import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { expectAccessible, type Axe, type Violation } from './a11y';
import { VIEWPORTS, autosaveSettled, expectNoHorizontalScroll, finishAnimations, idbCount, motionsDone, settle, shoot, watchErrors, type EvalPage, type WatchPage } from './index';

// as Playwright does: each function is rebuilt from its source and run with only its argument, so one that closes over
// a module binding fails here
const alone = <A, R>(fn: (arg: A) => R): ((arg: A) => R) => globalThis.eval(`(${fn.toString()})`) as (arg: A) => R;
const page: EvalPage = { evaluate: (fn, arg) => Promise.resolve(alone(fn)(arg)) };
const anim = (iterations: number) => ({ effect: { getComputedTiming: () => ({ iterations }) }, finish: vi.fn(), finished: Promise.resolve() });
const withAnimations = (list: ReturnType<typeof anim>[]): void => {
  Object.defineProperty(document, 'getAnimations', { configurable: true, value: () => list });
};
const info = () => ({ outputPath: (n: string) => `out/${n}`, attach: vi.fn(() => Promise.resolve()) });

describe('e2e-helpers', () => {
  it('watchErrors collects errors, drops ignored lines, fails at the end', () => {
    const on: Record<string, (x: unknown) => void> = {};
    const p = {
      on: (e: string, fn: (x: unknown) => void) => {
        on[e] = fn;
      },
    } as unknown as WatchPage;
    const w = watchErrors(p, ['/packs/real/', /favicon/]);
    w.check();
    on['pageerror']?.(new Error('boom'));
    on['console']?.({ type: () => 'error', text: () => 'bad' });
    on['console']?.({ type: () => 'error', text: () => 'Failed to load resource: 404' });
    on['console']?.({ type: () => 'log', text: () => 'fine' });
    on['response']?.({ status: () => 404, url: () => 'http://x/packs/real/pack.json' });
    on['response']?.({ status: () => 404, url: () => 'http://x/favicon.ico' });
    on['response']?.({ status: () => 500, url: () => 'http://x/a' });
    on['response']?.({ status: () => 200, url: () => 'http://x/b' });
    on['requestfailed']?.({ url: () => 'http://x/c', failure: () => ({ errorText: 'net::ERR_FAILED' }) });
    on['requestfailed']?.({ url: () => 'http://x/favicon.ico', failure: () => null });
    expect(w.errors).toEqual(['uncaught: boom', 'console: bad', 'http 500: http://x/a', 'failed: http://x/c net::ERR_FAILED']);
    expect(() => {
      w.check();
    }).toThrow(/uncaught: boom/);
  });

  it('expectNoHorizontalScroll fails when the page is wider than the window', async () => {
    const el = document.documentElement;
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 100 });
    await expectNoHorizontalScroll(page, 'home');
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 140 });
    await expect(expectNoHorizontalScroll(page, 'home')).rejects.toThrow('home scrolls sideways (140px of 100px)');
  });

  it('settle and finishAnimations leave endless animations alone', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
    const once = anim(1);
    const loop = anim(Infinity);
    withAnimations([once, loop]);
    await settle(page);
    await finishAnimations(page);
    expect(once.finish).toHaveBeenCalledTimes(2);
    expect(loop.finish).not.toHaveBeenCalled();
    withAnimations([{ ...anim(1), finished: new Promise<void>(() => undefined) }]);
    await settle(page, 20);
  });

  it('motionsDone waits on the marker the game names', async () => {
    const seen: boolean[] = [];
    const waitForFunction = vi.fn(<A,>(fn: (arg: A) => unknown, arg: A) => {
      seen.push(Boolean(alone(fn)(arg)));
      return Promise.resolve();
    });
    await motionsDone({ waitForFunction }, '.moving', 5);
    expect(waitForFunction).toHaveBeenCalledWith(expect.any(Function), '.moving', { timeout: 5 });
    await motionsDone({ waitForFunction }, 'html');
    expect(seen).toEqual([true, false]);
  });

  it('shoot keeps a named full-page screenshot', async () => {
    const i = info();
    const screenshot = vi.fn(() => Promise.resolve());
    await shoot({ screenshot }, i, 'board');
    expect(screenshot).toHaveBeenCalledWith({ path: 'out/board.png', fullPage: true });
    expect(i.attach).toHaveBeenCalledWith('board', { path: 'out/board.png', contentType: 'image/png' });
    expect(VIEWPORTS.map((v) => v.name)).toEqual(['uhd', 'laptop', 'phone']);
  });

  it('autosaveSettled waits until the stored count reaches the one in memory', async () => {
    let stored = 1;
    await autosaveSettled(
      () => Promise.resolve(3),
      () => Promise.resolve((stored += 1)),
    );
    expect(stored).toBe(3);
    await expect(
      autosaveSettled(
        () => Promise.resolve(3),
        () => Promise.resolve(-1),
        60,
      ),
    ).rejects.toThrow('autosave not settled: -1 stored of 3 in memory');
    await expect(
      autosaveSettled(
        () => Promise.resolve(3),
        () => new Promise<number>(() => undefined),
        60,
      ),
    ).rejects.toThrow('autosave not settled: NaN stored of 3 in memory');
  });

  it('idbCount reads the action count of a stored save', async () => {
    const at = { db: 'g-saves', store: 'saves', key: 'autosave', path: ['save', 'actions'] };
    // asked before the game ever opened its database: the answer is -1 and no empty database is left behind,
    // so the game's own open below still gets its upgrade and makes the store
    expect(await idbCount(page, at)).toBe(-1);
    await new Promise<void>((resolve) => {
      const open = indexedDB.open('g-saves', 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('saves');
      };
      open.onsuccess = () => {
        const tx = open.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ save: { actions: [1, 2, 3] } }, 'autosave');
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
    });
    expect(await idbCount(page, at)).toBe(3);
    expect(await idbCount(page, { ...at, key: 'slot-1' })).toBe(-1);
    expect(await idbCount(page, { ...at, path: ['save', 'turn'] })).toBe(-1);
  });

  it('expectAccessible fails on serious or critical, attaches the rest', async () => {
    withAnimations([]);
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
    const v = (id: string, impact: string): Violation => ({ id, impact, help: `${id} help`, nodes: [{ target: ['#a'], failureSummary: 'fix' }] });
    let found: Violation[] = [v('region', 'moderate')];
    let tags: string[] = [];
    const Fake = class {
      withTags(t: string[]) {
        tags = t;
        return { analyze: () => Promise.resolve({ violations: found }) };
      }
    } as unknown as Axe<EvalPage>;
    const i = info();
    await expectAccessible(Fake, page, i, 'home');
    expect(tags).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    expect(i.attach).toHaveBeenCalledWith('axe-minor-home', expect.objectContaining({ contentType: 'application/json' }));
    found = [v('color-contrast', 'serious'), v('label', 'critical'), v('region', 'minor')];
    await expect(expectAccessible(Fake, page, i, 'home')).rejects.toThrow(/axe on home:\ncolor-contrast \(serious\): color-contrast help\n {2}#a: fix\nlabel \(critical\)/);
  });
});
