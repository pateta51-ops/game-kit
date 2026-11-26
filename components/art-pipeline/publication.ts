import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

interface Slot { target: string; next: string; backup: string; existed: boolean }
interface State { phase: 'preparing' | 'committing' | 'committed'; slots: Slot[] }
const slotsFor = (targets: readonly string[]): Slot[] => targets.map((target) => ({ target, next: `${target}.publish-next`, backup: `${target}.publish-backup`, existed: existsSync(target) }));

export function publicationPath(path: string): string {
  if (dirname(path) === path || lstatSync(path, { throwIfNoEntry: false })) return realpathSync(path);
  return join(publicationPath(dirname(path)), basename(path));
}

export function withinPublicationPath(parent: string, path: string): boolean {
  const rel = relative(parent, path);
  const parentSegment = '.'.repeat(2);
  return rel !== parentSegment && !rel.startsWith(parentSegment + sep) && !isAbsolute(rel);
}

function checkPaths(slots: readonly Slot[], marker: string): void {
  const paths = [...slots.flatMap((s) => [s.target, s.next, s.backup]), marker, `${marker}.tmp`];
  for (const names of [paths, paths.map(publicationPath)]) for (let i = 0; i < names.length; i += 1) if (names.some((p, j) => i !== j && withinPublicationPath(names[i]!, p))) throw new Error('publication targets, scratch and recovery paths must not overlap');
}

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
  const slots = slotsFor(targets);
  checkPaths(slots, marker);
  const bytes = readFileSync(marker), initial = Buffer.from(JSON.stringify({ phase: 'preparing', slots }));
  if (bytes.length < initial.length && bytes.equals(initial.subarray(0, bytes.length)) && lstatSync(marker).isFile()) {
    if ([`${marker}.tmp`, ...slots.flatMap((s) => [s.next, s.backup])].some((p) => lstatSync(p, { throwIfNoEntry: false }))) throw new Error('incomplete publication marker has scratch paths; preserve them and inspect recovery before retrying');
    rmSync(marker);
    return;
  }
  const state = JSON.parse(bytes.toString('utf8')) as State;
  if (!['preparing', 'committing', 'committed'].includes(state.phase) || !Array.isArray(state.slots) || state.slots.length !== slots.length || state.slots.some((s, i) => typeof s.existed !== 'boolean' || s.target !== slots[i]!.target || s.next !== slots[i]!.next || s.backup !== slots[i]!.backup))
    throw new Error('publication recovery state does not match the configured paths');
  clean(marker, state, renameSync);
}

export function beginPublication(targets: readonly string[], marker: string, rename: typeof renameSync = renameSync): { paths: string[]; commit(): void; abort(): void } {
  const state: State = { phase: 'preparing', slots: slotsFor(targets) };
  checkPaths(state.slots, marker);
  if (existsSync(marker)) throw new Error('interrupted publication: run art-publish with the same --config and --recover first');
  if (existsSync(`${marker}.tmp`)) throw new Error('publication scratch already exists beside the recovery marker; preserve it and inspect recovery before retrying');
  for (const s of state.slots) if (existsSync(s.next) || existsSync(s.backup)) throw new Error(`publication scratch already exists beside ${s.target}; preserve it and inspect recovery before retrying`);
  for (const s of state.slots) mkdirSync(dirname(s.target), { recursive: true });
  writeFileSync(marker, JSON.stringify(state), { flag: 'wx' });
  const record = (phase: State['phase']) => {
    writeFileSync(`${marker}.tmp`, JSON.stringify({ ...state, phase }));
    renameSync(`${marker}.tmp`, marker);
    state.phase = phase;
  };
  return {
    paths: state.slots.map((s) => s.next),
    commit() {
      record('committing');
      for (const s of state.slots) if (s.existed) rename(s.target, s.backup);
      for (const s of state.slots) rename(s.next, s.target);
      record('committed');
      clean(marker, state, rename);
    },
    abort() { clean(marker, state, rename); },
  };
}
