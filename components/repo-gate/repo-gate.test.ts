// Repository gate. Fake tokens, session URLs, tailnet hosts and runner names are built at run time so this file never holds one.
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  checkFiles,
  checkPortRule,
  decodeText,
  portContext,
  collectIds,
  collectNames,
  idsPattern,
  DEFAULT_CONFIG,
  loadConfig,
  main,
  type Config,
  MAX_FILE_BYTES,
  namesPattern,
  readTracked,
  type TrackedFile,
} from './repo-gate.ts';

const MB = 1024 * 1024;
const RUNNER = 'ci' + '-box';
const CFG: Config = {
  ...DEFAULT_CONFIG,
  artFolder: 'public/art/',
  engineFolders: ['src/engine/'],
  engineAllowed: ['src/engine/types/'],
  cardIdLiteral: '[\'"`]C-\\d{2}(?!\\d)',
  runnerNames: [RUNNER],
};

const text = (path: string, body: string): TrackedFile => ({ path, bytes: body.length, text: body });
const binary = (path: string, bytes: number): TrackedFile => ({ path, bytes, text: null });
const checks = (files: TrackedFile[], ids: string[] = [], names: string[] = []): string[] =>
  checkFiles(files, new Set(ids), new Set(names), CFG).map((f) => `${f.path}:${String(f.line)} ${f.check}`);

