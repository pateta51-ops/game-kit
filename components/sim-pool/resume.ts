// Resumable runs (ebr scripts/sim/resume.ts, as JSON lines): every game is appended to the file as it ends, and a run
// started on an existing file skips the games already in it, so a run stopped by a timeout or a reboot continues where
// it stopped. Each line carries the run's settings; a file played with other settings is refused. A partial last line
// (a run stopped mid-write) is cut off and a corrupt line skipped, and that game is played again; crashed games are never written.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { canonicalJson } from '../engine-core/index.ts';
import { CRASH_HASH, hasExecutedViewValidation, type GameSpec, type SimRecord } from './play.ts';
import { runGames, type RunRequest } from './pool.ts';

/** A game's key: its seed, driver and settings (not its index, so a run may grow). */
export const specKey = (s: { seed: string; driver: string; settings?: GameSpec['settings'] }): string =>
  canonicalJson([s.seed, s.driver, s.settings ?? null]);

export interface Checkpoint {
  readonly done: Map<string, SimRecord>;
  append(r: SimRecord): void;
}

export function openCheckpoint(file: string, settings: string): Checkpoint {
  const done = new Map<string, SimRecord>();
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8');
    const text = raw.slice(0, raw.lastIndexOf('\n') + 1);
    for (const line of text.split('\n').filter((l) => l !== '')) {
      let g: { settings: string; record: SimRecord };
      try {
        g = JSON.parse(line) as typeof g;
      } catch {
        continue; // a corrupt line: that game is played again
      }
      if (g.settings !== settings)
        throw new Error(`${file}: its games were played with other settings (file: ${g.settings}; this run: ${settings})`);
      done.set(specKey(g.record), g.record);
    }
    if (text !== raw) writeFileSync(file, text);
  } else writeFileSync(file, '');
  return {
    done,
    append: (r) => {
      if (r.hash !== CRASH_HASH) appendFileSync(file, `${JSON.stringify({ settings, record: r })}\n`);
    },
  };
}

/** `runGames` over the games not yet in `file`; returns every record of the run (old and new) in index order. */
export async function runResumable(request: RunRequest, workers: number, file: string, settings: string, onRecord?: (r: SimRecord) => void): Promise<SimRecord[]> {
  if (request.until !== undefined) throw new RangeError('runResumable: a run with `until` plays cut games and is never kept');
  const cp = openCheckpoint(file, settings);
  const old: SimRecord[] = [];
  const specs = request.specs.filter((s) => {
    const r = cp.done.get(specKey(s));
    if (r === undefined) return true;
    if (request.view && r.result !== null && !hasExecutedViewValidation(r))
      throw new Error('checkpoint lacks executed view checks for the current scope; start a new checkpoint to validate its views');
    if (r.triggerCapChecked !== true) return true;
    old.push({ ...r, index: s.index });
    return false;
  });
  const preflightDriverNames = [...new Set([...request.specs.map((spec) => spec.driver), ...(request.preflightDriverNames ?? [])])];
  const fresh = await runGames({ ...request, specs, preflightDriverNames }, workers, (r) => {
    cp.append(r);
    onRecord?.(r);
  });
  return [...old, ...fresh].sort((a, b) => a.index - b.index);
}
