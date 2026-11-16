// The repository gate (from Jarl, runner names as data from STCC). It reads the tracked files (git ls-files; a file that
// is not checked out is sized from git's index) and fails when:
//   SIZE          a tracked file is over 50 MB (no Git LFS), or its size cannot be read (not checked out, blob not in this clone);
//   RAW_SCAN      a tracked file is a raw scan or camera format (TIFF, BMP, PSD, RAW, DNG, HEIC...);
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
//   REPO_BUDGET   the tracked files add up to over cfg.maxRepoMB.
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
}
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
};
const MB = 1024 * 1024;
export const MAX_FILE_BYTES = 50 * MB;
/** Raw scan and camera formats. */
export const RAW_SCAN = /\.(tiff?|bmp|psd|raw|cr2|nef|arw|dng|heic|heif)$/i;
/** A Claude session URL or id. */
export const SESSION_URL =
  /claude\.ai\/code\/(?:session_|[0-9a-f]{8}-)|(?<![A-Za-z0-9_])session_[0-9A-Za-z]{20,}/;
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
  const nameRe = namesPattern(cardNames);
  const idLiteral = cfg.cardIdLiteral === '' ? null : new RegExp(cfg.cardIdLiteral);
  const runners = cfg.runnerNames.map(namePattern);
  for (const file of files) {
    if (file.bytes > MAX_FILE_BYTES) {
      findings.push({
        path: file.path,
        line: 0,
        check: 'SIZE',
        message: `${(file.bytes / MB).toFixed(1)} MB is over the 50 MB limit`,
      });
    }
    if (file.unsized)
      findings.push({ path: file.path, line: 0, check: 'SIZE', message: 'size not read: not checked out and its blob is not in this clone (fetch it or check it out)' });
    if (RAW_SCAN.test(file.path)) {
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
      !/\.test\.tsx?$/.test(file.path);
    // kept-as-written folders: only secrets are looked for there
    const textRules = !cfg.skipText.some((dir) => file.path.startsWith(dir));
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (GITHUB_TOKEN.test(line))
        findings.push({ path: file.path, line: i + 1, check: 'SECRET', message: 'a GitHub token' });
      if (PRIVATE_KEY.test(line))
        findings.push({ path: file.path, line: i + 1, check: 'SECRET', message: 'a private key' });
      if (textRules) {
        if (SESSION_URL.test(line))
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'SESSION_URL',
            message: 'a session URL',
          });
        if (TAILNET_HOST.test(line))
          findings.push({
            path: file.path,
            line: i + 1,
            check: 'TAILNET_HOST',
            message: 'a tailnet host',
          });
        if (norm(file.path) !== norm(cfg.runnersFile) && runners.some((re) => re.test(line)))
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
  if (total > cfg.maxRepoMB * MB)
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

/** The tracked files with their sizes and, for text files on disk, their text. */
export function readTracked(ROOT: string): TrackedFile[] {
  const entries = git(ROOT, ['ls-files', '-s', '-z'])
    .split('\0')
    .filter((e) => e !== '')
    .map((e) => {
      const tab = e.indexOf('\t');
      const [, sha] = e.slice(0, tab).split(' ');
      return { path: e.slice(tab + 1), sha: sha ?? '' };
    });
  const missing = entries.filter((e) => !existsSync(join(ROOT, e.path)));
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
    let out: string;
    try {
      out = ask(['--batch-check=%(objectname) %(objectsize)'], missing.map((m) => m.sha).join('\n') + '\n');
    } catch {
      // an older git stops at the first blob it may not fetch: ask one by one
      out = missing
        .map((m) => {
          try {
            return `${m.sha} ${ask(['-s', m.sha]).trim()}`;
          } catch {
            return '';
          }
        })
        .join('\n');
    }
    for (const line of out.split('\n')) {
      const [sha, size] = line.split(' ');
      if (sha !== undefined && size !== undefined && /^\d+$/.test(size)) indexSizes.set(sha, Number(size));
    }
  }
  return entries.map(({ path, sha }) => {
    const full = join(ROOT, path);
    if (!existsSync(full)) {
      const size = indexSizes.get(sha);
      return size === undefined ? { path, bytes: 0, text: null, unsized: true } : { path, bytes: size, text: null };
    }
    const bytes = statSync(full).size;
    return { path, bytes, text: BINARY.test(path) ? null : readFileSync(full, 'utf8') };
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
  for (const f of findings) console.log(`${f.path}:${String(f.line)}: ${f.check} ${f.message}`);
  const sum = (prefix: string): number =>
    files.filter((f) => f.path.startsWith(prefix)).reduce((s, f) => s + f.bytes, 0);
  const total = sum('');
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