describe('repo-gate', () => {
  it('passes a clean tree', () => {
    expect(checks([text('src/a.ts', 'export const a = 1;\n'), binary('dossier/art/x.png', 1000)])).toEqual(
      [],
    );
  });

  it('refuses a file over 50 MB, and accepts one at the limit', () => {
    expect(checks([binary('a.png', MAX_FILE_BYTES + 1)])).toEqual(['a.png:0 SIZE']);
    expect(checks([binary('a.png', MAX_FILE_BYTES)])).toEqual([]);
  });

  it('refuses a raw scan or camera format, whatever its size', () => {
    expect(
      checks([
        binary('scan/p1.tif', 10),
        binary('scan/p2.TIFF', 10),
        binary('a.psd', 10),
        binary('b.dng', 10),
      ]),
    ).toEqual(['scan/p1.tif:0 RAW_SCAN', 'scan/p2.TIFF:0 RAW_SCAN', 'a.psd:0 RAW_SCAN', 'b.dng:0 RAW_SCAN']);
    expect(
      checks([binary('a.png', 10), binary('b.jpg', 10), binary('c.webp', 10), binary('d.pdf', 10)]),
    ).toEqual([]);
  });

  it('finds GitHub tokens and private keys in text files, with their line, also in dossier/', () => {
    const classic = 'ghp_' + 'A1'.repeat(18);
    const fine = 'github_pat_' + 'x'.repeat(30);
    const key = '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----';
    expect(checks([text('docs/n.md', `ok\ntoken ${classic}\n${fine}\n${key}\n`)])).toEqual([
      'docs/n.md:2 SECRET',
      'docs/n.md:3 SECRET',
      'docs/n.md:4 SECRET',
    ]);
    expect(checks([text('dossier/a.md', classic)])).toEqual(['dossier/a.md:1 SECRET']);
    expect(checks([text('docs/n.md', 'ghp_short and github_pat_ alone')])).toEqual([]);
  });

  it('finds a session URL, a tailnet host and a runner name in tracked text, but not in dossier/ or docs/', () => {
    const session = 'https://claude.ai/code/' + 'session_' + '01ABCDEFGHIJKLMNOPQRSTUV';
    const host = 'my-pc.tail1a2b3.' + 'ts.net';
    const runner = RUNNER.toUpperCase();
    const body = `a ${session}\nb ${host}\nc runs on ${runner} now\n`;
    expect(checks([text('src/x.ts', body)])).toEqual([
      'src/x.ts:1 SESSION_URL',
      'src/x.ts:2 TAILNET_HOST',
      'src/x.ts:3 RUNNER_NAME',
    ]);
    expect(checks([text('docs/PLAN.md', body), text('dossier/a.md', body)])).toEqual([]);
    // the runners file holds the names: exempt from RUNNER_NAME only
    expect(checks([text(CFG.runnersFile, `{"runnerNames":["${RUNNER}"]}\n${session}\n`), text('tools/repogate/other.json', RUNNER)])).toEqual([
      `${CFG.runnersFile}:2 SESSION_URL`,
      'tools/repogate/other.json:1 RUNNER_NAME',
    ]);
    for (const runnersFile of ['./tools/repogate/runners.json', '.\\tools\\repogate\\runners.json', 'tools\\repogate\\runners.json'])
      expect(checkFiles([text('tools/repogate/runners.json', RUNNER), text('tools/repogate/runners.json.bak', RUNNER)], new Set(), new Set(), { ...CFG, runnersFile }).map((f) => f.path), runnersFile).toEqual(['tools/repogate/runners.json.bak']);
    // the bare suffix of the allowed hosts, and a placeholder, are not hosts
    expect(
      checks([text('vite.config.ts', "allowedHosts: ['.ts.net'] // https://<pc-name>.<tailnet>.ts.net")]),
    ).toEqual([]);
  });

  it('finds a card-id literal, a content id or a card name in engine rules code, but not in types/, tests or outside the engine', () => {
    const ids = ['base-ms-dread'];
    const names = ['Aqueduct'];
    const body =
      "// the Aqueduct\nif (id === 'C-05') {}\nconst x = 'base-ms-dread';\nconst y = \"Aqueduct\";\n";
    expect(checks([text('src/engine/rules/growth.ts', body)], ids, names)).toEqual([
      'src/engine/rules/growth.ts:2 CONTENT_ID',
      'src/engine/rules/growth.ts:3 CONTENT_ID',
      'src/engine/rules/growth.ts:4 CONTENT_NAME',
    ]);
    for (const path of [
      'src/engine/types/ids.ts',
      'src/engine/rules/growth.test.ts',
      'src/ui/x.tsx',
      'tests/x.test.ts',
    ])
      expect(checks([text(path, body)], ids, names), path).toEqual([]);
    // a whole word only: a longer id that contains it is not a hit, and a name in a comment is fine
    expect(checks([text('src/engine/a.ts', "'base-ms-dread-2' // Aqueduct 'C-055'")], ids, names)).toEqual(
      [],
    );
  });

  it('collects every id and name of a content file, at any depth', () => {
    const value = {
      cards: [{ id: 'a', name: 'One', parts: [{ id: 'b', name: 'Two' }] }],
      meta: { id: '', name: '' },
      x: [1, null],
    };
    expect([...collectIds(value)].sort()).toEqual(['a', 'b']);
    expect([...collectNames(value)].sort()).toEqual(['One', 'Two']);
    expect(idsPattern([])).toBeNull();
    expect(namesPattern([])).toBeNull();
  });

  it('holds the art and repository budgets', () => {
    const n = Math.ceil((CFG.maxArtMB * MB) / MAX_FILE_BYTES) + 1;
    const art = Array.from({ length: n }, (_, i) =>
      binary(`public/art/full/${String(i)}.webp`, MAX_FILE_BYTES),
    );
    expect(checks(art)).toEqual(['public/art/:0 ART_BUDGET']);
    expect(checks(art.map((f) => ({ ...f, path: f.path.replace('.webp', '.png') })))).toEqual([]);
    const parts = Array.from({ length: 32 }, (_, i) => binary(`dossier/${String(i)}.png`, MAX_FILE_BYTES));
    expect(checks(parts)).toEqual(CFG.maxRepoMB * MB < 32 * MAX_FILE_BYTES ? ['.:0 REPO_BUDGET'] : []);
  });
});

