// CI templates: every placeholder is where the README says, nothing is hard-coded, and the rendered scripts parse.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const read = (f: string): string => readFileSync(join(here, f), 'utf8');
const where: Record<string, string[]> = {
  '{{REPO_SLUG}}': ['full-gate.mjs', 'local-ci.sh', 'watch-run.sh'],
  '{{RUNNER_LABEL}}': ['ci.yml', 'full-gate.yml', 'nightly-fuzz.yml'],
  '{{OWNER_LOGIN}}': ['ci.yml', 'full-gate.yml', 'nightly-fuzz.yml'],
};
const render = (f: string): string =>
  read(f).replaceAll('{{REPO_SLUG}}', 'acme/widget').replaceAll('{{RUNNER_LABEL}}', 'widget').replaceAll('{{OWNER_LOGIN}}', 'acme');
const files = readdirSync(here).filter((f) => !f.endsWith('.test.ts') && f !== 'README.md' && f !== 'component.json');

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
    const sh = join(dir, 'watch-run.sh');
    const run = (status: string, env: Record<string, string>) => {
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
      writeFileSync(sh, render('watch-run.sh'));
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
