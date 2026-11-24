// The repository gate (from Jarl, runner names as data from STCC). It reads the tracked files (git ls-files; a file that
// is not checked out is sized from git's index) and fails when:
//   SIZE          a tracked file is over 50 MB (no Git LFS), or its size cannot be read (not checked out, blob not in this clone);
//   RAW_SCAN      a tracked file is a raw scan or camera format (TIFF, BMP, PSD, RAW, DNG, HEIC...);
//   DEPENDENCY_LINK a node_modules link is in the Git index;
//   SECRET        a tracked text file holds something shaped like a GitHub token or a private key block (also in skipText folders);
//   SESSION_URL   a tracked text file holds a Claude session URL;
//   TAILNET_HOST  a tracked text file holds a tailnet host name, `<machine>.<tailnet>.ts.net`;
//   RUNNER_NAME   a tracked text file names a registered runner machine (cfg.runnerNames and the runnersFile list; whole
//                 words, any case; a space matches any run of white space; the runnersFile itself is exempt);
//                 (RUNNER_NAME, SESSION_URL and TAILNET_HOST skip the cfg.skipText folders);
//   CONTENT_ID    a cfg.engineFolders file (outside cfg.engineAllowed and the test files) holds a card-id literal
//                 (cfg.cardIdLiteral) or a component id of the content folder's json files with a dash;
//   CONTENT_NAME  the same files hold a card name of those json files as a quoted string;
//   ART_BUDGET    the committed WebP art under cfg.artFolder is over cfg.maxArtMB;
//   REPO_BUDGET   the tracked files add up to over cfg.maxRepoMB (0: no limit; over cfg.warnRepoMB it only prints a warning);
//   PORT          a pull request changes cfg.portFrom and not cfg.portTo, and its body has no `port: n/a (<reason>)`
//                 (checked on a pull_request event, or with PORT_RULE_BASE and PORT_RULE_BODY_FILE; '' turns it off).
// Switches: cfg.sessionUrl, cfg.tailnetHost, cfg.runnerName (false off), cfg.rawScan ('' off), cfg.contentName, cfg.engineTests (CONTENT_ID and CONTENT_NAME also in engine test
// files), cfg.skipMissingBlobs (a blob a partial clone lacks is counted in a notice, not a SIZE finding).
// It prints each finding as `path:line: CHECK what`, then the sizes. Exit codes: 0 clean, 1 findings, 2 no git.
// Config: repo-gate.config.json in the repository root (or --config path); see Config below.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Config {
  maxArtMB: number;
  maxRepoMB: number;
  artFolder: string;
  engineFolders: string[];
  engineAllowed: string[];
  /** Source of a regexp matching a card-id string literal; '' for none. */
  cardIdLiteral: string;
  contentDir: string;
  /** Files of the content folder that are not component data (glossary, rule texts). */
  contentSkip: string[];
  skipText: string[];
  runnerNames: string[];
  /** A json file `{ "runnerNames": [...] }` kept apart from the code; read when present. */
  runnersFile: string;
  /** Source of the regexp (any case) of raw scan paths; '' turns RAW_SCAN off. */
  rawScan: string;
  /** false turns CONTENT_NAME off. */
  contentName: boolean;
  /** true: the engine's test files are checked for CONTENT_ID and CONTENT_NAME too. */
  engineTests: boolean;
  /** true: a blob that is not in this partial clone is skipped with a notice instead of a SIZE finding. */
  skipMissingBlobs: boolean;
  /** Above this the gate prints a warning and still passes; 0 for none. */
  warnRepoMB: number;
  /** PORT: a pull request that changes portFrom changes portTo too; '' turns it off. */
  portFrom: string;
  portTo: string;
  /** false turns SESSION_URL, TAILNET_HOST or RUNNER_NAME off. */
  sessionUrl: boolean;
  tailnetHost: boolean;
  runnerName: boolean;
}
/** Raw scan and camera formats. */
export const RAW_SCAN = /\.(tiff?|bmp|psd|raw|cr2|nef|arw|dng|heic|heif)$/i;
export const DEFAULT_CONFIG: Config = {
  maxArtMB: 120,
  maxRepoMB: 1536,
  artFolder: '',
  engineFolders: [],
  engineAllowed: [],
  cardIdLiteral: '',
  contentDir: 'content',
  contentSkip: [],
  skipText: ['dossier/', 'docs/'],
  runnerNames: [],
  runnersFile: 'tools/repogate/runners.json',
  rawScan: RAW_SCAN.source,
  contentName: true,
  engineTests: false,
  skipMissingBlobs: false,
  warnRepoMB: 0,
  portFrom: '',
  portTo: '',
  sessionUrl: true,
  tailnetHost: true,
  runnerName: true,
};
const MB = 1024 * 1024;
export const MAX_FILE_BYTES = 50 * MB;
/** A Claude session or chat URL, or a session id. */
export const SESSION_URL =
  /claude\.ai\/code\/(?:session_|[0-9a-f]{8}-)|claude\.ai\/session_[A-Za-z0-9]{6,}|claude\.ai\/chat\/[0-9a-f]{8}-[0-9a-f]{4}|(?<![A-Za-z0-9_])session_[0-9A-Za-z]{20,}/;