describe('config and command line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-gate-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reports an indexed node_modules link as a dependency finding and preserves the link on recovery', () => {
    const root = join(dir, 'linked-project');
    const target = join(dir, 'dependencies');
    const link = join(root, 'node_modules');
    mkdirSync(root);
    mkdirSync(target);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const gate = () => spawnSync(process.execPath, [join(import.meta.dirname, 'repo-gate.ts')], { cwd: root, encoding: 'utf8' });
    git('init', '-q');
    writeFileSync(join(root, 'repo-gate.config.json'), '{}');
    writeFileSync(join(root, '.gitignore'), 'node_modules\n');
    symlinkSync(target, link, 'junction');
    git('add', '-A');
    git('add', '-f', 'node_modules');
    const failed = gate();
    expect(failed.status, failed.stdout + failed.stderr).toBe(1);
    expect(failed.stdout).toContain('node_modules:0: DEPENDENCY_LINK');
    expect(failed.stdout).toContain('git rm --cached');
    expect(failed.stderr).not.toContain('git is not available here');
    // The Git index already proves the tracked link is invalid, even when the target is absent.
    rmdirSync(target);
    expect(gate().status).toBe(1);
    mkdirSync(target);
    git('rm', '--cached', '--', 'node_modules');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(gate().status).toBe(0);
  });

  it('reads runner names from the runners file, and runs over a temporary git repository', () => {
    const git = (...a: string[]): void => void execFileSync('git', a, { cwd: dir });
    git('init', '-q');
    mkdirSync(join(dir, 'tools/repogate'), { recursive: true });
    writeFileSync(join(dir, 'tools/repogate/runners.json'), JSON.stringify({ runnerNames: [RUNNER] }));
    writeFileSync(join(dir, 'a.txt'), 'clean\n');
    git('add', 'a.txt');
    writeFileSync(join(dir, 'repo-gate.config.json'), JSON.stringify({ artFolder: 'art/' }));
    const cfg = loadConfig(dir, 'repo-gate.config.json');
    expect(cfg.runnerNames).toEqual([RUNNER]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(main(dir, cfg)).toBe(0);
    writeFileSync(join(dir, 'b.txt'), `runs on ${RUNNER}\n`);
    git('add', 'a.txt', 'b.txt', 'tools/repogate/runners.json');
    expect(main(dir, cfg)).toBe(1);
    const out = log.mock.calls.flat().join('\n');
    expect(out).toMatch(/b\.txt:1: RUNNER_NAME/);
    expect(out).not.toMatch(/runners\.json/);
    log.mockRestore();
  });

  it('K181 sizes many blobs missing from a partial clone in one pass: held ones sized, lacking ones unsized, none fetched', () => {
    const src = mkdtempSync(join(tmpdir(), 'repo-gate-src-'));
    const clone = mkdtempSync(join(tmpdir(), 'repo-gate-clone-'));
    const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8' });
    git(src, 'init', '-q');
    git(src, 'config', 'uploadpack.allowFilter', 'true');
    for (let i = 0; i < 30; i++) writeFileSync(join(src, `f${String(i)}.txt`), `blob ${String(i)}`.repeat(i + 1));
    git(src, 'add', '.');
    git(src, '-c', 'user.name=t', '-c', 'user.email=t@invalid', 'commit', '-q', '-m', 'one');
    git(clone, 'clone', '-q', '--filter=blob:none', '--no-checkout', `file://${src.replaceAll('\\', '/')}`, '.');
    git(clone, 'read-tree', 'HEAD');
    git(clone, 'fetch', '-q', 'origin', git(clone, 'rev-parse', ':f3.txt').trim());
    const lacking = (): number => git(clone, 'rev-list', '--objects', '--missing=print', 'HEAD').split('\n').filter((l) => l.startsWith('?')).length;
    const before = lacking();
    expect(before).toBeGreaterThan(20);
    const tracked = readTracked(clone);
    expect(tracked.filter((f) => f.unsized === true)).toHaveLength(before);
    expect(tracked.find((f) => f.path === 'f3.txt')).toMatchObject({ bytes: 'blob 3'.repeat(4).length });
    expect(lacking()).toBe(before);
    for (const d of [src, clone]) rmSync(d, { recursive: true, force: true });
  });

  it('sizes a file that is not checked out from the objects held here; a blob a partial clone lacks is not fetched and is a SIZE finding, never 0 bytes', () => {
    const src = mkdtempSync(join(tmpdir(), 'repo-gate-src-'));
    const clone = mkdtempSync(join(tmpdir(), 'repo-gate-clone-'));
    const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8' });
    git(src, 'init', '-q');
    git(src, 'config', 'uploadpack.allowFilter', 'true');
    writeFileSync(join(src, 'big.txt'), 'x'.repeat(1234));
    git(src, 'add', 'big.txt');
    git(src, '-c', 'user.name=t', '-c', 'user.email=t@invalid', 'commit', '-q', '-m', 'one');
    rmSync(join(src, 'big.txt'));
    expect(readTracked(src)).toEqual([{ path: 'big.txt', bytes: 1234, text: 'x'.repeat(1234) }]);
    git(clone, 'clone', '-q', '--filter=blob:none', '--no-checkout', `file://${src.replaceAll('\\', '/')}`, '.');
    git(clone, 'read-tree', 'HEAD');
    const missing = (): string[] => git(clone, 'rev-list', '--objects', '--missing=print', 'HEAD').split('\n').filter((l) => l.startsWith('?'));
    expect(missing()).toHaveLength(1);
    const tracked = readTracked(clone);
    expect(tracked).toEqual([{ path: 'big.txt', bytes: 0, text: null, unsized: true }]);
    expect(checkFiles(tracked, new Set(), new Set(), CFG).map((f) => `${f.path} ${f.check} ${f.message}`)).toEqual([expect.stringMatching(/^big\.txt SIZE size not read/)]);
    expect(missing()).toHaveLength(1);
    // K137 skipMissingBlobs: no finding, a notice
    const skip = { ...CFG, skipMissingBlobs: true };
    expect(checkFiles(tracked, new Set(), new Set(), skip)).toEqual([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(main(clone, skip)).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toMatch(/1 tracked file\(s\) are not in this partial clone: skipped/);
    log.mockRestore();
    expect(missing()).toHaveLength(1);
    for (const d of [src, clone]) rmSync(d, { recursive: true, force: true });
  });

  it('fails loudly when the config file is missing', () => {
    expect(() => loadConfig(mkdtempSync(join(tmpdir(), 'repo-gate-none-')), 'repo-gate.config.json')).toThrow(/config file repo-gate\.config\.json is missing/);
  });

  it('K137: reads the text of a file that is not checked out from its blob, and UTF-16 text by its byte-order mark', () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-gate-text-'));
    const git = (...a: string[]): void => void execFileSync('git', a, { cwd: repo });
    git('init', '-q');
    git('config', 'core.autocrlf', 'false');
    const host = 'my-pc.tail1a2b3.' + 'ts.net';
    writeFileSync(join(repo, 'gone.txt'), `a\n${host}\n`);
    writeFileSync(join(repo, 'gone2.md'), 'clean\n');
    writeFileSync(join(repo, 'gone.png'), 'x');
    writeFileSync(join(repo, 'le.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`a\n${host}\n`, 'utf16le')]));
    writeFileSync(join(repo, 'be.txt'), Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(`a\n${host}\n`, 'utf16le').swap16()]));
    git('add', '.');
    for (const f of ['gone.txt', 'gone2.md', 'gone.png']) rmSync(join(repo, f));
    const tracked = readTracked(repo);
    expect(tracked.find((f) => f.path === 'gone.txt')).toEqual({ path: 'gone.txt', bytes: host.length + 3, text: `a\n${host}\n` });
    expect(tracked.find((f) => f.path === 'gone2.md')?.text).toBe('clean\n');
    expect(tracked.find((f) => f.path === 'gone.png')).toEqual({ path: 'gone.png', bytes: 1, text: null });
    expect(checkFiles(tracked, new Set(), new Set(), CFG).map((f) => `${f.path}:${String(f.line)} ${f.check}`).sort()).toEqual(['be.txt:2 TAILNET_HOST', 'gone.txt:2 TAILNET_HOST', 'le.txt:2 TAILNET_HOST']);
    expect(decodeText(Buffer.from('plain'))).toBe('plain');
    rmSync(repo, { recursive: true, force: true });
  });

  it('K137: a warn-only repository size prints a warning and passes; maxRepoMB 0 is no limit', () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-gate-warn-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, 'a.bin'), Buffer.alloc(2 * MB));
    execFileSync('git', ['add', '.'], { cwd: repo });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(main(repo, { ...DEFAULT_CONFIG, maxRepoMB: 0, warnRepoMB: 1 })).toBe(0);
    expect(err.mock.calls.flat().join('\n')).toMatch(/warning: the repository is over 1 MB/);
    err.mockClear();
    expect(main(repo, { ...DEFAULT_CONFIG, maxRepoMB: 0, warnRepoMB: 3 })).toBe(0);
    expect(main(repo, DEFAULT_CONFIG)).toBe(0);
    expect(err).not.toHaveBeenCalled();
    expect(main(repo, { ...DEFAULT_CONFIG, maxRepoMB: 1 })).toBe(1);
    log.mockRestore();
    err.mockRestore();
    rmSync(repo, { recursive: true, force: true });
  });

  it('K137 PORT: over a temporary repository, a pull request that changes portFrom alone fails, with a waiver passes, and a local run is not checked', () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-gate-port-'));
    const git = (...a: string[]): void => void execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@invalid', ...a], { cwd: repo });
    git('init', '-q');
    mkdirSync(join(repo, 'src/engine'), { recursive: true });
    writeFileSync(join(repo, 'src/engine/a.ts'), '1\n');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    writeFileSync(join(repo, 'src/engine/a.ts'), '2\n');
    writeFileSync(join(repo, 'body.md'), 'text\n');
    git('add', '.');
    git('commit', '-q', '-m', 'two');
    const cfg: Config = { ...DEFAULT_CONFIG, portFrom: 'src/engine/', portTo: 'port/' };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const run = (env: Record<string, string>, c: Config = cfg): number => {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const code = main(repo, c);
      vi.unstubAllEnvs();
      return code;
    };
    const none = { PORT_RULE_BASE: '', PORT_RULE_BODY_FILE: '', GITHUB_EVENT_NAME: '', GITHUB_ACTIONS: '' };
    expect(run(none)).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toMatch(/port rule: not checked/);
    const pr = { ...none, PORT_RULE_BASE: 'HEAD^1', PORT_RULE_BODY_FILE: join(repo, 'body.md') };
    expect(run(pr)).toBe(1);
    expect(log.mock.calls.flat().join('\n')).toMatch(/src\/engine\/a\.ts:0: PORT 1 file\(s\) under src\/engine\//);
    expect(run(pr, DEFAULT_CONFIG)).toBe(0);
    expect(run({ ...none, PORT_RULE_BASE: 'HEAD^1' })).toBe(1);
    expect(run({ ...none, GITHUB_EVENT_NAME: 'workflow_dispatch' })).toBe(1);
    writeFileSync(join(repo, 'event.json'), JSON.stringify({ pull_request: { number: 7, body: '- port: n/a (text only)' } }));
    expect(run({ ...none, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(repo, 'event.json') })).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toMatch(/port rule: pull request #7, 2 changed file\(s\), ok/);
    log.mockRestore();
    rmSync(repo, { recursive: true, force: true });
  });
});

