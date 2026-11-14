// Repository gate. Fake tokens, session URLs, tailnet hosts and runner names are built at run time so this file never holds one.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  checkFiles,
  collectIds,
  collectNames,
  idsPattern,
  DEFAULT_CONFIG,
  loadConfig,
  main,
  type Config,
  MAX_FILE_BYTES,
  namesPattern,
  type TrackedFile,
} from './repo-gate';

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
    const session = '(link removed)' + 'session_' + '01ABCDEFGHIJKLMNOPQRSTUV';
    const host = 'my-pc.tail1a2b3.' + 'ts.net';
    const runner = RUNNER.toUpperCase();
    const body = `a ${session}\nb ${host}\nc runs on ${runner} now\n`;
    expect(checks([text('src/x.ts', body)])).toEqual([
      'src/x.ts:1 SESSION_URL',
      'src/x.ts:2 TAILNET_HOST',
      'src/x.ts:3 RUNNER_NAME',
    ]);
    expect(checks([text('docs/PLAN.md', body), text('dossier/a.md', body)])).toEqual([]);
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
    git('add', 'a.txt', 'b.txt');
    expect(main(dir, cfg)).toBe(1);
    expect(log.mock.calls.flat().join('\n')).toMatch(/b\.txt:1: RUNNER_NAME/);
    log.mockRestore();
  });

  it('fails loudly when the config file is missing', () => {
    expect(() => loadConfig(mkdtempSync(join(tmpdir(), 'repo-gate-none-')), 'repo-gate.config.json')).toThrow(/config file repo-gate\.config\.json is missing/);
  });
});
