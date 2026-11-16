// Playwright helpers for a game's browser tests. `page` and `testInfo` are Playwright's; typed by shape, so the kit needs no Playwright.
// A failed check throws an Error, which fails the test.
export interface EvalPage {
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}
export interface WatchPage {
  on(event: 'pageerror', fn: (e: Error) => void): unknown;
  on(event: 'console', fn: (m: { type(): string; text(): string }) => void): unknown;
  on(event: 'response', fn: (r: { status(): number; url(): string }) => void): unknown;
  on(event: 'requestfailed', fn: (r: { url(): string; failure(): { errorText: string } | null }) => void): unknown;
}
export interface WaitPage {
  waitForFunction<A>(fn: (arg: A) => unknown, arg: A, options?: { timeout?: number }): Promise<unknown>;
}
export interface ShotPage {
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
}
export interface Info {
  outputPath(name: string): string;
  attach(name: string, options: { path?: string; body?: string; contentType: string }): Promise<unknown>;
}

export const VIEWPORTS = [
  { name: 'uhd', width: 3840, height: 2160 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 664 },
] as const;
export type ViewportName = (typeof VIEWPORTS)[number]['name'];

// Uncaught exceptions, console errors and refused requests (status 400+), as lines. `ignore` drops lines (a string is a substring).
// Call `check()` at the end of the test.
export function watchErrors(page: WatchPage, ignore: (string | RegExp)[] = []): { errors: string[]; check(): void } {
  const errors: string[] = [];
  const add = (line: string): void => {
    if (!ignore.some((i) => (typeof i === 'string' ? line.includes(i) : i.test(line)))) errors.push(line);
  };
  page.on('pageerror', (e) => {
    add(`uncaught: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) add(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) add(`http ${String(r.status())}: ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    add(`failed: ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  return {
    errors,
    check: () => {
      if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`);
    },
  };
}

export async function expectNoHorizontalScroll(page: EvalPage, where: string): Promise<void> {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }), undefined);
  if (size.scroll > size.client) throw new Error(`${where} scrolls sideways (${String(size.scroll)}px of ${String(size.client)}px)`);
}

// Wait until every CSS animation and transition that ends has ended, `timeout` ms at most (a paused one never ends).
export async function settle(page: EvalPage, timeout = 5_000): Promise<void> {
  await page.evaluate(
    (ms) =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        ),
        new Promise((r) => setTimeout(r, ms)),
      ]).then(() => undefined),
    timeout,
  );
}

// Jump every animation that ends to its end, twice with a frame between (a finished one can start the next).
export async function finishAnimations(page: EvalPage): Promise<void> {
  for (let pass = 0; pass < 2; pass += 1) {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          for (const a of document.getAnimations()) if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish();
          requestAnimationFrame(() => {
            resolve();
          });
        }),
      undefined,
    );
  }
}

// Wait until nothing matches `moving`, the marker the game sets while its own motions play.
export async function motionsDone(page: WaitPage, moving = 'html[data-moving]', timeout = 30_000): Promise<void> {
  await page.waitForFunction((sel) => !document.querySelector(sel), moving, { timeout });
}

// A full-page screenshot kept with the test's results.
export async function shoot(page: ShotPage, testInfo: Info, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

// Before a reload: wait until the stored autosave holds every action in memory. The game says how to read both counts.
export async function autosaveSettled(memory: () => Promise<number>, stored: () => Promise<number>, timeout = 10_000): Promise<void> {
  const end = Date.now() + timeout;
  // a reader that hangs reads NaN at the limit
  const read = async (f: () => Promise<number>): Promise<number> => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<number>((r) => {
      t = setTimeout(() => {
        r(NaN);
      }, Math.max(0, end - Date.now()));
    });
    try {
      return await Promise.race([f(), late]);
    } finally {
      clearTimeout(t);
    }
  };
  for (;;) {
    const m = await read(memory);
    const s = await read(stored);
    if (m >= 0 && m === s) return;
    if (Date.now() >= end) throw new Error(`autosave not settled: ${String(s)} stored of ${String(m)} in memory`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// A `stored` reader for IndexedDB: the length of the array (or the number) at `path` in the record `key`; -1 when absent,
// blocked or not answered in 5 s. It never creates the database.
export async function idbCount(page: EvalPage, at: { db: string; store: string; key: string; path: string[] }): Promise<number> {
  return await page.evaluate(
    ({ db, store, key, path }) =>
      new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(-1);
        }, 5000);
        const open = indexedDB.open(db);
        // no such database yet: abort, so none is created and the game's own open still gets its upgrade
        open.onupgradeneeded = () => {
          open.transaction?.abort();
        };
        open.onblocked = () => {
          resolve(-1);
        };
        open.onerror = (e) => {
          e.preventDefault();
          resolve(-1);
        };
        open.onsuccess = () => {
          const d = open.result;
          if (!d.objectStoreNames.contains(store)) {
            d.close();
            resolve(-1);
            return;
          }
          const get = d.transaction(store).objectStore(store).get(key);
          get.onerror = () => {
            d.close();
            resolve(-1);
          };
          get.onsuccess = () => {
            let v: unknown = get.result;
            for (const k of path) v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
            d.close();
            resolve(Array.isArray(v) ? v.length : typeof v === 'number' ? v : -1);
          };
        };
      }),
    at,
  );
}