describe('K137 options', () => {
  const flat = (files: TrackedFile[], cfg: Config, ids: string[] = [], names: string[] = []): string[] =>
    checkFiles(files, new Set(ids), new Set(names), cfg).map((f) => `${f.path}:${String(f.line)} ${f.check}`);

  it('PORT: a change under portFrom needs one under portTo or a waiver with a reason', () => {
    const cfg: Config = { ...CFG, portFrom: 'src/engine/', portTo: 'engine-rs/crates/' };
    expect(checkPortRule(['src/engine/a.ts', 'src/engine/b.ts', 'engine-rs/README.md'], '', cfg)).toMatchObject({ path: 'src/engine/a.ts', line: 0, check: 'PORT' });
    expect(checkPortRule(['src/engine/a.ts', 'engine-rs/crates/core/src/a.rs'], '', cfg)).toBeNull();
    expect(checkPortRule(['src/ui/a.tsx'], '', cfg)).toBeNull();
    expect(checkPortRule(['src/engine/a.ts'], 'x\n* Port: N/A (comment only)\n', cfg)).toBeNull();
    for (const body of ['port: n/a', 'port: n/a ()', 'port: n/a ( )', 'see port: n/a (x)', 'port: n/a\n(x)'])
      expect(checkPortRule(['src/engine/a.ts'], body, cfg), body).not.toBeNull();
    expect(checkPortRule(['src/engine/a.ts'], '', CFG)).toBeNull();
  });

  it('PORT: the pull request comes from the variables or the pull_request event; a dispatch without them is an error', () => {
    const read = (p: string): string => (p === 'body' ? 'B' : JSON.stringify(p === 'ev' ? { pull_request: { number: 4, body: null } } : {}));
    expect(portContext({ PORT_RULE_BASE: 'origin/main', PORT_RULE_BODY_FILE: 'body' }, read)).toEqual({ kind: 'pr', base: 'origin/main', body: 'B', where: 'HEAD against origin/main' });
    expect(portContext({ PORT_RULE_BASE: 'origin/main' }, read).kind).toBe('error');
    expect(portContext({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: 'ev' }, read)).toEqual({ kind: 'pr', base: 'HEAD^1', body: '', where: 'pull request #4' });
    expect(portContext({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: 'none' }, read).kind).toBe('error');
    expect(portContext({ GITHUB_EVENT_NAME: 'pull_request' }, read).kind).toBe('error');
    expect(portContext({ GITHUB_EVENT_NAME: 'workflow_dispatch' }, read).kind).toBe('error');
    expect(portContext({ GITHUB_EVENT_NAME: 'push', GITHUB_ACTIONS: 'true' }, read)).toEqual({ kind: 'skip', why: 'event push' });
    expect(portContext({}, read).kind).toBe('skip');
  });

  it('CONTENT_NAME and RAW_SCAN are switchable, and RAW_SCAN takes the list of a game', () => {
    const body = "const y = 'Aqueduct';\n";
    expect(flat([text('src/engine/a.ts', body)], CFG, [], ['Aqueduct'])).toEqual(['src/engine/a.ts:1 CONTENT_NAME']);
    expect(flat([text('src/engine/a.ts', body)], { ...CFG, contentName: false }, [], ['Aqueduct'])).toEqual([]);
    const scans = [binary('a.tif', 1), binary('b.PSD', 1), binary('c.bmp', 1), binary('d.heic', 1)];
    expect(flat(scans, CFG)).toHaveLength(4);
    expect(flat(scans, { ...CFG, rawScan: '' })).toEqual([]);
    expect(flat(scans, { ...CFG, rawScan: '\\.(tiff?|psd|raw)$' })).toEqual(['a.tif:0 RAW_SCAN', 'b.PSD:0 RAW_SCAN']);
  });

  it('CONTENT_ID reaches the engine test files with engineTests, not without, and never tests outside the engine', () => {
    const files = [text('src/engine/rules/a.test.ts', "x('base-ms-dread')\n"), text('tests/a.test.ts', "x('base-ms-dread')\n")];
    expect(flat(files, CFG, ['base-ms-dread'])).toEqual([]);
    expect(flat(files, { ...CFG, engineTests: true }, ['base-ms-dread'])).toEqual(['src/engine/rules/a.test.ts:1 CONTENT_ID']);
  });

  it('finds a chat URL and a session URL without code/', () => {
    const chat = 'https://claude.ai/' + 'chat/' + '0a1b2c3d-4e5f-6789-abcd-ef0123456789';
    const short = 'claude.ai/' + 'session_' + 'abc123';
    expect(flat([text('a.md', `${chat}\n${short}\nclaude.ai/chat\nclaude.ai/session_ab\n`)], CFG)).toEqual(['a.md:1 SESSION_URL', 'a.md:2 SESSION_URL']);
  });

  it('the defaults keep every check on', () => {
    expect(DEFAULT_CONFIG).toMatchObject({ sessionUrl: true, tailnetHost: true, runnerName: true, contentName: true, engineTests: false, skipMissingBlobs: false, warnRepoMB: 0, portFrom: '', rawScan: '\\.(tiff?|bmp|psd|raw|cr2|nef|arw|dng|heic|heif)$' });
  });
});

