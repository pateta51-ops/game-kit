import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'acceptance-receipt-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const runner = path.join(import.meta.dirname, 'check-runner.ts');
const verifier = path.join(import.meta.dirname, 'receipt.ts');
const hash = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');
let serial = 0;
function fixture(scripts: Record<string, string> = { a: 'node -e "console.log(\'accepted\')"' }, extra: object = {}, kitDir = 'kit') {
  const root = path.join(tmp, String(serial++));
  mkdirSync(path.join(root, kitDir), { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), 'evidence/\n');
  writeFileSync(path.join(root, 'game-spec.json'), '{"game":"synthetic"}\n');
  writeFileSync(path.join(root, 'acceptance.json'), '{"required":["synthetic-behavior"]}\n');
  writeFileSync(path.join(root, kitDir, 'kit.lock.json'), JSON.stringify({ commit: '1'.repeat(40), components: {} }));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { check: Object.keys(scripts).map(s => 'npm run ' + s).join(' && '), ...scripts } }));
  writeFileSync(path.join(root, 'check-runner.config.json'), JSON.stringify({ first: [], lanes: [Object.keys(scripts)],
    receipt: { output: 'evidence/acceptance.json', spec: 'game-spec.json', acceptance: 'acceptance.json' }, ...extra }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Synthetic receipt fixture');
  const output = path.join(root, 'evidence/acceptance.json');
  return { root, output, git,
    run: (...args: string[]) => spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: 'utf8' }),
    verify: () => spawnSync(process.execPath, [verifier, '--verify', output], { cwd: root, encoding: 'utf8' }),
    read: () => JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>,
  };
}

it('writes executed acceptance evidence bound to the clean consumer, kit lock, spec and independent acceptance definition', () => {
  const f = fixture();
  const result = f.run();
  expect(result.status, result.stderr).toBe(0);
  expect(existsSync(f.output)).toBe(true);
  const receipt = f.read();
  expect(receipt).toMatchObject({ schemaVersion: 1, status: 'passed', binding: {
    source: { commit: f.git('rev-parse', 'HEAD'), tree: f.git('rev-parse', 'HEAD^{tree}') },
    kit: { commit: '1'.repeat(40), sha256: hash(path.join(f.root, 'kit/kit.lock.json')) },
    spec: { path: 'game-spec.json', sha256: hash(path.join(f.root, 'game-spec.json')) },
    acceptance: { path: 'acceptance.json', sha256: hash(path.join(f.root, 'acceptance.json')) },
  }, commands: [{ script: 'a', command: 'node -e "console.log(\'accepted\')"', status: 'passed', code: 0 }] });
  expect(JSON.stringify(receipt)).not.toContain(f.root);
  expect(f.verify().status).toBe(0);
});

it('keeps failed and unrun checks separate and rejects a removed command in recorded evidence', () => {
  const f = fixture({ a: 'node -e "process.exit(3)"', b: 'node -e "process.exit(0)"' }, { failFast: true });
  expect(f.run().status).toBe(1);
  expect(f.read()).toMatchObject({ status: 'failed', commands: [{ script: 'a', status: 'failed', code: 3 }, { script: 'b', status: 'not-run', code: null }] });
  expect(JSON.parse(f.verify().stdout)).toMatchObject({ status: 'failed' });
  const altered = f.read();
  altered.commands = [];
  altered.status = 'passed';
  writeFileSync(f.output, JSON.stringify(altered));
  expect(f.verify().status).toBe(1);
  expect(JSON.parse(f.verify().stdout)).toMatchObject({ status: 'invalid' });
});

it('invalidates evidence after source, specification, acceptance or kit changes', () => {
  for (const [file, contents] of [
    ['source.ts', 'export const version = 2;'],
    ['game-spec.json', '{"game":"changed"}'],
    ['acceptance.json', '{"required":["different-behavior"]}'],
    ['kit/kit.lock.json', JSON.stringify({ commit: '2'.repeat(40), components: {} })],
  ]) {
    const f = fixture();
    expect(f.run().status).toBe(0);
    writeFileSync(path.join(f.root, file!), contents!);
    const dirty = f.verify();
    expect(dirty.status).toBe(1);
    expect(JSON.parse(dirty.stdout)).toMatchObject({ status: 'stale' });
    f.git('add', '.');
    f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Changed synthetic input');
    const committed = f.verify();
    expect(committed.status).toBe(1);
    expect(JSON.parse(committed.stdout)).toMatchObject({ status: 'stale' });
  }
});

