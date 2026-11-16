// The sanity-band shape (warps scripts/sim/core.ts BandResult; imperium scripts/sim/core.ts Band, formatBands and
// `--skip-band`): a game writes its own bands over its simulation records; only the shape and the report are here.
import type { SimRecord } from './play';

export interface Band {
  readonly id: string;
  readonly text: string;
  readonly target: string;
  readonly actual: string;
  readonly pass: boolean;
}

/** What a game writes: its bands over the records of a run. */
export type SanityBands<S = unknown> = (records: readonly SimRecord<S>[]) => Band[];

/** One line per band. A failing band is an error, unless its id is in `skip`: then it is printed as INFO and not counted. */
export function formatBands(bands: readonly Band[], skip: readonly string[] = []): { lines: string[]; failed: number } {
  const unknown = skip.filter((id) => !bands.some((b) => b.id === id));
  if (unknown.length) throw new RangeError(`--skip-band ${unknown.join(', ')}: no such band (${bands.map((b) => b.id).join(', ')})`);
  const word = (b: Band): string => (skip.includes(b.id) ? 'INFO' : b.pass ? 'PASS' : 'FAIL');
  return {
    lines: bands.map((b) => `${b.id} ${word(b)}  ${b.text}: target ${b.target}; actual ${b.actual}`),
    failed: bands.filter((b) => !b.pass && !skip.includes(b.id)).length,
  };
}
