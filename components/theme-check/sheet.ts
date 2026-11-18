import type { ReactNode } from 'react';

export interface SheetState {
  readonly label: string;
  readonly render: () => ReactNode;
}
export interface SheetEntry {
  readonly id: string;
  readonly label: string;
  /** `picks` holds the chosen option of each `variants` key. */
  readonly render: (picks: Readonly<Record<string, string>>) => ReactNode;
  /** A toggle per key (a view, a side); the first option is the start. */
  readonly variants?: Readonly<Record<string, readonly string[]>>;
  /** Further looks of the same entry (sample props), each under its own label. */
  readonly states?: readonly SheetState[];
}

const split = (hash: string): [string, URLSearchParams] => {
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('?');
  if (i >= 0) return [h.slice(0, i), new URLSearchParams(h.slice(i + 1))];
  return h.includes('=') ? ['', new URLSearchParams(h)] : [h, new URLSearchParams()];
};

/** The filter kept in a hash: `q=` in its query part (`#/dev/sheet?q=button`, or `#q=button`). */
export function filterFromHash(hash: string): string {
  return split(hash)[1].get('q') ?? '';
}

/** The hash with `q` set (or dropped when empty); other params and the path stay. */
export function hashWithFilter(hash: string, q: string): string {
  const [path, params] = split(hash);
  if (q === '') params.delete('q');
  else params.set('q', q);
  const query = params.toString();
  return `#${path}${query === '' ? '' : path === '' ? query : `?${query}`}`;
}

export function filterEntries(entries: readonly SheetEntry[], q: string): readonly SheetEntry[] {
  const needle = q.trim().toLowerCase();
  return needle === '' ? entries : entries.filter((e) => `${e.id} ${e.label}`.toLowerCase().includes(needle));
}
