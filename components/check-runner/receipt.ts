import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { matchesTrackedTree, workingTreeSha256 } from './tracked-source.ts';

export interface ReceiptConfig {
  readonly output: string;
  readonly spec: string;
  readonly acceptance: string;
  readonly kitLock?: string;
}
interface FileIdentity { readonly path: string; readonly sha256: string }
interface Binding {
  readonly source: { readonly commit: string; readonly tree: string; readonly workingSha256: string };
  readonly kit: FileIdentity & { readonly commit: string };
  readonly spec: FileIdentity;
  readonly acceptance: FileIdentity;
  readonly config: FileIdentity;
  readonly package: FileIdentity;
  readonly producer: readonly string[];
}
type Status = 'not-run' | 'passed' | 'failed' | 'stopped' | 'truncated';
interface Command {
  readonly script: string;
  readonly command: string;
  status: Status;
  code: number | null;
  ms: number | null;
  output: { readonly sha256: string; readonly bytes: number } | null;
}
export interface ReceiptResult {
  readonly script: string;
  readonly code: number;
  readonly ms: number;
  readonly stopped: boolean;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
}
interface Receipt {
  readonly schemaVersion: 1;
  readonly definition: ReceiptConfig & { readonly config: string };
  readonly binding: Binding;
  readonly startedAt: string;
  completedAt: string | null;
  cancelled: boolean;
  status: Status | 'stale' | 'invalid';
  readonly commands: Command[];
  problems: string[];
}
class StaleBindingError extends Error {}
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const git = (root: string, ...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();
const parentPart = /^\.\.$/;
const outside = (file: string): boolean => path.isAbsolute(file) || parentPart.test(file.split(path.sep, 1)[0] ?? '');
const invalidCompletionTime = 'receipt completion time is invalid';
function relative(file: string): string {
  if (typeof file !== 'string' || !file || /[:\0]/.test(file) || path.isAbsolute(file) || file.split(/[\\/]/).some(p => parentPart.test(p) || p === ''))
    throw new Error('receipt paths must be relative files inside the consumer');
  const normalized = path.posix.normalize(file.replace(/\\/g, '/'));
  if (normalized === '.') throw new Error('receipt paths must name files');
  return normalized;
}
function target(root: string, file: string): string {
  const output = path.join(root, relative(file));
  let parent = output;
  while (!lstatSync(parent, { throwIfNoEntry: false })) parent = path.dirname(parent);
  return path.resolve(realpathSync(parent), path.relative(parent, output));
}
function identity(root: string, file: string): FileIdentity {
  const name = relative(file), resolved = realpathSync(path.join(root, name));
  const from = path.relative(root, resolved);
  if (outside(from)) throw new Error('receipt input escapes the consumer');
  return { path: name, sha256: sha(readFileSync(resolved)) };
}
function binding(root: string, definition: Receipt['definition']): Binding {
  if (realpathSync(git(root, 'rev-parse', '--show-toplevel')) !== root) throw new Error('receipt needs the consumer repository root');
  if (git(root, 'ls-files', '-v', '-z').split('\0').some(record => /^[a-zS] /.test(record)))
    throw new StaleBindingError('receipt cannot verify source with assume-unchanged or skip-worktree entries');
  const commit = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', commit + '^{tree}');
  if (git(root, '--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none') || !matchesTrackedTree(root, tree))
    throw new StaleBindingError('receipt needs a clean consumer source tree');
  const kit = identity(root, definition.kitLock ?? 'kit/kit.lock.json');
  const lock = JSON.parse(readFileSync(path.join(root, kit.path), 'utf8')) as { commit?: unknown };
  if (typeof lock.commit !== 'string' || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/.test(lock.commit)) throw new Error('receipt needs a full locked kit commit');
  return {
    source: { commit, tree, workingSha256: workingTreeSha256(root, tree) },
    kit: { ...kit, commit: lock.commit },
    spec: identity(root, definition.spec), acceptance: identity(root, definition.acceptance),
    config: identity(root, definition.config), package: identity(root, 'package.json'),
    producer: ['check-runner.ts', 'receipt.ts', 'tracked-source.ts'].map(file => sha(readFileSync(path.join(import.meta.dirname, file)))),
  };
}
function status(commands: readonly Command[]): Status {
  if (commands.some(c => c.status === 'failed')) return 'failed';
  if (commands.some(c => c.status === 'truncated')) return 'truncated';
  if (commands.some(c => c.status === 'stopped')) return 'stopped';
  return commands.length > 0 && commands.every(c => c.status === 'passed') ? 'passed' : 'not-run';
}

/** Record the existing runner's results. This does not launch checks or attest to their semantic quality. */
export function acceptanceReceipt(config: ReceiptConfig, configFile: string, scripts: Record<string, string>, order: readonly string[]) {
  const root = realpathSync(process.cwd());
  const definition = { ...config, output: relative(config.output), spec: relative(config.spec), acceptance: relative(config.acceptance), config: relative(configFile) };
  const output = path.join(root, definition.output);
  const files = [definition.output, definition.spec, definition.acceptance, definition.kitLock ?? 'kit/kit.lock.json', definition.config, 'package.json'];
  if (new Set(files.map(file => target(root, file))).size !== files.length)
    throw new Error('receipt output and bound inputs must be distinct files');
  const destination = path.relative(root, target(root, definition.output));
  const segments = destination.toLowerCase().split(path.sep);
  if (outside(destination) || segments.some(part => ['.git', 'node_modules'].includes(part)) || segments[0] === 'kit')
    throw new Error('receipt output must stay outside kit and repository internals');
  git(root, 'check-ignore', '--quiet', '--', definition.output);
  const initial = binding(root, definition);
  const outputParent = path.dirname(output), expected = path.resolve(root, destination);
  const unsafeOutput = (): Error => new Error('receipt output destination changed or is unsafe');
  if (path.relative(expected, target(root, definition.output)) !== '') throw unsafeOutput();
  mkdirSync(outputParent, { recursive: true });
  const parent = realpathSync(outputParent), pinnedOutput = path.join(parent, path.basename(output));
  const parentIdentity = lstatSync(parent, { bigint: true });
  if (path.relative(expected, pinnedOutput) !== '') throw unsafeOutput();
  const sameParent = (): boolean => {
    try {
      const current = lstatSync(parent, { bigint: true });
      return current.isDirectory() && current.dev === parentIdentity.dev && current.ino === parentIdentity.ino && realpathSync(outputParent) === parent;
    } catch { return false; }
  };
  const checkDestination = (): void => {
    if (!sameParent()) throw unsafeOutput();
    const entry = lstatSync(pinnedOutput, { throwIfNoEntry: false });
    if (entry && (!entry.isFile() || entry.nlink !== 1)) throw unsafeOutput();
  };
  const receipt: Receipt = { schemaVersion: 1, definition, binding: initial, startedAt: new Date().toISOString(), completedAt: null, cancelled: false,
    status: 'not-run', commands: order.map(script => ({ script, command: scripts[script] ?? '', status: 'not-run', code: null, ms: null, output: null })), problems: [] };
  const write = (): void => {
    checkDestination();
    git(root, 'check-ignore', '--quiet', '--', destination);
    const temporary = mkdtempSync(path.join(parent, '.acceptance-'));
    try {
      const file = path.join(temporary, 'receipt.json');
      writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
      checkDestination();
      renameSync(file, pinnedOutput);
    } finally { if (sameParent()) rmSync(temporary, { recursive: true, force: true }); }
  };
  write();
  return {
    record(result: ReceiptResult, log: string): void {
      const row = receipt.commands.find(c => c.script === result.script);
      if (row === undefined || row.status !== 'not-run') throw new Error('receipt has an unknown or repeated check');
      const bytes = readFileSync(log);
      row.status = result.stopped ? 'stopped' : result.timedOut || result.code !== 0 ? 'failed' : result.truncated ? 'truncated' : 'passed';
      row.code = result.code; row.ms = result.ms; row.output = { sha256: sha(bytes), bytes: bytes.length };
      write(); // Overall evidence stays not-run until the runner completes and rechecks the binding.
    },
    finish(cancelled = false): Receipt['status'] {
      receipt.completedAt = new Date().toISOString();
      receipt.cancelled = cancelled;
      receipt.status = cancelled ? 'stopped' : status(receipt.commands);
      try {
        if (!isDeepStrictEqual(initial, binding(root, definition))) throw new Error('bound inputs changed while checks ran');
        if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) {
          receipt.status = 'invalid';
          receipt.problems.push(invalidCompletionTime);
        }
      } catch (error) {
        receipt.status = 'stale';
        receipt.problems.push(error instanceof Error ? error.message : String(error));
      }
      write();
      return receipt.status;
    },
  };
}

