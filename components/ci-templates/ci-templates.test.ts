// CI templates: every placeholder is where the README says, nothing is hard-coded, and the rendered scripts parse.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';

const here = import.meta.dirname;
const read = (f: string): string => readFileSync(join(here, f), 'utf8');
const where: Record<string, string[]> = {
  '{{REPO_SLUG}}': ['full-gate.mjs', 'local-ci.sh', 'watch-run.sh', 'watch-run.mjs'],
  '{{RUNNER_LABEL}}': ['ci.yml', 'full-gate.yml', 'nightly-fuzz.yml'],
  '{{OWNER_LOGIN}}': ['ci.yml', 'full-gate.yml', 'nightly-fuzz.yml'],
};
const render = (f: string): string =>
  read(f).replaceAll('{{REPO_SLUG}}', 'acme/widget').replaceAll('{{RUNNER_LABEL}}', 'widget').replaceAll('{{OWNER_LOGIN}}', 'acme');
const files = readdirSync(here).filter((f) => !f.endsWith('.test.ts') && f !== 'README.md' && f !== 'component.json' && f !== 'render.mjs' && f !== 'examples');

describe('placeholders', () => {
  it('appear in the files the README names, and leave none behind once replaced', () => {
    for (const [ph, names] of Object.entries(where))
      for (const f of files) expect(read(f).includes(ph), `${ph} in ${f}`).toBe(names.includes(f));
    for (const f of files) expect(render(f), f).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('names no repository, runner, login or machine path of a game', () => {
    for (const f of files) expect(read(f), f).not.toMatch(/jarl|stcc|earthborne|\/tmp\/[a-z]+-ci\b|C:\\|\/home\/[a-z]/i);
  });
});

describe('rendered files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-templates-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('full-gate.mjs is valid Node and refuses an unknown step', () => {
    const out = join(dir, 'full-gate.mjs');
    writeFileSync(out, render('full-gate.mjs'));
    expect(spawnSync(process.execPath, ['--check', out]).status).toBe(0);
    const r = spawnSync(process.execPath, [out, 'nope'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown step/);
  });

  it('full-gate.mjs as pulled takes the slug and the e2e scripts from ci.config.json, and E2E_SCRIPTS first', () => {
    const root = join(dir, 'pulled');
    mkdirSync(root);
    writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ repo: 'acme/widget', runnerLabel: 'widget', e2eScripts: ['e2e:a', 'e2e:b'] }));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'e2e:a': 'node -e "process.exit(0)"', 'e2e:b': 'node -e "process.exit(3)"', 'e2e:c': 'node -e "process.exit(0)"' } }));
    const go = (step: string, env: Record<string, string>) =>
      spawnSync(process.execPath, [join(here, 'full-gate.mjs'), step], { cwd: root, encoding: 'utf8', env: { ...process.env, PR: '1', SHA: 'a'.repeat(40), ...env } });
    const other = go('prepare', { GITHUB_REPOSITORY: 'acme/other' });
    expect(other.status).toBe(1);
    expect(other.stderr).toContain('this gate is for acme/widget, not acme/other');
    const e2e = go('e2e', { E2E_SCRIPTS: undefined as unknown as string });
    expect(e2e.status).toBe(1);
    expect(e2e.stderr).toContain('e2e: e2e:a exit 0, e2e:b exit 3');
    expect(go('e2e', { E2E_SCRIPTS: 'e2e:c' }).status).toBe(0);
  });

  it('render.mjs writes the workflows from ci.config.json, pointing at the pulled scripts, and --check finds a hand edit', () => {
    const root = join(dir, 'game');
    mkdirSync(join(root, 'kit'), { recursive: true });
    cpSync(here, join(root, 'kit/ci-templates'), { recursive: true });
    const go = (...a: string[]) => spawnSync(process.execPath, ['kit/ci-templates/render.mjs', ...a], { cwd: root, encoding: 'utf8' });
    expect(go().status).toBe(2);
    writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ repo: 'acme/widget' }));
    expect(go().status).toBe(2);
    writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ repo: 'acme/widget', runnerLabel: 'widget' }));
    expect(go('--check').status).toBe(1);
    expect(go().status).toBe(0);
    const wf = (f: string): string => readFileSync(join(root, '.github/workflows', f), 'utf8');
    expect(readdirSync(join(root, '.github/workflows')).sort()).toEqual(['ci.yml', 'full-gate.yml']);
    for (const f of ['ci.yml', 'full-gate.yml']) {
      expect(wf(f), f).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(wf(f), f).toContain('runs-on: [self-hosted, widget]');
      expect(wf(f), f).toContain("'acme'");
      expect(wf(f).split('\n').slice(1).join('\n'), f).toBe(render(f).replaceAll('.github/scripts/', 'kit/ci-templates/').replaceAll('tools/architect/', 'kit/ci-templates/'));
    }
    expect(wf('full-gate.yml')).toContain('run: node kit/ci-templates/full-gate.mjs prepare');
    expect(go('--check').status).toBe(0);
    writeFileSync(join(root, '.github/workflows/ci.yml'), wf('ci.yml').replace('timeout-minutes: 15', 'timeout-minutes: 99'));
    const edited = go('--check');
    expect(edited.status).toBe(1);
    expect(edited.stderr).toContain('.github/workflows/ci.yml differ');
    writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ repo: 'acme/widget', runnerLabel: 'widget', ownerLogin: 'boss', workflows: ['nightly-fuzz.yml'] }));
    expect(go().status).toBe(0);
    expect(wf('nightly-fuzz.yml')).toContain("github.repository_owner == 'boss'");
    // a game's extras: paths a push to main ignores, and CI on draft pull requests too
    writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ repo: 'acme/widget', runnerLabel: 'widget', pathsIgnore: ['bugs/**', 'notes/**'], runDrafts: true }));
    expect(go().status).toBe(0);
    expect(wf('ci.yml')).toContain('  push:\n    branches: [main]\n    paths-ignore: ["bugs/**", "notes/**"]\n  pull_request:\n\nconcurrency:');
    expect(wf('ci.yml')).toContain("    if: github.repository_owner == 'acme'\n");
    expect(wf('ci.yml')).not.toMatch(/draft\b.*\n\s+runs-on|types:/);
    expect(wf('full-gate.yml')).not.toContain('paths-ignore');
    expect(go('--check').status).toBe(0);
  });

  it('render.mjs writes a gate of several steps, a second job, and the push and pull_request switches (K141)', () => {
    const root = join(dir, 'steps');
    mkdirSync(join(root, 'kit'), { recursive: true });
    cpSync(here, join(root, 'kit/ci-templates'), { recursive: true });
    const base = { repo: 'acme/widget', runnerLabel: 'widget' };
    const go = (cfg: object): string => {
      writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ ...base, ...cfg }));
      expect(spawnSync(process.execPath, ['kit/ci-templates/render.mjs'], { cwd: root }).status).toBe(0);
      expect(spawnSync(process.execPath, ['kit/ci-templates/render.mjs', '--check'], { cwd: root }).status).toBe(0);
      return readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    };
    const gate = (): string => readFileSync(join(root, '.github/workflows/full-gate.yml'), 'utf8');
    const plainCi = go({});
    const plainGate = gate();
    const py = { uses: 'actions/setup-python@v7', if: 'failure()', with: { 'python-version': '3.13', cache: 'pip', 'retention-days': 7, cone: false } };
    const ci = go({
      ci: {
        name: 'Node (lint, tests)',
        timeoutMinutes: 25,
        checkout: { 'sparse-checkout': '/*\n!/media/\n', 'fetch-depth': 2 },
        node: { cache: 'npm' },
        install: 'npm ci',
        steps: ['npm run lint', { name: 'Tests: all', run: 'npm test', env: { PACK: '${{ runner.temp }}/pack.json', PORT: '4473' } }, { name: 'Browser', run: 'for a in 1 2; do\n  echo "$a"\ndone\n\nexit 1\n' }],
      },
      gate: { name: 'Full gate (check, sim, e2e)', timeoutMinutes: 90, node: { cache: 'npm' }, steps: [py, { name: 'npm run check', run: 'npm run check', env: { P: 'python' } }, 'npm run sim'] },
      jobs: { python: { name: 'Python (tools)', steps: [py, { run: 'python -m pytest tests -q', 'working-directory': 'tools/ingest' }] }, extra: { timeoutMinutes: 5, steps: ['true'] } },
    });
    const guard = "    if: github.repository_owner == 'acme' && (github.event_name != 'pull_request' || !github.event.pull_request.draft)\n    runs-on: [self-hosted, widget]\n";
    const pyYaml = '      - uses: actions/setup-python@v7\n        if: failure()\n        with:\n          python-version: "3.13"\n          cache: pip\n          retention-days: 7\n          cone: false\n';
    expect(ci.slice(ci.indexOf('jobs:'))).toBe(
      `jobs:\n  check:\n    name: Node (lint, tests)\n${guard}    timeout-minutes: 25\n    steps:\n      - uses: actions/checkout@v7\n        with:\n          sparse-checkout: |\n            /*\n            !/media/\n          fetch-depth: 2\n` +
        '      - uses: actions/setup-node@v7\n        with:\n          node-version-file: .nvmrc\n          cache: npm\n      - run: npm ci\n      - run: npm run lint\n' +
        '      - name: "Tests: all"\n        run: npm test\n        env:\n          PACK: ${{ runner.temp }}/pack.json\n          PORT: "4473"\n' +
        '      - name: Browser\n        run: |\n          for a in 1 2; do\n            echo "$a"\n          done\n\n          exit 1\n' +
        `\n  python:\n    name: Python (tools)\n${guard}    timeout-minutes: 15\n    steps:\n      - uses: actions/checkout@v7\n${pyYaml}      - run: python -m pytest tests -q\n        working-directory: tools/ingest\n` +
        `\n  extra:\n    name: extra\n${guard}    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout@v7\n      - run: "true"\n`,
    );
    expect(ci.slice(0, ci.indexOf('jobs:'))).toBe(plainCi.slice(0, plainCi.indexOf('jobs:')));
    expect(gate()).toBe(
      plainGate
        .replace('Full gate (check, e2e) on PR head merged with main', 'Full gate (check, sim, e2e)')
        .replace('timeout-minutes: 60', 'timeout-minutes: 90')
        .replace('full-gate/.nvmrc\n', 'full-gate/.nvmrc\n          cache: npm\n')
        .replace('      - run: npm run check\n', `${pyYaml}      - name: npm run check\n        run: npm run check\n        env:\n          P: python\n      - run: npm run sim\n`),
    );
    const on = go({ push: false, prTypes: ['opened', 'edited'], pathsIgnore: ['bugs/**'] });
    expect(on).toContain('on:\n  pull_request:\n    types: [opened, edited]\n\nconcurrency:');
    expect(go({ prTypes: ['opened', 'edited'], runDrafts: true })).toContain('    types: [opened, edited]\n\nconcurrency:');
    expect(go({ prTypes: ['opened'], runDrafts: true })).toContain("    if: github.repository_owner == 'acme'\n");
    expect(go({})).toBe(plainCi);
    expect(gate()).toBe(plainGate);
    // a setting with no place in the template, or a job without steps, stops the render
    const stop = (cfg: object, msg: string): void => {
      writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ ...base, ...cfg }));
      const r = spawnSync(process.execPath, ['kit/ci-templates/render.mjs'], { cwd: root, encoding: 'utf8' });
      expect(r.stderr, msg).toContain(msg);
      expect(r.status, msg).toBe(2);
    };
    stop({ gate: { checkout: { 'fetch-depth': 2 } } }, 'full-gate.yml: "checkout" of ci.config.json has no place');
    stop({ ci: { steps: 'npm run lint' } }, 'ci.yml: "steps" of ci.config.json must be a list');
    stop({ jobs: { python: { name: 'Python' } } }, 'job "python" needs "steps"');
    stop({ jobs: { python: null } }, 'job "python" needs "steps"');
    const tpl = join(root, 'kit/ci-templates/ci.yml');
    const was = readFileSync(tpl, 'utf8');
    const without = (re: RegExp, cfg: object, msg: string): void => {
      writeFileSync(tpl, was.replace(re, ''));
      stop(cfg, msg);
    };
    without(/ {6}- run: npm run check\r?\n/, { ci: { steps: ['npm run lint'] } }, 'ci.yml: "steps" of ci.config.json has no place');
    without(/ {6}- run: npm ci.*\r?\n/, { ci: { install: 'npm ci' } }, '"install"');
    without(/ {4}name: .*\r?\n/, { ci: { name: 'x' } }, '"name"');
    without(/ {6}- uses: actions\/checkout@v7\r?\n/, { ci: { checkout: { 'fetch-depth': 2 } } }, '"checkout"');
    without(/ {2}push:/, { push: false }, '"push": false');
    without(/ {4}types: .*\r?\n/, { prTypes: ['opened'] }, '"prTypes"');
    without(/ {4}if: .*\r?\n/, { jobs: { python: { steps: ['true'] } } }, 'no "if" and "runs-on" lines');
    writeFileSync(tpl, was);
    expect(go({ ci: { timeoutMinutes: 15 } })).toBe(plainCi);
  });

  it('local-ci.sh runs ci.steps then gate.steps of ci.config.json in order, instead of npm run check (Linux only)', () => {
    if (process.platform !== 'linux') return;
    const out = join(dir, 'local-out');
    const run = (name: string, cfg: object): string => {
      const root = join(dir, name);
      mkdirSync(join(root, 'kit'), { recursive: true });
      cpSync(here, join(root, 'kit/ci-templates'), { recursive: true });
      writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ repo: 'acme/widget', runnerLabel: 'widget', ...cfg }));
      const git = (...a: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@invalid', ...a], { cwd: root, encoding: 'utf8' });
      spawnSync('git', ['init', '-q', '--bare', '-b', 'main', join(dir, `${name}.git`)]);
      git('init', '-q', '-b', 'main');
      git('add', '-A');
      git('commit', '-q', '-m', 'a');
      git('remote', 'add', 'origin', join(dir, `${name}.git`));
      git('push', '-q', 'origin', 'main', 'main:feat');
      spawnSync('bash', ['kit/ci-templates/local-ci.sh', 'feat', git('rev-parse', 'HEAD').stdout.trim()], { cwd: root, encoding: 'utf8', env: { ...process.env, LOCAL_CI_DIR: out, GATE_DIR: join(dir, 'gates'), REPO_SLUG: 'acme/widget', E2E_SCRIPTS: 'none' } });
      return readFileSync(join(out, 'feat.summary'), 'utf8') + readFileSync(join(out, 'feat.log'), 'utf8');
    };
    const s = run('local-steps', {
      ci: { steps: ['echo one', { uses: 'actions/setup-python@v7' }, { name: 'two', run: 'echo "two $V in $(basename "$PWD")"\nexit 3\n', env: { V: 'v', W: '${{ runner.temp }}' }, 'working-directory': 'kit' }, { if: 'failure()', run: 'echo zzz-left-out' }] },
      gate: { steps: [{ run: 'echo three', 'working-directory': 'full-gate/kit' }] },
    });
    expect(s).toMatch(/step-1 exit=0 \d+s\nstep-2 exit=3 \d+s\nstep-3 exit=0 \d+s\n/);
    expect(s).not.toMatch(/^check exit|step-4|zzz-left-out/m);
    for (const t of ['one\n', 'two v in kit\n', 'three\n', 'RESULT RED']) expect(s).toContain(t);
    const plainRun = run('local-plain', {});
    expect(plainRun).toMatch(/^check exit=\d+ /m);
    expect(plainRun).not.toContain('step-1');
  });

  it('local-ci.sh as pulled names its output folder after origin and uses the gate-slot.sh beside it (Linux only)', () => {
    if (process.platform !== 'linux') return;
    const root = join(dir, 'local');
    mkdirSync(join(root, 'kit'), { recursive: true });
    cpSync(here, join(root, 'kit/ci-templates'), { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: root });
    spawnSync('git', ['remote', 'add', 'origin', join(dir, 'nowhere/acme/k70-widget.git')], { cwd: root });
    const out = '/tmp/k70-widget-ci';
    rmSync(out, { recursive: true, force: true });
    const r = spawnSync('bash', ['kit/ci-templates/local-ci.sh', '7', 'a'.repeat(40)], { cwd: root, encoding: 'utf8', env: { ...process.env, LOCAL_CI_DIR: '', REPO_SLUG: '' } });
    expect(r.status).toBe(2);
    expect(readFileSync(join(out, '7.summary'), 'utf8')).toBe('fetch failed\nRESULT RED\n');
    rmSync(out, { recursive: true, force: true });
    const sh = read('local-ci.sh');
    expect(sh).toContain('GS=(bash "$(cd "$(dirname "$0")" && pwd)/gate-slot.sh")');
    expect(sh).not.toContain('tools/architect/gate-slot.sh');
  });

  it('the shell scripts parse with bash -n (skipped when bash is missing)', () => {
    if (spawnSync('bash', ['--version']).status !== 0) return;
    for (const f of ['local-ci.sh', 'gate-slot.sh', 'install-wsl.sh', 'watch-run.sh']) {
      const out = join(dir, f);
      writeFileSync(out, render(f));
      expect(spawnSync('bash', ['-n', out], { encoding: 'utf8' }).status, f).toBe(0);
    }
  });

  it('install-wsl.sh exits 2 on an empty or malformed token, before any download (skipped when bash is missing)', () => {
    if (spawnSync('bash', ['--version']).status !== 0) return;
    for (const t of ['', ' \r', 'gh: Server Error (HTTP 500)', '{"message":"Server Error"}', 'short1']) {
      const r = spawnSync('bash', [join(here, 'install-wsl.sh')], {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_REPO: 'x/y', RUNNER_LABEL: 'test', RUNNER_DIR: join(dir, 'runner'), RUNNER_TOKEN: t },
      });
      expect(r.status, t).toBe(2);
      expect(r.stdout, t).toMatch(/token is missing or malformed.*registration-token.*HTTP 500.*run it again/);
      if (t.trim()) expect(r.stdout + r.stderr, t).not.toContain(t);
    }
  });

  it('the workflows run only on the labelled runner and never on pull_request_target', () => {
    for (const f of ['ci.yml', 'full-gate.yml', 'nightly-fuzz.yml']) {
      const y = render(f);
      expect(y).toContain('runs-on: [self-hosted, widget]');
      expect(y).toContain("'acme'");
      expect(y).not.toMatch(/^\s*pull_request_target\s*:/m);
    }
  });

  it('nightly-fuzz.yml has its own concurrency group and checkout folder, and never cancels or runs on a pull request', () => {
    const y = render('nightly-fuzz.yml');
    expect(y).toMatch(/concurrency:\n {2}group: nightly-fuzz\n {2}cancel-in-progress: false/);
    expect(y).toMatch(/working-directory: nightly\n/);
    expect(y).toMatch(/path: nightly\n/);
    expect(render('full-gate.yml')).not.toMatch(/group: nightly-fuzz|path: nightly\n/);
    expect(y).not.toMatch(/^\s*pull_request/m);
  });

  const py = (): boolean => spawnSync('bash', ['-c', 'python3 --version']).status === 0;

  it('watch-run.sh prints the conclusion and each failed step, and gives up at its timeout (skipped without bash or python3)', () => {
    if (!py()) return;
    const bin = join(dir, 'bin');
    const run = (status: string, env: Record<string, string>, at = dir, src = render('watch-run.sh')) => {
      const sh = join(at, 'watch-run.sh');
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, 'curl'),
        `#!/usr/bin/env bash
for a; do u=$a; done
case "$*" in *"Bearer tok"*) ;; *"Bearer lim"*) echo '{"message":"API rate limit exceeded"}'; exit 0;; *"Bearer net"*) exit 7;; *"Bearer half"*) case "$u" in */jobs*) echo '{"message":"Server Error"}'; exit 0;; esac;; *) echo '{"message":"Not Found"}'; exit 0;; esac
case "$u" in
  */repos/acme/widget/actions/runs/7) echo '${status}';;
  */runs/7/jobs*) echo '{"jobs":[{"name":"gate","conclusion":"failure","runner_name":"r1","started_at":"a","completed_at":"b","steps":[{"number":1,"name":"ok","conclusion":"success"},{"number":2,"name":"npm run check","conclusion":"failure"}]}]}';;
  *) echo '{}';;
esac
`,
      );
      chmodSync(join(bin, 'curl'), 0o755);
      writeFileSync(sh, src);
      return spawnSync('bash', ['-c', 'PATH="$BIN:$PATH" bash "$SH" 7'], {
        encoding: 'utf8',
        env: { ...process.env, BIN: bin, SH: sh, GH_TOKEN: '', GITHUB_TOKEN: '', WATCH_INTERVAL: '0', ...env },
      });
    };
    const done = run('{"status":"completed","conclusion":"failure"}', { GITHUB_TOKEN: 'tok' });
    expect(done.stdout).toContain('run 7: completed failure');
    expect(done.stdout).toContain('gate failure r1 a b');
    expect(done.stdout).toContain('   step 2 npm run check failure');
    expect(done.stdout).not.toContain('step 1');
    expect(done.status).toBe(1);
    expect(run('{"status":"completed","conclusion":"success"}', { GH_TOKEN: 'tok' }).status).toBe(0);
    const late = run('{"status":"in_progress","conclusion":null}', { GH_TOKEN: 'tok', WATCH_TIMEOUT: '0' });
    expect(late.status).toBe(3);
    expect(late.stdout).toContain('run 7: timed out, still in_progress None');
    const none = run('{"status":"completed","conclusion":"success"}', { GH_TOKEN: 'bad' });
    expect(none.status).toBe(2);
    expect(none.stdout).toContain('not found');
    const lim = run('{}', { GH_TOKEN: 'lim' });
    expect(lim.status).toBe(4);
    expect(lim.stdout).toContain('run 7: API error: API rate limit exceeded');
    const net = run('{}', { GH_TOKEN: 'net', WATCH_TIMEOUT: '0' });
    expect(net.status).toBe(3);
    expect(net.stdout).toContain('timed out, still unknown');
    const half = run('{"status":"completed","conclusion":"failure"}', { GH_TOKEN: 'half' });
    expect(half.status).toBe(1);
    expect(half.stdout).toContain('jobs: not read Server Error');
    for (const r of [none, lim, net, half]) expect(r.stderr).not.toMatch(/Traceback|Error/);
    // as pulled: the slug is REPO_SLUG, else the origin of the checkout the script is in
    const ok = '{"status":"completed","conclusion":"success"}';
    for (const [i, url] of ['git@github.com:acme/widget.git', 'https://github.com/acme/widget'].entries()) {
      const repo = join(dir, `origin${String(i)}`);
      mkdirSync(repo);
      spawnSync('git', ['init', '-q'], { cwd: repo });
      spawnSync('git', ['remote', 'add', 'origin', url], { cwd: repo });
      expect(run(ok, { GH_TOKEN: 'tok', REPO_SLUG: '' }, repo, read('watch-run.sh')).status, url).toBe(0);
      expect(run(ok, { GH_TOKEN: 'tok', REPO_SLUG: 'acme/other' }, repo, read('watch-run.sh')).status, url).toBe(4);
    }
    expect(run(ok, { GH_TOKEN: 'tok', REPO_SLUG: 'acme/widget' }, dir, read('watch-run.sh')).status).toBe(0);
  });

  it('gate-numbers.py prints the count lines of a runner log and of a local log, plus any extra pattern (skipped without python3)', () => {
    if (!py()) return;
    const log = join(dir, 'gate.log');
    writeFileSync(
      log,
      [
        '2026-01-02T03:04:05.1234567Z Tested abc1234 merged into main',
        '2026-01-02T03:04:05.1234567Z  \u001b[32mTests  412 passed\u001b[39m (412)',
        '2026-01-02T03:04:05.1234567Z npm warn noise',
        'games 200, exceptions 0',
        'traceability (12 rules)',
        'a line with a literal \\n inside: 3 failed',
        'src/a.ts(1,2): error TS2322: no',
        '\u2716 2 problems (2 errors, 0 warnings)',
        'check exit=0 41s',
        'RESULT GREEN',
        '  31 passed (2.1m)',
        'packs: 3 built',
      ].join('\n'),
    );
    const r = spawnSync('bash', ['-c', 'python3 "$PY" "$LOG" "^packs: " "games [0-9]+, exceptions"'], { encoding: 'utf8', env: { ...process.env, PY: join(here, 'gate-numbers.py'), LOG: log } });
    expect(r.stdout.split('\n').filter(Boolean)).toEqual(['Tested abc1234 merged into main', ' Tests  412 passed (412)', 'games 200, exceptions 0', 'a line with a literal \\n inside: 3 failed', 'src/a.ts(1,2): error TS2322: no', '\u2716 2 problems (2 errors, 0 warnings)', 'check exit=0 41s', 'RESULT GREEN', '  31 passed (2.1m)', 'packs: 3 built']);
  });
});

