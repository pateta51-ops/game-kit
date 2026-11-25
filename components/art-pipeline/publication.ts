import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, sep } from 'node:path';

interface Slot { target: string; next: string; backup: string; existed: boolean }
interface State { phase: 'preparing' | 'committing' | 'committed'; slots: Slot[] }
const slotsFor = (targets: readonly string[]): Slot[] => targets.map((target) => ({ target, next: `${target}.publish-next`, backup: `${target}.publish-backup`, existed: existsSync(target) }));

function clean(marker: string, state: State, rename: typeof renameSync): void {
  if (state.phase === 'committing') for (const slot of [...state.slots].reverse()) {
    if (existsSync(slot.backup)) {
      rmSync(slot.target, { recursive: true, force: true });
      rename(slot.backup, slot.target);
    } else if (!slot.existed) rmSync(slot.target, { recursive: true, force: true });
  }
  for (const slot of state.slots) {
    rmSync(slot.next, { recursive: true, force: true });
    if (state.phase === 'committed') rmSync(slot.backup, { recursive: true, force: true });
  }
  rmSync(`${marker}.tmp`, { force: true });
  rmSync(marker);
}

export function recoverPublication(targets: readonly string[], marker: string): void {
  if (!existsSync(marker)) throw new Error('no interrupted publication to recover');
  const state = JSON.parse(readFileSync(marker, 'utf8')) as State;
  const slots = slotsFor(targets);
  if (!['preparing', 'committing', 'committed'].includes(state.phase) || !Array.isArray(state.slots) || state.slots.length !== slots.length || state.slots.some((s, i) => typeof s.existed !== 'boolean' || s.target !== slots[i]!.target || s.next !== slots[i]!.next || s.backup !== slots[i]!.backup))
    throw new Error('publication recovery state does not match the configured paths');
  clean(marker, state, renameSync);
}

export function beginPublication(targets: readonly string[], marker: string, rename: typeof renameSync = renameSync): { paths: string[]; commit(): void; abort(): void } {
  const state: State = { phase: 'preparing', slots: slotsFor(targets) };
  const paths = state.slots.flatMap((s) => [s.target, s.next, s.backup]);
  for (let i = 0; i < paths.length; i += 1) if (paths.some((p, j) => i !== j && (p === paths[i] || p.startsWith(`${paths[i]!}${sep}`)))) throw new Error('publication targets and scratch paths must not overlap');
  if (existsSync(marker)) throw new Error('interrupted publication: run art-publish with the same --config and --recover first');
  for (const s of state.slots) if (existsSync(s.next) || existsSync(s.backup)) throw new Error(`publication scratch already exists beside ${s.target}; preserve it and inspect recovery before retrying`);
  for (const s of state.slots) mkdirSync(dirname(s.target), { recursive: true });
  writeFileSync(marker, JSON.stringify(state), { flag: 'wx' });
  const record = () => {
    writeFileSync(`${marker}.tmp`, JSON.stringify(state));
    renameSync(`${marker}.tmp`, marker);
  };
  return {
    paths: state.slots.map((s) => s.next),
    commit() {
      state.phase = 'committing';
      record();
      for (const s of state.slots) if (s.existed) rename(s.target, s.backup);
      for (const s of state.slots) rename(s.next, s.target);
      state.phase = 'committed';
      record();
      clean(marker, state, rename);
    },
    abort() { clean(marker, state, rename); },
  };
}