/** A tailnet host name: a machine and a tailnet before `.ts.net` (the bare `.ts.net` suffix is allowed). */
export const TAILNET_HOST = /[A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z0-9][A-Za-z0-9-]*\.ts\.net/;

/** Files never read as text (pictures, PDFs, fonts, archives, media). */
const BINARY =
  /\.(png|jpe?g|gif|webp|avif|bmp|ico|heic|tiff?|psd|raw|pdf|woff2?|ttf|otf|eot|zip|gz|7z|mp4|webm|mp3|wav|ogg)$/i;
/** A GitHub token, fine-grained (`github_pat_` + 22 or more characters) or classic (`gh?_` + 36 or more). */
export const GITHUB_TOKEN =
  /(?<![A-Za-z0-9_])(?:github_pat_[A-Za-z0-9_]{22,}|gh[pousr]_[A-Za-z0-9]{36,})(?![A-Za-z0-9_])/;
export const PRIVATE_KEY = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/;

export interface TrackedFile {
  path: string;
  bytes: number;
  /** The text of the file, or null for a binary file or one that is not checked out. */
  text: string | null;
  /** Not checked out and its blob is not in this clone: the size could not be read. */
  unsized?: boolean;
  /** The index contains a node_modules symlink, which must stay local. */
  dependencyLink?: boolean;
}

export interface Finding {
  path: string;
  line: number;
  check: string;
  message: string;
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '');
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One regular expression per runner name (whole words, any case; a space matches any run of white space). */
export const namePattern = (name: string): RegExp =>
  new RegExp(`(?<![A-Za-z0-9])${name.split(/\s+/).map(escape).join('\\s+')}(?![A-Za-z0-9])`, 'i');

/** Every string held under an `id` key anywhere in a parsed content file. */
export function collectIds(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' && typeof child === 'string' && child !== '') out.add(child);
      else collectIds(child, out);
    }
  }
  return out;
}

/** Every string held under a `name` key anywhere in a parsed content file. */
export function collectNames(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectNames(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'name' && typeof child === 'string' && child !== '') out.add(child);
      else collectNames(child, out);
    }
  }
  return out;
}

/** One expression matching any of the names as a quoted string literal ('Name', "Name", `Name`). */
export function namesPattern(names: Iterable<string>): RegExp | null {
  const list = [...names].sort((a, b) => b.length - a.length).map(escape);
  return list.length === 0 ? null : new RegExp(`(['"\`])(?:${list.join('|')})\\1`);
}

/** One expression matching any of the ids as a whole word (ids hold letters, digits and dashes). */
export function idsPattern(ids: Iterable<string>): RegExp | null {
  const list = [...ids].sort((a, b) => b.length - a.length).map(escape);
  return list.length === 0 ? null : new RegExp(`(?<![A-Za-z0-9_-])(?:${list.join('|')})(?![A-Za-z0-9_-])`);
}

