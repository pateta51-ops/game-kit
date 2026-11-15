// Hash routes: `#/name/part/part?query`. No hash, `#/` and any name not in the game's list are the home route. A move
// the code makes on its own goes through follow(), checked against the game's route machine.
import { transition, type Machine } from '../state-machines/machine';

export interface Route<N extends string> {
  readonly name: N;
  /** The path parts after the name (`#/proof/abc` gives ['abc']), decoded. */
  readonly parts: readonly string[];
  readonly query: URLSearchParams;
}

const decode = (t: string): string => {
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
};

export function parseHash<N extends string>(hash: string, names: readonly N[], home: N): Route<N> {
  const raw = hash.replace(/^#/, '');
  const at = raw.indexOf('?');
  const [first, ...rest] = (at < 0 ? raw : raw.slice(0, at)).split('/').filter((p) => p !== '');
  const query = new URLSearchParams(at < 0 ? '' : raw.slice(at + 1));
  const name = names.find((n) => n === first);
  return name === undefined ? { name: home, parts: [], query } : { name, parts: rest.map(decode), query };
}

/** The hash of a route: `#/` for home, else `#/name/parts`, with `?query` when given. */
export function routeHref<N extends string>(name: N, home: N, parts: readonly string[] = [], query = ''): string {
  const path = name === home && parts.length === 0 ? '#/' : `#/${[name, ...parts.map(encodeURIComponent)].join('/')}`;
  return query === '' ? path : `${path}?${query}`;
}

export function navigate(href: string): void {
  window.location.hash = href;
}

/** Go without a history entry (Back does not return to the route left). */
export function replaceRoute(href: string): void {
  window.location.replace(href);
}

/** The code's own move `event` from route `from`, checked against the machine; returns the hash it went to. */
export function follow<N extends string, E extends string>(
  machine: Machine<N, E>,
  from: N,
  event: E,
  home: N,
  query = '',
  go: (href: string) => void = navigate,
): string {
  const href = routeHref(transition(machine, from, event), home, [], query);
  go(href);
  return href;
}