describe('K137 text switches', () => {
  it('SESSION_URL, TAILNET_HOST and RUNNER_NAME are each switchable; secrets are still found', () => {
    const session = 'https://claude.ai/code/' + 'session_' + '01ABCDEFGHIJKLMNOPQRSTUV';
    const host = 'my-pc.tail1a2b3.' + 'ts.net';
    const token = 'ghp_' + 'A1'.repeat(18);
    const files = [text('src/x.ts', `${session}\n${host}\n${RUNNER}\n${token}\n`)];
    const run = (own: Partial<Config>): string[] => checkFiles(files, new Set(), new Set(), { ...CFG, ...own }).map((f) => f.check);
    expect(run({})).toEqual(['SESSION_URL', 'TAILNET_HOST', 'RUNNER_NAME', 'SECRET']);
    expect(run({ sessionUrl: false })).toEqual(['TAILNET_HOST', 'RUNNER_NAME', 'SECRET']);
    expect(run({ tailnetHost: false })).toEqual(['SESSION_URL', 'RUNNER_NAME', 'SECRET']);
    expect(run({ runnerName: false })).toEqual(['SESSION_URL', 'TAILNET_HOST', 'SECRET']);
    expect(run({ sessionUrl: false, tailnetHost: false, runnerName: false })).toEqual(['SECRET']);
  });
});