export function checkFiles(
  files: readonly TrackedFile[],
  contentIds: ReadonlySet<string>,
  cardNames: ReadonlySet<string> = new Set(),
  cfg: Config = DEFAULT_CONFIG,
): Finding[] {
  const findings: Finding[] = [];
  const idRe = idsPattern(contentIds);
  const nameRe = cfg.contentName ? namesPattern(cardNames) : null;
  const rawScan = cfg.rawScan === '' ? null : new RegExp(cfg.rawScan, 'i');
  const idLiteral = cfg.cardIdLiteral === '' ? null : new RegExp(cfg.cardIdLiteral);
  const runners = cfg.runnerNames.map(namePattern);
  for (const file of files) {
    if (file.dependencyLink) {
      findings.push({ path: file.path, line: 0, check: 'DEPENDENCY_LINK', message: 'ignore node_modules and use git rm --cached on this path to remove the link from the index' });
      continue;
    }
    if (file.bytes > MAX_FILE_BYTES) {
      findings.push({
        path: file.path,
        line: 0,
        check: 'SIZE',
        message: `${(file.bytes / MB).toFixed(1)} MB is over the 50 MB limit`,
      });
    }
    if (file.unsized && !cfg.skipMissingBlobs)
      findings.push({ path: file.path, line: 0, check: 'SIZE', message: 'size not read: not checked out and its blob is not in this clone (fetch it or check it out)' });
    if (rawScan !== null && rawScan.test(file.path)) {
      findings.push({
        path: file.path,
        line: 0,
        check: 'RAW_SCAN',
        message: 'a raw scan format (convert it to PNG, JPEG or WebP)',
      });
    }
    if (file.text === null) continue;
    const engineRules =
      cfg.engineFolders.some((dir) => file.path.startsWith(dir)) &&
      !cfg.engineAllowed.some((dir) => file.path.startsWith(dir)) &&
      (cfg.engineTests || !/\.test\.tsx?$/.test(file.path));
    // kept-as-written folders: only secrets are looked for there
    const textRules = !cfg.skipText.some((dir) => file.path.startsWith(dir));
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (GITHUB_TOKEN.test(line))
        findings.push({ path: file.path, line: i + 1, check: 'SECRET', message: 'a GitHub token' });
      if (PRIVATE_KEY.test(line))
        findings.push({ path: file.path, line: i + 1, check: 'SECRET', message: 'a private key' });
      if (textRules) {
        if (cfg.sessionUrl && SESSION_URL.test(line))
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'SESSION_URL',
            message: 'a session URL',
          });
        if (cfg.tailnetHost && TAILNET_HOST.test(line))
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'TAILNET_HOST',
            message: 'a tailnet host',
          });
        if (cfg.runnerName && norm(file.path) !== norm(cfg.runnersFile) && runners.some((re) => re.test(line)))
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'RUNNER_NAME',
            message: 'a runner name',
          });
      }
      if (engineRules) {
        const literal = idLiteral === null ? null : idLiteral.exec(line);
        if (literal !== null)
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'CONTENT_ID',
            message: `names the card ${literal[0]} in rules code`,
          });
        const hit = idRe === null ? null : idRe.exec(line);
        if (hit !== null)
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'CONTENT_ID',
            message: `names the component "${hit[0]}" in rules code`,
          });
        const named = nameRe === null ? null : nameRe.exec(line);
        if (named !== null)
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'CONTENT_NAME',
            message: `names the card ${named[0]} in rules code`,
          });
      }
    });
  }
  const art = files
    .filter((f) => cfg.artFolder !== '' && f.path.startsWith(cfg.artFolder) && /\.webp$/i.test(f.path))
    .reduce((sum, f) => sum + f.bytes, 0);
  if (art > cfg.maxArtMB * MB)
    findings.push({
      path: cfg.artFolder,
      line: 0,
      check: 'ART_BUDGET',
      message: `${(art / MB).toFixed(1)} MB of WebP art is over ${String(cfg.maxArtMB)} MB`,
    });
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  if (cfg.maxRepoMB > 0 && total > cfg.maxRepoMB * MB)
    findings.push({
      path: '.',
      line: 0,
      check: 'REPO_BUDGET',
      message: `${(total / MB).toFixed(0)} MB of tracked files is over ${String(cfg.maxRepoMB)} MB`,
    });
  return findings;
}

