// One game state per prompt kind and per ending. The game supplies the kinds, the states and (in Gallery.tsx) the render
// function; this holds the registry, the completeness check, the stale check and the harvest of real games.
export type FixtureGroup = 'prompt' | 'ending';

export interface Fixture<S> {
  readonly group: FixtureGroup;
  readonly kind: string;
  /** The state: built, replayed from a stored history, or loaded. It may throw or reject. */
  readonly state: () => S | Promise<S>;
  readonly note?: string;
}

export interface GallerySpec<S> {
  /** Every prompt kind of the engine (the list its prompt type is made from). */
  readonly prompts: readonly string[];
  /** Every ending (result kind). */
  readonly endings: readonly string[];
  readonly fixtures: readonly Fixture<S>[];
  /** What the state really shows: the open prompt's kind, or the result's kind; null when none. */
  readonly kindOf?: (state: S, group: FixtureGroup) => string | null;
}

export interface GalleryEntry<S> {
  readonly id: string;
  readonly group: FixtureGroup;
  readonly kind: string;
  readonly fixture: Fixture<S> | null;
}

export const fixtureId = (group: FixtureGroup, kind: string): string => `${group}:${kind}`;

/** Every kind in the game's order, prompts first, each with its fixture or null. */
export function galleryEntries<S>(spec: GallerySpec<S>): GalleryEntry<S>[] {
  const of = (group: FixtureGroup, kinds: readonly string[]): GalleryEntry<S>[] =>
    kinds.map((kind) => ({ id: fixtureId(group, kind), group, kind, fixture: spec.fixtures.find((f) => f.group === group && f.kind === kind) ?? null }));
  return [...of('prompt', spec.prompts), ...of('ending', spec.endings)];
}

/** The completeness check: a line per kind with no fixture, per fixture of a kind the game does not list, per second
 * fixture of a kind, and one for an empty prompts list (endings may be empty). Empty when complete. */
export function checkGallery<S>(spec: GallerySpec<S>): string[] {
  const bad = galleryEntries(spec)
    .filter((e) => e.fixture === null)
    .map((e) => `${e.group} kind ${e.kind} has no fixture`);
  if (spec.prompts.length === 0) bad.unshift('the game lists no prompt kinds');
  const seen = new Set<string>();
  for (const f of spec.fixtures) {
    const id = fixtureId(f.group, f.kind);
    if (!(f.group === 'prompt' ? spec.prompts : spec.endings).includes(f.kind)) bad.push(`fixture ${id} is of a kind the game does not list`);
    if (seen.has(id)) bad.push(`fixture ${id} is there twice`);
    seen.add(id);
  }
  return bad;
}

export type Loaded<S> = { readonly ok: true; readonly state: S } | { readonly ok: false; readonly error: string };

/** The fixture's state, or why not: it threw, took longer than `ms`, or (with `kindOf`) no longer shows its kind. */
export async function loadFixture<S>(spec: GallerySpec<S>, fixture: Fixture<S>, ms = 10_000): Promise<Loaded<S>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      Promise.resolve().then(() => fixture.state()),
      new Promise<never>((_, no) => {
        timer = setTimeout(() => {
          no(new Error(`did not load in ${String(ms)} ms`));
        }, ms);
      }),
    ]);
    if (spec.kindOf) {
      const got = spec.kindOf(state, fixture.group);
      if (got !== fixture.kind) return { ok: false, error: `shows ${got ?? `no ${fixture.group}`}, not ${fixture.kind}` };
    }
    return { ok: true, state };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** The stale check: loads every fixture; a line per one that fails. Empty when all show their kind. */
export async function checkStates<S>(spec: GallerySpec<S>, ms?: number): Promise<string[]> {
  const bad: string[] = [];
  for (const f of spec.fixtures) {
    const r = await loadFixture(spec, f, ms);
    if (!r.ok) bad.push(`fixture ${fixtureId(f.group, f.kind)}: ${r.error}`);
  }
  return bad;
}

export interface Seen<T> {
  readonly group: FixtureGroup;
  readonly kind: string;
  /** Higher is kept (a fuller table is a better picture); without scores the first one seen is kept. */
  readonly score?: number;
  readonly value: T;
}

/** The harvest of real games: the game's loop plays its drivers and yields, at each prompt and each ending, what it would
 * store (seed and actions so far); this keeps one per kind, keyed by fixtureId. */
export function keepBest<T>(seen: Iterable<Seen<T>>): Map<string, T> {
  const best = new Map<string, { score: number; value: T }>();
  for (const s of seen) {
    const id = fixtureId(s.group, s.kind);
    const cur = best.get(id);
    if (cur === undefined || (s.score ?? 0) > cur.score) best.set(id, { score: s.score ?? 0, value: s.value });
  }
  return new Map([...best].map(([id, b]) => [id, b.value]));
}

/** The dev switch: `?dev=1` before the `#`, and only where the game allows it (its build's dev flag; false in a
 * production build unless the game says otherwise). Read at each call, nothing stored. */
export function isDevMode(search: string = typeof window === 'undefined' ? '' : window.location.search, allowed = false): boolean {
  return allowed && new URLSearchParams(search).get('dev') === '1';
}
