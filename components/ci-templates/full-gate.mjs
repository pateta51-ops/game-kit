// the Full gate's steps that need logic, in Node so they run the same on the owner's Windows runner
// and on ubuntu-latest (full-gate.yml). Run from the gate's checkout (working directory full-gate/).
//   node .github/scripts/full-gate.mjs prepare   check PR and SHA, check the PR head is in this repository, merge it
//                                                 into main (what the pull_request event tests)
//   node .github/scripts/full-gate.mjs browsers  install Playwright's Chromium and WebKit (with system libraries where
//                                                 sudo works)
//   node .github/scripts/full-gate.mjs e2e       run each npm script of E2E_SCRIPTS (default test:e2e) on a free port, in order, within an overall
//                                                 cap (E2E_CAP_MS, default 10 min; playwright-caps.ts reads E2E_GLOBAL_TIMEOUT_MS and E2E_RUNNING_FILE); a capped run prints the tests that were running
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const isWindows = process.platform === 'win32';
const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};
// As pulled (run from kit/ci-templates/), the slug and the e2e scripts come from ci.config.json in the repository root.
const cfg = existsSync('ci.config.json') ? JSON.parse(readFileSync('ci.config.json', 'utf8')) : {};
const SLUG = '{{REPO_SLUG}}';
const REPO_SLUG = SLUG.startsWith('{{') ? cfg.repo : SLUG;
// The e2e npm scripts, run one after the other on the same free port; the gate fails if any fails (E2E_SCRIPTS, comma list; else e2eScripts of ci.config.json).
const E2E_SCRIPTS = process.env.E2E_SCRIPTS?.split(',') ?? cfg.e2eScripts ?? ['test:e2e'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf-8' }).trim();
const run = (cmd, args, env = process.env) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: isWindows });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

async function prepare() {
  const { PR, SHA, GH_TOKEN, GITHUB_REPOSITORY, GITHUB_STEP_SUMMARY } = process.env;
  if (GITHUB_REPOSITORY !== REPO_SLUG) fail(`this gate is for ${REPO_SLUG}, not ${GITHUB_REPOSITORY}`);
  if (!/^[0-9]+$/.test(PR ?? '') || !/^[0-9a-f]{40}$/.test(SHA ?? '')) fail('bad inputs: pr must be a number, sha 40 hex');
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${PR}`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) fail(`could not read PR #${PR}: HTTP ${res.status}`);
  const pr = await res.json();
  if (pr.head?.repo?.full_name !== GITHUB_REPOSITORY) fail(`the head of PR #${PR} is not in ${GITHUB_REPOSITORY}: refused`);
  if (pr.head.sha !== SHA) fail(`PR #${PR} head is ${pr.head.sha}, expected ${SHA}`);
  git('fetch', '-q', 'origin', `+pull/${PR}/head:pr-head`); // + : the runner keeps the last PR's pr-head
  const head = git('rev-parse', 'pr-head');
  if (head !== SHA) fail(`PR #${PR} head is ${head}, expected ${SHA}`);
  git('-c', 'user.name=full-gate', '-c', 'user.email=full-gate@invalid', 'merge', '-q', '--no-edit', 'pr-head');
  const line = `Tested ${git('rev-parse', '--short', 'HEAD')} = main ${git('rev-parse', '--short', 'origin/main')} + PR #${PR} head ${SHA.slice(0, 7)}`;
  console.log(line);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${line}\n`);
}

function browsers() {
  // System libraries need root once; this never waits for a sudo password.
  const sudo = !isWindows && spawnSync('sudo', ['-n', 'true']).status === 0;
  run('npx', ['playwright', 'install', ...(sudo ? ['--with-deps'] : []), 'chromium', 'webkit']);
}

async function e2e() {
  // A free port picked at run time: the owner's PC runs other projects' runners and preview servers.
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port: p } = server.address();
      server.close(() => resolve(p));
    });
  });
  console.log(`e2e port: ${port}`);
  const cap = Number(process.env.E2E_CAP_MS) || 600_000;
  const runningFile = join(tmpdir(), `e2e-running-${String(process.pid)}.txt`);
  const start = Date.now();
  // every suite always runs, in order, so a later failure never hides an earlier one; the cap is shared by all of them
  const codes = E2E_SCRIPTS.map((script) => {
    const left = Math.max(cap - (Date.now() - start), 1000);
    const env = { ...process.env, E2E_PORT: String(port), E2E_RUNNING_FILE: runningFile, E2E_GLOBAL_TIMEOUT_MS: String(left) };
    // Playwright's own globalTimeout fires first; the kill 30 s later is for a hung runner
    const r = spawnSync('npm', ['run', script], { stdio: 'inherit', env, shell: isWindows, timeout: left + (Number(process.env.E2E_KILL_GRACE_MS) || 30_000), killSignal: 'SIGKILL' });
    if (r.error || r.signal) {
      const running = existsSync(runningFile) ? readFileSync(runningFile, 'utf8').split('\n').filter(Boolean) : [];
      console.error(`::error::e2e ${script} capped after ${String(Math.round((Date.now() - start) / 1000))} s; running: ${running.join('; ') || 'unknown'}`);
      return 124;
    }
    return r.status;
  });
  rmSync(runningFile, { force: true });
  if (codes.some((c) => c !== 0)) fail(`e2e: ${E2E_SCRIPTS.map((s, i) => `${s} exit ${String(codes[i])}`).join(', ')}`);
}

const step = process.argv[2];
if (step === 'prepare') await prepare();
else if (step === 'browsers') browsers();
else if (step === 'e2e') await e2e();
else fail(`unknown step ${String(step)}: prepare | browsers | e2e`);