it.each(['--assume-unchanged', '--skip-worktree'])('rejects tracked changes hidden by %s', (flag) => {
  const f = fixture({ a: 'node check.cjs' });
  const script = path.join(f.root, 'check.cjs');
  writeFileSync(script, "console.log('original check');\n");
  f.git('add', 'check.cjs');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Add a consumer check');
  expect(f.run().status).toBe(0);
  f.git('update-index', flag, 'check.cjs');
  writeFileSync(script, "console.log('changed check');\n");
  expect(f.git('status', '--porcelain')).toBe('');
  const result = f.verify();
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'stale' });
  expect(f.run().status).toBe(1);
});

it('rejects a same-size tracked edit with an unchanged cached timestamp', () => {
  const f = fixture({ a: 'node check.cjs' });
  const script = path.join(f.root, 'check.cjs');
  const timestamp = new Date('2020-01-01T00:00:00Z');
  f.git('config', 'core.trustctime', 'false');
  f.git('config', 'core.checkStat', 'minimal');
  writeFileSync(path.join(f.root, '.gitattributes'), 'check.cjs text eol=crlf\n');
  writeFileSync(script, "console.log('first');\r\n");
  utimesSync(script, timestamp, timestamp);
  f.git('add', '.gitattributes', 'check.cjs');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Add a CRLF consumer check');
  expect(f.run().status).toBe(0);
  expect(f.verify().status).toBe(0);
  const prior = readFileSync(f.output);
  writeFileSync(script, "console.log('other');\r\n");
  utimesSync(script, timestamp, timestamp);
  expect(f.git('status', '--porcelain')).toBe('');
  const verify = f.verify();
  expect(verify.status).toBe(1);
  expect(JSON.parse(verify.stdout)).toMatchObject({ status: 'stale' });
  expect(f.run().status).toBe(1);
  expect(readFileSync(f.output)).toEqual(prior);
});

it('rejects changed working bytes even when a clean filter still produces the committed blob', () => {
  const f = fixture({ a: 'node check.cjs' });
  const original = "console.log('first');\n";
  const script = path.join(f.root, 'check.cjs');
  f.git('config', 'filter.fixture.clean', 'node clean-filter.cjs');
  f.git('config', 'filter.fixture.required', 'true');
  writeFileSync(path.join(f.root, '.gitattributes'), 'check.cjs filter=fixture\n');
  writeFileSync(path.join(f.root, 'clean-filter.cjs'), `require('node:fs').readFileSync(0); process.stdout.write(${JSON.stringify(original)});\n`);
  writeFileSync(script, original);
  f.git('add', '.');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Test a local clean filter');
  expect(f.run().status).toBe(0);
  expect(f.verify().status).toBe(0);
  const first = f.read().binding;
  writeFileSync(script, "console.log('other');\n");
  expect(f.git('status', '--porcelain')).toBe('');
  const verify = f.verify();
  expect(verify.status).toBe(1);
  expect(JSON.parse(verify.stdout)).toMatchObject({ status: 'stale' });
  expect(f.run().status).toBe(0);
  expect(f.read().binding).not.toEqual(first);
  expect(f.verify().status).toBe(0);
});

it('fails acceptance if a successful check changes a bound input while running', () => {
  const f = fixture({ a: 'node -e "require(\'fs\').writeFileSync(\'game-spec.json\', \'{}\')"' });
  expect(f.run().status).toBe(1);
  expect(f.read()).toMatchObject({ status: 'stale', commands: [{ status: 'passed', code: 0 }] });
});