/** Verify local bindings and recorded completeness; the receipt is not a signed execution attestation. */
export function verifyReceipt(file: string): { status: string; problems: readonly string[] } {
  if (!existsSync(file)) return { status: 'missing', problems: ['acceptance receipt is missing'] };
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Receipt;
    if (value.schemaVersion !== 1 || !Array.isArray(value.commands) || !value.definition || !value.binding || !Array.isArray(value.problems))
      throw new Error('invalid acceptance receipt');
    const root = realpathSync(process.cwd());
    if (!isDeepStrictEqual(value.binding, binding(root, value.definition))) return { status: 'stale', problems: ['bound inputs differ from the receipt'] };
    const config = JSON.parse(readFileSync(path.join(root, value.definition.config), 'utf8')) as { first?: string[]; lanes?: string[][]; last?: string[] };
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    const expected = [...(config.first ?? []), ...(config.lanes ?? []).flat(), ...(config.last ?? [])];
    if (!isDeepStrictEqual(value.commands.map(c => c.script), expected)) throw new Error('receipt command inventory differs from the check plan');
    for (const command of value.commands) {
      if (command.command !== pkg.scripts[command.script]) throw new Error('receipt command differs from package script');
      if (!['not-run', 'passed', 'failed', 'stopped', 'truncated'].includes(command.status)) throw new Error('invalid receipt command status');
      if (command.status === 'not-run') {
        if (command.code !== null || command.ms !== null || command.output !== null) throw new Error('unrun check has execution evidence');
      } else if (!Number.isSafeInteger(command.code) || !Number.isFinite(command.ms) || (command.ms ?? -1) < 0
        || !command.output || !/^[a-f\d]{64}$/.test(command.output.sha256) || !Number.isSafeInteger(command.output.bytes) || command.output.bytes < 0
        || command.status === 'passed' && command.code !== 0) throw new Error('invalid check execution evidence');
    }
    if (typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) throw new Error('receipt start time is invalid');
    if (value.completedAt === null) return { status: 'not-run', problems: ['runner has not completed'] };
    if (typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt)) || Date.parse(value.completedAt) < Date.parse(value.startedAt))
      throw new Error(invalidCompletionTime);
    if (value.status === 'stale') return { status: 'stale', problems: value.problems };
    if (typeof value.cancelled !== 'boolean' || value.status !== (value.cancelled ? 'stopped' : status(value.commands)) || value.status === 'passed' && value.problems.length)
      throw new Error('receipt outcome differs from its commands');
    return { status: value.status, problems: value.problems };
  } catch (error) {
    return { status: error instanceof StaleBindingError ? 'stale' : error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'invalid',
      problems: [error instanceof Error ? error.message : String(error)] };
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const result = process.argv.length === 4 && process.argv[2] === '--verify'
    ? verifyReceipt(process.argv[3] ?? '') : { status: 'invalid', problems: ['usage: node receipt.ts --verify <receipt.json>'] };
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
