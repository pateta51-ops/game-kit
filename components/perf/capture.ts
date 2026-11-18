// Browser and runtime perf capture. The page is any object with the Playwright methods below, so tests inject a fake.
export interface PerfPage {
  addInitScript(script: string): Promise<unknown>;
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  evaluate<T = unknown>(script: string): Promise<T>;
  waitForFunction(script: string, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
}

export interface CaptureOptions {
  url: string;
  /** Page expression that is truthy once the app is usable (default: the document is complete). */
  ready?: string;
  /** Page expression returning an object of numbers (render counters); read after load and around each action. */
  counters?: string;
  /** Page expression returning a function `(action) => void` that dispatches through the game's store. */
  dispatch?: string;
  actions?: unknown[];
  readyTimeoutMs?: number;
}

export interface Stat { n: number; p50: number; p95: number; max: number }
export interface LoadRun { ttfb: number; domContentLoaded: number; loadEnd: number; firstPaint: number; firstContentfulPaint: number; longTasks: number; longTaskMs: number; longTaskMax: number }
export interface PerfCapture {
  version: 1;
  url: string;
  load: LoadRun;
  counters: Record<string, number>;
  dispatch?: { actions: number; syncMs: Stat; paintMs: Stat; counters: Record<string, number> };
}

/** Runs in the page before any script: records long tasks. */
export const OBSERVE = `window.__perfLong=[];try{new PerformanceObserver(function(l){for(const e of l.getEntries())window.__perfLong.push(e.duration)}).observe({type:'longtask',buffered:true})}catch(e){}`;

const LOAD = `(function(){var n=performance.getEntriesByType('navigation')[0]||{};var p=function(k){var e=performance.getEntriesByName(k)[0];return e?e.startTime:0};var l=window.__perfLong||[];return{ttfb:n.responseStart||0,domContentLoaded:n.domContentLoadedEventEnd||0,loadEnd:n.loadEventEnd||0,firstPaint:p('first-paint'),firstContentfulPaint:p('first-contentful-paint'),longTasks:l.length,longTaskMs:l.reduce(function(a,b){return a+b},0),longTaskMax:l.length?Math.max.apply(null,l):0}})()`;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function stat(values: readonly number[]): Stat {
  const s = [...values].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(s.length * f))] ?? 0;
  return { n: s.length, p50: r3(q(0.5)), p95: r3(q(0.95)), max: r3(s[s.length - 1] ?? 0) };
}

/** One capture: load timing, counters after load, and the cost of dispatching `actions` one by one. */
export async function capture(page: PerfPage, o: CaptureOptions): Promise<PerfCapture> {
  await page.addInitScript(OBSERVE);
  await page.goto(o.url, { waitUntil: 'load' });
  await page.waitForFunction(o.ready ?? `document.readyState==='complete'`, null, { timeout: o.readyTimeoutMs ?? 30000 });
  await page.evaluate(`new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})`);
  const out: PerfCapture = { version: 1, url: o.url, load: await page.evaluate<LoadRun>(LOAD), counters: {} };
  const read = () => (o.counters ? page.evaluate<Record<string, number>>(`(${o.counters})`) : Promise.resolve({} as Record<string, number>));
  out.counters = await read();
  if (o.dispatch && o.actions?.length) {
    const sync: number[] = [];
    const paint: number[] = [];
    const total: Record<string, number> = {};
    for (const action of o.actions) {
      const before = await read();
      const t = await page.evaluate<{ s: number; p: number }>(
        `(async function(){var d=(${o.dispatch});var t=performance.now();d(${JSON.stringify(action)});var s=performance.now()-t;await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});return{s:s,p:performance.now()-t}})()`,
      );
      sync.push(t.s);
      paint.push(t.p);
      const after = await read();
      for (const k of Object.keys(after)) total[k] = (total[k] ?? 0) + (after[k] as number) - (before[k] ?? 0);
    }
    out.dispatch = { actions: o.actions.length, syncMs: stat(sync), paintMs: stat(paint), counters: total };
  }
  return out;
}

/** Counters and counts are exact; everything else is a timing. */
export const isExact = (path: string) => path.startsWith('counters.') || path.startsWith('dispatch.counters.') || path === 'dispatch.actions' || /\.n$/.test(path);

export function flatten(v: unknown, prefix = '', out: Record<string, number> = {}): Record<string, number> {
  if (typeof v === 'number') out[prefix] = v;
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

export interface Change { path: string; before: number | null; after: number | null; exact: boolean; pct: number | null; regression: boolean }
export interface Comparison { changes: Change[]; regressions: Change[]; same: number }
export interface CompareOptions {
  /** Percent a timing may grow before it is a regression (default 10). */
  thresholdPct?: number;
  /** A timing that grew by less than this many ms never regresses (default 1). */
  minMs?: number;
  /** Per-path threshold in percent, e.g. `{ 'dispatch.paintMs.p95': 25 }`; also lets a counter grow that much. */
  thresholds?: Record<string, number>;
}

/** Diffs two captures number by number. An exact value (counter) regresses on any increase, a timing over its threshold. */
export function compare(before: unknown, after: unknown, o: CompareOptions = {}): Comparison {
  const a = flatten(before);
  const b = flatten(after);
  const changes: Change[] = [];
  let same = 0;
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[path] ?? null;
    const y = b[path] ?? null;
    if (x === y) { same++; continue; }
    const exact = isExact(path);
    const pct = x !== null && y !== null && x !== 0 ? r3(((y - x) / x) * 100) : null;
    let regression = false;
    if (y === null) regression = true;
    else if (x !== null && y > x) {
      const limit = o.thresholds?.[path] ?? (exact ? 0 : (o.thresholdPct ?? 10));
      regression = (exact || y - x >= (o.minMs ?? 1)) && (pct === null || pct > limit);
    }
    changes.push({ path, before: x, after: y, exact, pct, regression });
  }
  return { changes, regressions: changes.filter((c) => c.regression), same };
}

export function formatComparison(c: Comparison): string {
  const l = c.changes.map((x) => `${x.regression ? 'REGRESSION' : 'changed   '} ${x.path}: ${String(x.before)} -> ${String(x.after)}${x.pct === null ? '' : ` (${x.pct > 0 ? '+' : ''}${String(x.pct)}%)`}`);
  return [...l, `${String(c.same)} equal, ${String(c.changes.length)} changed, ${String(c.regressions.length)} regressions`].join('\n');
}
