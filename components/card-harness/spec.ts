// K77: card spec rows. A row names a printed line, the table it needs by zone, one act and what must hold after. Each
// row runs on the records, and again with the records of its line removed: a row that still passes then tests
// nothing and fails. Lifted from middle-earth-player (MIT), test/harness/card-spec.ts and
// scripts/checks/spec-coverage.test.ts, made generic: the game plays the row and checks each expectation.

export interface SpecRow<L, A, E> {
  readonly line: string;
  readonly name?: string;
  /** The table by zone, as the game builds it. */
  readonly layout: L;
  readonly act: A;
  readonly expect: E | readonly E[];
}
export interface SpecGame<R, L, A, E, S> {
  readonly records: readonly R[];
  /** Build `layout` with `records` live, run `act`. `lenient`: the line's records are gone, so skip an answer nobody asks for. */
  play(layout: L, act: A, records: readonly R[], lenient: boolean): S;
  /** What is wrong with `e` after the play; undefined when it holds. */
  check(result: S, e: E): string | undefined;
  /** The line id(s) a record implements. Default: `line` or `lines`. */
  lineOf?(record: R): string | readonly string[] | undefined;
}
type Reg = (name: string, fn: () => void) => unknown;

const linesOf = <R>(r: R, lineOf?: (r: R) => string | readonly string[] | undefined): readonly string[] => {
  const o = r as Record<string, unknown>;
  const l = lineOf ? lineOf(r) : ((o.line ?? o.lines) as string | readonly string[] | undefined);
  return l === undefined ? [] : typeof l === 'string' ? [l] : l;
};

/** The records without those that implement `line` (a new list). */
export function withoutLine<R>(records: readonly R[], line: string, lineOf?: (r: R) => string | readonly string[] | undefined): R[] {
  return records.filter((r) => !linesOf(r, lineOf).includes(line));
}

/** The failed expectations of `row` on `records`, or the error the play threw; empty when it holds. */
export function specProblems<R, L, A, E, S>(game: SpecGame<R, L, A, E, S>, row: SpecRow<L, A, E>, records = game.records, lenient = false): string[] {
  const wanted = (Array.isArray(row.expect) ? row.expect : [row.expect]) as readonly E[];
  try {
    const s = game.play(row.layout, row.act, records, lenient);
    return wanted.flatMap((e) => game.check(s, e) ?? []);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
}

/** Two tests per row: it holds, and it fails with its line's records removed. A line no record names fails. */
export function cardSpecs<R, L, A, E, S>(name: string, game: SpecGame<R, L, A, E, S>, rows: readonly SpecRow<L, A, E>[], { describe, it }: { describe: Reg; it: Reg }): void {
  const lineOf = game.lineOf?.bind(game);
  describe(`${name} card specs`, () => {
    rows.forEach((row, i) => {
      const title = `${row.line} ${row.name ?? `row ${String(i + 1)}`}`;
      it(title, () => {
        if (!game.records.some((r) => linesOf(r, lineOf).includes(row.line))) throw new Error(`no record names line ${row.line}`);
        const p = specProblems(game, row);
        if (p.length > 0) throw new Error(`${title}:\n${p.join('\n')}`);
      });
      it(`${title}: fails without its records`, () => {
        if (specProblems(game, row, withoutLine(game.records, row.line, lineOf), true).length === 0) throw new Error(`row ${row.line} passes without its records`);
      });
    });
  });
}

/** Lines the records name with no row and no test title starting with the id (`missing`), and `exempt` lines covered or named by no record (`stale`). */
export function specCoverage<R>(input: {
  records: readonly R[];
  rows: readonly { readonly line: string }[];
  titles?: readonly string[];
  exempt?: Readonly<Record<string, string>>;
  lineOf?: (r: R) => string | readonly string[] | undefined;
}): { missing: string[]; stale: string[] } {
  const named = new Set(input.records.flatMap((r) => linesOf(r, input.lineOf)));
  const covered = new Set(input.rows.map((r) => r.line));
  const titled = (l: string): boolean => (input.titles ?? []).some((t) => t === l || t.startsWith(`${l} `) || t.startsWith(`${l}:`));
  const has = (l: string): boolean => covered.has(l) || titled(l);
  const exempt = input.exempt ?? {};
  return {
    missing: [...named].filter((l) => !has(l) && !(l in exempt)).sort(),
    stale: Object.keys(exempt).filter((l) => has(l) || !named.has(l)).sort(),
  };
}