for (const kind of ['external parent', 'replacement parent', 'symlink', 'hardlink'] as const) it(`refuses a receipt destination swapped to ${kind} during checks`, context => {
  const f = fixture({ a: 'node swap.cjs' });
  const external = mkdtempSync(path.join(tmp, 'outside-'));
  const sentinel = path.join(external, path.basename(f.output));
  const original = 'outside bytes\n';
  writeFileSync(sentinel, original);
  if (kind === 'symlink') {
    try { symlinkSync(sentinel, path.join(external, 'privilege-probe'), 'file'); }
    catch (error) {
      if (process.platform === 'win32' && error instanceof Error && 'code' in error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        context.skip('File symlink permission is unavailable');
        return;
      }
      throw error;
    }
  }
  const script = {
    'external parent': `fs.renameSync('evidence', 'evidence-old'); fs.symlinkSync(${JSON.stringify(external)}, 'evidence', 'junction');`,
    'replacement parent': "fs.renameSync('evidence', 'evidence-old'); fs.mkdirSync('evidence');",
    symlink: `fs.unlinkSync('evidence/acceptance.json'); fs.symlinkSync(${JSON.stringify(sentinel)}, 'evidence/acceptance.json');`,
    hardlink: `fs.unlinkSync('evidence/acceptance.json'); fs.linkSync(${JSON.stringify(sentinel)}, 'evidence/acceptance.json');`,
  }[kind];
  writeFileSync(path.join(f.root, '.git/info/exclude'), 'evidence-old/\n');
  writeFileSync(path.join(f.root, 'swap.cjs'), `const fs = require('node:fs'); ${script}\n`);
  f.git('add', 'swap.cjs');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Exercise replaced receipt destinations');
  const result = f.run();
  expect(readFileSync(sentinel, 'utf8')).toBe(original);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('receipt output destination changed or is unsafe');
});

it.each(['Kit', 'evidence/Node_Modules', 'evidence/.Git'])('refuses receipt output in protected case alias %s', parent => {
  const output = `${parent}/acceptance.json`;
  const f = fixture(undefined, { receipt: { output, kitLock: 'Kit/kit.lock.json', spec: 'game-spec.json', acceptance: 'acceptance.json' } }, 'Kit');
  mkdirSync(path.join(f.root, parent), { recursive: true });
  writeFileSync(path.join(f.root, '.gitignore'), `evidence/\n${output}\n`);
  f.git('add', '.gitignore');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Ignore the protected destination');
  const result = f.run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('receipt output must stay outside kit and repository internals');
  expect(existsSync(path.join(f.root, output))).toBe(false);
});

it('does not present missing, malformed or unfinished evidence as passed', () => {
  const f = fixture();
  const missing = f.verify();
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout)).toMatchObject({ status: 'missing' });
  expect(f.run().status).toBe(0);
  const unfinished = f.read();
  unfinished.completedAt = null;
  unfinished.status = 'not-run';
  writeFileSync(f.output, JSON.stringify(unfinished));
  expect(f.verify().status).toBe(1);
  expect(JSON.parse(f.verify().stdout)).toMatchObject({ status: 'not-run' });
  writeFileSync(f.output, '{');
  expect(f.verify().status).toBe(1);
  expect(JSON.parse(f.verify().stdout)).toMatchObject({ status: 'invalid' });
});

it('records an actual timeout as failed even if a process handles termination with exit zero', () => {
  const f = fixture({ a: 'node -e "process.on(\'SIGTERM\', () => process.exit(0)); setInterval(() => {}, 1000)"' }, { timeoutMinutes: 0.01, graceSeconds: 0.1 });
  expect(f.run().status).toBe(1);
  expect(f.read()).toMatchObject({ status: 'failed', commands: [{ status: 'failed' }] });
});

it('keeps truncated streamed output distinct from a complete successful check', () => {
  const f = fixture({ a: 'node background.cjs' }, { stream: true, npmSilent: true });
  writeFileSync(path.join(f.root, 'background.cjs'), "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'inherit', detached: true }); c.unref(); require('node:fs').writeFileSync('evidence/child.pid', String(c.pid)); console.log('started');\n");
  f.git('add', '.');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Synthetic held stream');
  try {
    expect(f.run().status).toBe(1);
    expect(f.read()).toMatchObject({ status: 'truncated', commands: [{ status: 'truncated', code: 0 }] });
    expect(f.verify().status).toBe(1);
  } finally {
    const child = path.join(f.root, 'evidence/child.pid');
    if (existsSync(child)) try { process.kill(Number(readFileSync(child, 'utf8'))); } catch { /* Already exited. */ }
  }
}, 15_000);

it('refuses to claim full acceptance from a PR subset', () => {
  const f = fixture({ a: 'node -e "process.exit(0)"', b: 'node -e "process.exit(3)"' }, { pr: { first: [], lanes: [['a']] } });
  const result = f.run('--pr');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('acceptance receipts require the full declared check plan');
  expect(existsSync(f.output)).toBe(false);
});

