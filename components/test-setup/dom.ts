// jsdom stubs for component tests. Each stub is installed only when jsdom lacks it, so installing twice or on a real browser is harmless.
export interface DomStubOptions {
  /** what scrollWidth, clientWidth, offsetWidth and the heights report for every element (jsdom gives 0); default: leave jsdom's value */
  size?: { width: number; height: number };
  /** what `matchMedia(...).matches` answers; default false */
  matches?: boolean;
}
type Restore = () => void;
const MARK = '__kitStub';
const put = (o: object, k: string, v: unknown, undo: Restore[]): void => {
  const prev = Object.getOwnPropertyDescriptor(o, k);
  Object.defineProperty(o, k, typeof v === 'object' && v !== null && 'get' in v ? { configurable: true, ...(v as { get: () => unknown }) } : { configurable: true, writable: true, value: v });
  undo.push(() => (prev ? Object.defineProperty(o, k, prev) : Reflect.deleteProperty(o, k)));
};
const missing = (o: object, k: string): boolean => !(k in o);
const ours = (o: object, k: string): boolean => !!(o as Record<string, { [MARK]?: boolean }>)[k]?.[MARK];
const mark = <F extends object>(f: F): F => Object.assign(f, { [MARK]: true });
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}
/** Installs the stubs and returns a function that restores every original. A later call with options replaces the size and matchMedia stubs of an earlier one. */
export function installDomStubs(opts: DomStubOptions = {}): () => void {
  const undo: Restore[] = [];
  const restore = (): void => {
    while (undo.length) undo.pop()?.();
  };
  if (typeof window === 'undefined') return restore;
  const g = globalThis as unknown as Record<string, unknown>;
  const noop = () => undefined;
  for (const k of ['scrollIntoView', 'scrollTo', 'scrollBy']) if (missing(Element.prototype, k)) put(Element.prototype, k, noop, undo);
  // jsdom's window.scrollTo only logs "not implemented": replace that, keep a game's own
  for (const k of ['scrollTo', 'scrollBy'] as const) {
    const cur = Reflect.get(window, k) as (() => void) | undefined;
    if (!cur || /not.?implemented/i.test(String(cur))) put(window, k, noop, undo);
  }
  if (opts.size) {
    const { width, height } = opts.size;
    for (const [k, v] of [['scrollWidth', width], ['clientWidth', width], ['offsetWidth', width], ['scrollHeight', height], ['clientHeight', height], ['offsetHeight', height]] as const)
      put(HTMLElement.prototype, k, { get: () => v }, undo);
  }
  if (missing(window, 'matchMedia') || ours(window, 'matchMedia'))
    put(window, 'matchMedia', mark((query: string) => ({
      matches: opts.matches ?? false,
      media: query,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: () => false,
    })), undo);
  for (const [k, v] of [['ResizeObserver', NoopObserver], ['IntersectionObserver', NoopObserver], ['requestAnimationFrame', (fn: (t: number) => void) => setTimeout(() => fn(Date.now()), 16)], ['cancelAnimationFrame', (id: number) => clearTimeout(id)]] as const)
    if (missing(g, k)) put(g, k, v, undo);
  return restore;
}