function git(root: string, args: string[], input?: string): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf-8',
    maxBuffer: 256 * MB,
    ...(input === undefined ? {} : { input }),
  });
}

/** The text of a file; one that starts with a UTF-16 byte-order mark (PowerShell 5.1's `>`) is decoded as UTF-16. */
export function decodeText(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2, b.length - (b.length % 2))).swap16().toString('utf16le');
  return b.toString('utf8');
}

const PORT_WAIVER = /^[ \t]*(?:[-*][ \t]+)?port:[ \t]*n\/a[ \t]*\([ \t]*[^)\s][^)\n]*\)/im;

/** PORT: `changed` (the pull request's paths) holds a cfg.portFrom file and no cfg.portTo file, and `body` has no `port: n/a (<reason>)` line. */
export function checkPortRule(changed: readonly string[], body: string, cfg: Config): Finding | null {
  const from = changed.filter((p) => p.startsWith(cfg.portFrom));
  if (cfg.portFrom === '' || from.length === 0 || changed.some((p) => p.startsWith(cfg.portTo)) || PORT_WAIVER.test(body)) return null;
  return {
    path: from[0] ?? cfg.portFrom,
    line: 0,
    check: 'PORT',
    message: `${String(from.length)} file(s) under ${cfg.portFrom} changed and none under ${cfg.portTo}: port the change, or write "port: n/a (<reason>)" in the pull request's body`,
  };
}

export type PortContext =
  | { kind: 'pr'; base: string; body: string; where: string }
  | { kind: 'skip'; why: string }
  | { kind: 'error'; why: string };

/**
 * The pull request this run checks: PORT_RULE_BASE (a revision HEAD is diffed against) with PORT_RULE_BODY_FILE; or a
 * pull_request event (HEAD is the merge commit, diffed against HEAD^1: check out 2 commits deep; the body is the
 * payload's). A workflow_dispatch run without the variables is an error; anything else is skipped.
 */
export function portContext(env: NodeJS.ProcessEnv, readFile: (path: string) => string): PortContext {
  if (env.PORT_RULE_BASE !== undefined && env.PORT_RULE_BASE !== '') {
    const file = env.PORT_RULE_BODY_FILE;
    if (file === undefined || file === '') return { kind: 'error', why: 'PORT_RULE_BASE is set but PORT_RULE_BODY_FILE is not' };
    return { kind: 'pr', base: env.PORT_RULE_BASE, body: readFile(file), where: `HEAD against ${env.PORT_RULE_BASE}` };
  }
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    if (env.GITHUB_EVENT_PATH === undefined) return { kind: 'error', why: 'a pull_request event without GITHUB_EVENT_PATH' };
    const pr = (JSON.parse(readFile(env.GITHUB_EVENT_PATH)) as { pull_request?: { number?: number; body?: string | null } }).pull_request;
    if (pr === undefined) return { kind: 'error', why: 'the pull_request event has no pull request' };
    return { kind: 'pr', base: 'HEAD^1', body: pr.body ?? '', where: `pull request #${String(pr.number ?? '?')}` };
  }
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') return { kind: 'error', why: 'a workflow_dispatch run without PORT_RULE_BASE' };
  return { kind: 'skip', why: env.GITHUB_ACTIONS === 'true' ? `event ${env.GITHUB_EVENT_NAME ?? '?'}` : 'no pull request (a local run)' };
}