describe('K190: what the four games need (examples/<game>.json renders their workflows)', () => {
  type Job = { steps: unknown[] } & Record<string, unknown>;
  type Doc = { jobs: Record<string, Job> } & Record<string, unknown>;
  const dir = mkdtempSync(join(tmpdir(), 'ci-k180-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const norm = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (typeof x === 'string' ? x.replace(/\s+$/, '').replaceAll('kit/ci-templates/', '.github/scripts/') : x));
  const mk = (name: string, cfg: object): ((f: string) => Doc) => {
    const root = join(dir, name);
    mkdirSync(join(root, 'kit'), { recursive: true });
    cpSync(here, join(root, 'kit/ci-templates'), { recursive: true });
    writeFileSync(join(root, 'ci.config.json'), JSON.stringify(cfg));
    const r = spawnSync(process.execPath, ['kit/ci-templates/render.mjs'], { cwd: root, encoding: 'utf8' });
    expect(r.stderr, name).toBe('');
    expect(spawnSync(process.execPath, ['kit/ci-templates/render.mjs', '--check'], { cwd: root }).status).toBe(0);
    return (f) => YAML.parse(readFileSync(join(root, '.github/workflows', f), 'utf8')) as Doc;
  };
  // the differences that stay: the kit's action versions, and a permission the kit's gate asks for and the game's does not
  const left: Record<string, string[]> = { ebr: ['ci.yml step 0', 'ci.yml step 1'], imp: ['full-gate.yml permissions'], warps: [], stcc: [] };
  const files: Record<string, string[]> = { ebr: ['ci.yml'], imp: ['ci.yml', 'full-gate.yml'], warps: ['full-gate.yml'], stcc: ['full-gate.yml'] };
  for (const g of Object.keys(files))
    it(`${g}: the rendered workflow equals the game's own, but for the listed differences`, () => {
      const wf = mk(g, JSON.parse(read(`examples/${g}.json`)) as object);
      const diffs: string[] = [];
      for (const f of files[g]!) {
        const a = wf(f);
        const b = YAML.parse(read(`examples/${g}.${f}`)) as Doc;
        const [ja, jb] = [Object.values(a.jobs)[0]!, Object.values(b.jobs)[0]!];
        for (const k of ['name', 'on', 'concurrency', 'permissions']) if (norm(a[k]) !== norm(b[k])) diffs.push(`${f} ${k}`);
        for (const k of Object.keys({ ...ja, ...jb })) if (k !== 'steps' && norm(ja[k]) !== norm(jb[k])) diffs.push(`${f} job.${k}`);
        expect(ja.steps.length, `${g} ${f} steps`).toBe(jb.steps.length);
        ja.steps.forEach((s, i) => norm(s) !== norm(jb.steps[i]) && diffs.push(`${f} step ${String(i)}`));
      }
      expect(diffs).toEqual(left[g]);
    });

  it('python, rust, a failure artifact, extra steps and the header follow their keys; the rest stays as it was', () => {
    const base = { repo: 'acme/widget', runnerLabel: 'widget' };
    const plain = mk('plain', base);
    const ci = mk('keys-ci', { ...base, runDrafts: true, ci: { python: { version: '3.13', requirements: 'py/req.txt', venv: true }, rust: { components: 'clippy', commands: ['cargo test'], workingDirectory: 'rs' }, failureArtifact: { name: 'r', path: ['a/', 'b/'], retentionDays: 3 }, nodeVersion: '22', before: { check: 'echo b' }, after: { install: [{ run: 'echo a', 'timeout-minutes': 4, env: { X: '1' } }] }, dispatch: true } });
    const doc = ci('ci.yml');
    const s = JSON.stringify(doc.jobs.check!.steps);
    expect(s).toMatch(/setup-python@v7.*node-version":"22".*npm ci.*"timeout-minutes":4,"env":{"X":"1"}.*echo b.*npm run check.*rust-toolchain@stable.*"working-directory":"rs".*"if":"failure\(\)".*"path":"a\/\\nb\/(\\n)?","retention-days":3/);
    expect(s).toContain('PYTHON=$RUNNER_TEMP/venv/bin/python');
    expect(Object.keys(doc.on as object)).toEqual(['push', 'pull_request', 'workflow_dispatch']);
    expect(readFileSync(join(dir, 'keys-ci/.github/workflows/ci.yml'), 'utf8')).toContain('Draft pull requests run it too.');
    expect(readFileSync(join(dir, 'plain/.github/workflows/ci.yml'), 'utf8')).toContain('Draft pull requests do not\n# run it');
    expect(plain('ci.yml').jobs.check!.steps.length).toBe(4);
    const stop = (cfg: object, msg: string): void => {
      const root = join(dir, 'plain');
      writeFileSync(join(root, 'ci.config.json'), JSON.stringify({ ...base, ...cfg }));
      const r = spawnSync(process.execPath, ['kit/ci-templates/render.mjs'], { cwd: root, encoding: 'utf8' });
      expect(r.stderr).toContain(msg);
      expect(r.status).toBe(2);
    };
    stop({ ci: { foo: 1 } }, 'ci.yml: unknown key "foo" in ci');
    stop({ gate: { foo: 1 } }, 'full-gate.yml: unknown key "foo" in gate');
    // none of the new keys: byte for byte what the render before them wrote
    for (const f of ['ci.yml', 'full-gate.yml']) expect(readFileSync(join(dir, 'plain/.github/workflows', f), 'utf8'), f).toBe(read(`examples/plain.${f}`));
    const jobs = mk('jobs', { ...base, ci: { if: "github.actor == 'x'", runsOn: 'ubuntu-latest', timeoutMinutes: 5 }, jobs: { extra: { steps: ['true'] } } });
    const x = jobs('ci.yml').jobs;
    expect([x.check!.if, x.extra!.if, x.check!['runs-on'], x.extra!['runs-on']]).toEqual(["github.actor == 'x'", "github.actor == 'x'", 'ubuntu-latest', 'ubuntu-latest']);
    stop({ ci: { after: { nowhere: ['true'] } } }, 'unknown step "nowhere"');
    stop({ ci: { flat: true } }, '"flat" is for the gate only');
    stop({ gate: { draftConcurrency: true } }, 'full-gate.yml: "draftConcurrency"');
  });
  it('K221: concurrency never cancels main', () => {
    for (const f of ['ci.yml', 'full-gate.yml']) expect(render(f)).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });
});

describe('watch-run.mjs (K238)', () => {
  const wdir = mkdtempSync(join(tmpdir(), 'ci-watch-'));
  afterAll(() => rmSync(wdir, { recursive: true, force: true }));
  it('prints the conclusion and each failed step in plain node, and gives up at its timeout', async () => {
    const { createServer } = await import('node:http');
    const srv = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url?.startsWith('/repos/acme/widget/actions/runs/7/jobs')) res.end('{"jobs":[{"name":"gate","conclusion":"failure","runner_name":"r1","started_at":"a","completed_at":"b","steps":[{"number":1,"name":"ok","conclusion":"success"},{"number":2,"name":"npm run check","conclusion":"failure"}]}]}');
      else if (req.url === '/repos/acme/widget/actions/runs/7') res.end('{"status":"completed","conclusion":"failure"}');
      else if (req.url === '/repos/acme/widget/actions/runs/8') res.end('{"status":"in_progress","conclusion":null}');
      else res.end('{"message":"Not Found"}');
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as { port: number }).port;
    const f = join(wdir, 'watch-run.mjs');
    writeFileSync(f, render('watch-run.mjs'));
    const run = (id: string, env: Record<string, string> = {}) =>
      new Promise<{ status: number | null; stdout: string }>((resolve) => {
        let stdout = '';
        const p = spawn(process.execPath, [f, id], { env: { ...process.env, GH_TOKEN: 'tok', WATCH_API: `http://127.0.0.1:${String(port)}`, WATCH_INTERVAL: '0', ...env } });
        p.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
        p.on('close', (status) => resolve({ status, stdout }));
      });
    const done = await run('7');
    expect(done.status).toBe(1);
    expect(done.stdout).toContain('run 7: completed failure');
    expect(done.stdout).toContain('   step 2 npm run check failure');
    expect(done.stdout).not.toContain('step 1');
    expect((await run('8', { WATCH_TIMEOUT: '0' })).status).toBe(3);
    expect((await run('9')).status).toBe(2);
    srv.close();
  });
});