it('verifies the same effective default plan the runner executes', () => {
  const f = fixture(undefined, { first: undefined });
  expect(f.run().status).toBe(0);
  expect(f.verify().status).toBe(0);
});

it('rejects normalized and symlink output aliases before overwriting an authored input', () => {
  for (const output of ['evidence/./spec.json', 'evidence-alias/spec.json']) {
    const f = fixture();
    mkdirSync(path.join(f.root, 'evidence'));
    const spec = path.join(f.root, 'evidence/spec.json');
    const original = '{"input":"original"}\n';
    writeFileSync(spec, original);
    if (output.startsWith('evidence-alias')) {
      symlinkSync('evidence', path.join(f.root, 'evidence-alias'), 'dir');
      writeFileSync(path.join(f.root, '.gitignore'), 'evidence/\nevidence-alias\n');
    }
    const file = path.join(f.root, 'check-runner.config.json');
    const config = JSON.parse(readFileSync(file, 'utf8')) as { receipt: object };
    config.receipt = { output, spec: 'evidence/spec.json', acceptance: 'acceptance.json' };
    writeFileSync(file, JSON.stringify(config));
    f.git('add', '.');
    f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Synthetic aliased output');
    expect(f.run().status).toBe(1);
    expect(readFileSync(spec, 'utf8')).toBe(original);
  }
});

it('records cancellation as stopped when the check handles termination with exit zero', async () => {
  const f = fixture();
  const bin = path.join(tmp, 'npm-shim');
  mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, 'npm');
  writeFileSync(shim, '#!/usr/bin/env node\nconst fs=require("node:fs");process.on("SIGTERM",()=>process.exit(0));fs.writeFileSync("evidence/ready","ready");setInterval(()=>{},1000);\n');
  chmodSync(shim, 0o755);
  const child = spawn(process.execPath, [runner], { cwd: f.root, env: { ...process.env, PATH: bin + path.delimiter + (process.env['PATH'] ?? '') }, stdio: 'ignore' });
  const ended = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
  try {
    const ready = path.join(f.root, 'evidence/ready');
    for (let i = 0; i < 300 && !existsSync(ready); i++) await new Promise(resolve => setTimeout(resolve, 20));
    expect(existsSync(ready)).toBe(true);
    child.kill('SIGINT');
    expect(await ended).toBe(1);
    expect(f.read()).toMatchObject({ status: 'stopped', commands: [{ status: 'stopped', code: 0 }] });
    expect(f.verify().status).toBe(1);
  } finally {
    child.kill('SIGTERM');
    await ended;
  }
}, 10_000);

it('keeps each parallel command output distinct when npm script names differ only by punctuation', () => {
  const f = fixture({ 'a:b': 'node a.cjs', a_b: 'node b.cjs' }, { lanes: [['a:b'], ['a_b']] });
  for (const [name, other, delay, end, label] of [['a', 'b', 0, 250, 'ALPHA_ONLY'], ['b', 'a', 60, 130, 'BETA_ONLY']] as const) {
    writeFileSync(path.join(f.root, name + '.cjs'), `const fs=require('node:fs');fs.writeFileSync('evidence/${name}.ready','yes');const t=setInterval(()=>{if(!fs.existsSync('evidence/${other}.ready'))return;clearInterval(t);setTimeout(()=>console.log('${label}'),${String(delay)});setTimeout(()=>{},${String(end)});},5);`);
  }
  f.git('add', '.');
  f.git('-c', 'user.name=kit-tests', '-c', 'user.email=kit-tests@users.noreply.github.com', 'commit', '-qm', 'Distinct synthetic command output');
  const result = f.run();
  expect(result.status, result.stderr).toBe(0);
  const group = result.stdout.match(/::group::npm run a:b:[\s\S]*?::endgroup::/)?.[0];
  expect(group).toContain('ALPHA_ONLY');
  expect(group).not.toContain('BETA_ONLY');
  const commands = f.read().commands as { output: { sha256: string } }[];
  expect(commands[0]?.output.sha256).not.toBe(commands[1]?.output.sha256);
  expect(f.verify().status).toBe(0);
});