/** The paths that differ between `base` and HEAD, both sides of a rename; the base is fetched alone when a shallow checkout lacks it. */
function changedSince(root: string, base: string): string[] {
  try {
    git(root, ['cat-file', '-e', `${base}^{commit}`]);
  } catch {
    git(root, ['fetch', '-q', '--depth=1', 'origin', base]);
  }
  return git(root, ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD']).split('\0').filter((p) => p !== '');
}

/** The tracked files with their sizes and their text (the working copy, else the blob when this clone holds it). */
export function readTracked(ROOT: string): TrackedFile[] {
  const entries = git(ROOT, ['ls-files', '-s', '-z'])
    .split('\0')
    .filter((e) => e !== '')
    .map((e) => {
      const tab = e.indexOf('\t');
      const [mode, sha] = e.slice(0, tab).split(' ');
      const path = e.slice(tab + 1);
      return { path, sha: sha ?? '', dependencyLink: mode === '120000' && /(^|\/)node_modules$/.test(path) };
    });
  const missing = entries.filter((e) => !e.dependencyLink && !existsSync(join(ROOT, e.path)));
  const indexSizes = new Map<string, number>();
  if (missing.length > 0) {
    // no fetch of a blob a partial clone does not hold (GIT_NO_LAZY_FETCH; an older git is refused every transport): it
    // answers `missing`, and the file is flagged, never counted as 0
    const ask = (args: string[], input?: string): string =>
      execFileSync('git', ['cat-file', ...args], {
        cwd: ROOT,
        encoding: 'utf-8',
        maxBuffer: 256 * MB,
        ...(input === undefined ? {} : { input }),
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: 'none' },
      });
    // one pass: the blobs this clone lacks come from one `rev-list --missing=print`; the rest are sized by one batch-check
    // (a per-blob call timed out in a partial sparse clone)
    let lacking = new Set<string>();
    try {
      lacking = new Set(
        git(ROOT, ['rev-list', '--objects', '--missing=print', '--no-object-names', '--no-walk', 'HEAD'])
          .split('\n')
          .filter((l) => l.startsWith('?'))
          .map((l) => l.slice(1)),
      );
    } catch {
      // no HEAD: nothing is known to be lacking
    }
    const here = [...new Set(missing.map((m) => m.sha).filter((sha) => !lacking.has(sha)))];
    let out = '';
    if (here.length > 0) {
      try {
        out = ask(['--batch-check=%(objectname) %(objectsize)'], here.join('\n') + '\n');
      } catch {
        // a blob that is neither held nor listed: stays unsized
      }
    }
    for (const line of out.split('\n')) {
      const [sha, size] = line.split(' ');
      if (sha !== undefined && size !== undefined && /^\d+$/.test(size)) indexSizes.set(sha, Number(size));
    }
  }
  const blobText = new Map<string, string>();
  const held = missing.filter((m) => !BINARY.test(m.path) && (indexSizes.get(m.sha) ?? MAX_FILE_BYTES + 1) <= MAX_FILE_BYTES);
  if (held.length > 0) {
    const out = execFileSync('git', ['cat-file', '--batch'], {
      cwd: ROOT,
      maxBuffer: 2 ** 31 - 1,
      input: held.map((m) => m.sha).join('\n') + '\n',
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: 'none' },
    });
    let at = 0;
    for (const m of held) {
      const end = out.indexOf(0x0a, at);
      if (end < 0) break;
      const size = Number(out.subarray(at, end).toString('utf8').split(' ')[2]);
      if (Number.isNaN(size)) {
        at = end + 1;
        continue;
      }
      blobText.set(m.sha, decodeText(out.subarray(end + 1, end + 1 + size)));
      at = end + 2 + size;
    }
  }
  return entries.map(({ path, sha, dependencyLink }) => {
    if (dependencyLink) return { path, bytes: 0, text: null, dependencyLink };
    const full = join(ROOT, path);
    if (!existsSync(full)) {
      const size = indexSizes.get(sha);
      return size === undefined ? { path, bytes: 0, text: null, unsized: true } : { path, bytes: size, text: blobText.get(sha) ?? null };
    }
    const bytes = statSync(full).size;
    return { path, bytes, text: BINARY.test(path) ? null : decodeText(readFileSync(full)) };
  });
}

