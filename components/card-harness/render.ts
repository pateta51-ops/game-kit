// K78: effect records rendered as English under the printed line they implement, for a reading judge. The game gives
// a template per record kind; a piece with no template, or a field its template never read, is shown as a render gap
// (`[render-gap ...]`, `[also {...}]`), so a reader can tell "the English is wrong" from "the English cannot show it".
// Design after middle-earth-player (MIT), `pnpm effects render` and `.claude/agents/reading-judge.md`.

export type Say = (piece: unknown) => string;
export interface RenderInput<R extends object> {
  /** The printed lines in card order; `open` lines are listed open, not missing a record. */
  readonly lines: readonly { readonly id: string; readonly text: string; readonly open?: boolean }[];
  readonly records: readonly R[];
  /** English per piece kind; `say` renders a nested piece (or an array of them) the same way. */
  readonly templates: Readonly<Record<string, (r: R, say: Say) => string>>;
  /** Default: `kind`, else `verb`. */
  readonly kindOf?: (piece: R) => string | undefined;
  /** The line id(s) a record implements. Default: `line` or `lines`. */
  readonly lineOf?: (record: R) => string | readonly string[] | undefined;
  /** Default: `id`. */
  readonly idOf?: (record: R) => string;
  /** A `note:` shown under a record (e.g. "offered while its whole effect is barred"). */
  readonly note?: (record: R) => string | undefined;
  /** Keys never listed as unread (default `id`, `kind`, `verb`, `line`, `lines`). */
  readonly skip?: readonly string[];
}
export interface Reading {
  readonly record: string;
  readonly english: string;
  readonly note?: string;
  /** Pieces with no template (`kind`) and fields no template read (`kind.key`). */
  readonly gaps: readonly string[];
}
export interface RenderedLine {
  readonly id: string;
  readonly text: string;
  readonly open: boolean;
  readonly readings: readonly Reading[];
}
export interface Render {
  readonly lines: readonly RenderedLine[];
  /** Records that name no printed line in the list. */
  readonly stray: readonly Reading[];
  readonly text: string;
}

export function renderRecords<R extends object>(input: RenderInput<R>): Render {
  const f = (r: R, k: string): unknown => (r as Record<string, unknown>)[k];
  const kindOf = input.kindOf ?? ((r: R) => (f(r, 'kind') ?? f(r, 'verb')) as string | undefined);
  const lineOf = input.lineOf ?? ((r: R) => (f(r, 'line') ?? f(r, 'lines')) as string | readonly string[] | undefined);
  const idOf = input.idOf ?? ((r: R) => String(f(r, 'id')));
  const skip = new Set(input.skip ?? ['id', 'kind', 'verb', 'line', 'lines']);
  const reading = (r: R): Reading => {
    const gaps: string[] = [];
    const say: Say = (p) => {
      if (Array.isArray(p)) return p.map(say).join('; ');
      if (p === null || typeof p !== 'object') return String(p);
      const piece = p as R;
      const kind = kindOf(piece);
      const tpl = kind === undefined ? undefined : input.templates[kind];
      if (tpl === undefined) {
        gaps.push(kind ?? '(no kind)');
        return `[render-gap ${kind ?? '(no kind)'}: ${JSON.stringify(p)}]`;
      }
      const read = new Set<string | symbol>();
      const english = tpl(new Proxy(piece, { get: (t, k, rc) => (read.add(k), Reflect.get(t, k, rc) as unknown) }), say);
      const left = Object.keys(p).filter((k) => !read.has(k) && !skip.has(k));
      gaps.push(...left.map((k) => `${kind}.${k}`));
      return left.length === 0 ? english : `${english} [also ${JSON.stringify(Object.fromEntries(left.map((k) => [k, f(piece, k)])))}]`;
    };
    const english = say(r);
    const note = input.note?.(r);
    return { record: idOf(r), english, gaps, ...(note === undefined ? {} : { note }) };
  };
  const ids = new Set(input.lines.map((l) => l.id));
  const by = new Map<string, Reading[]>();
  const stray: Reading[] = [];
  for (const r of input.records) {
    const ls = lineOf(r);
    const named = (ls === undefined ? [] : typeof ls === 'string' ? [ls] : [...ls]).filter((l) => ids.has(l));
    const rd = reading(r);
    if (named.length === 0) stray.push(rd);
    for (const l of named) by.set(l, [...(by.get(l) ?? []), rd]);
  }
  const lines = input.lines.map((l) => ({ id: l.id, text: l.text, open: l.open === true, readings: by.get(l.id) ?? [] }));
  const out: string[] = [];
  const put = (rd: Reading): void => {
    out.push(`  ${rd.record}: ${rd.english}`);
    if (rd.note !== undefined) out.push(`    note: ${rd.note}`);
  };
  for (const l of lines) {
    out.push(`${l.id} | ${l.text}`);
    if (l.readings.length === 0) out.push(l.open ? '  (open: no record yet)' : '  (no record)');
    l.readings.forEach(put);
  }
  if (stray.length > 0) {
    out.push('Records naming no printed line');
    stray.forEach(put);
  }
  return { lines, stray, text: out.join('\n') + '\n' };
}