/** The parsed json files of the content folder, without the cfg.contentSkip files. */
function readContent(root: string, cfg: Config): unknown[] {
  const dir = join(root, cfg.contentDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !cfg.contentSkip.includes(name))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown);
}

/**
 * The component ids of every content json. Ids without a dash are left out: they are words of the vocabulary too, so
 * matching them would flag every rule that uses the word; card ids are caught as string literals instead.
 */
export function readContentIds(root: string, cfg: Config): Set<string> {
  const ids = new Set<string>();
  for (const file of readContent(root, cfg)) collectIds(file, ids);
  return new Set([...ids].filter((id) => id.includes('-')));
}

/** The card and component names of every content json, two characters or longer. */
export function readCardNames(root: string, cfg: Config): Set<string> {
  const names = new Set<string>();
  for (const file of readContent(root, cfg)) collectNames(file, names);
  return new Set([...names].filter((name) => name.length >= 2));
}

export function loadConfig(root: string, file: string): Config {
  if (!existsSync(join(root, file))) throw new Error(`repo-gate: config file ${file} is missing; copy repo-gate.config.example.json and set every check (an empty value turns a check off)`);
  const own = JSON.parse(readFileSync(join(root, file), 'utf8')) as Partial<Config>;
  const cfg: Config = { ...DEFAULT_CONFIG, ...own };
  const runners = join(root, cfg.runnersFile);
  if (existsSync(runners))
    cfg.runnerNames = [...cfg.runnerNames, ...((JSON.parse(readFileSync(runners, 'utf8')) as { runnerNames?: string[] }).runnerNames ?? [])];
  return cfg;
}

export function main(root: string, cfg: Config): number {
  let files: TrackedFile[];
  try {
    files = readTracked(root);
  } catch (error) {
    console.error(`repo-gate: git is not available here (${String(error)})`);
    return 2;
  }
  const ids = readContentIds(root, cfg);
  const names = readCardNames(root, cfg);
  const findings = checkFiles(files, ids, names, cfg);
  if (cfg.portFrom !== '') {
    const ctx = portContext(process.env, (p) => readFileSync(p, 'utf8'));
    if (ctx.kind === 'error') findings.push({ path: '.', line: 0, check: 'PORT', message: `cannot read the pull request: ${ctx.why}` });
    else if (ctx.kind === 'skip') console.log(`port rule: not checked (${ctx.why})`);
    else {
      const changed = changedSince(root, ctx.base);
      const f = checkPortRule(changed, ctx.body, cfg);
      if (f !== null) findings.push(f);
      console.log(`port rule: ${ctx.where}, ${String(changed.length)} changed file(s), ${f === null ? 'ok' : 'failed'}`);
    }
  }
  for (const f of findings) console.log(`${f.path}:${String(f.line)}: ${f.check} ${f.message}`);
  const sum = (prefix: string): number =>
    files.filter((f) => f.path.startsWith(prefix)).reduce((s, f) => s + f.bytes, 0);
  const total = sum('');
  const skipped = cfg.skipMissingBlobs ? files.filter((f) => f.unsized === true).length : 0;
  if (skipped > 0) console.log(`repo-gate: ${String(skipped)} tracked file(s) are not in this partial clone: skipped, a full checkout checks their size and text`);
  if (cfg.warnRepoMB > 0 && total > cfg.warnRepoMB * MB) console.error(`repo-gate: warning: the repository is over ${String(cfg.warnRepoMB)} MB`);
  console.log(
    `repo-gate: ${String(files.length)} tracked files, ${(total / MB).toFixed(0)} MB (art ${(sum(cfg.artFolder) / MB).toFixed(0)} MB), ${String(ids.size)} content ids, ${String(names.size)} names; ${findings.length === 0 ? 'clean' : `${String(findings.length)} finding(s)`}`,
  );
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--config');
  const root = process.cwd();
  try {
    process.exitCode = main(root, loadConfig(root, at >= 0 ? (args[at + 1] ?? '') : 'repo-gate.config.json'));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  }
}
