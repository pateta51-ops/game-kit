// CI templates: every placeholder is where the README says, nothing is hard-coded, and the rendered scripts parse.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const read = (f: string): string => readFileSync(join(here, f), 'utf8');
const where: Record<string, string[]> = {
  '{{REPO_SLUG}}': ['full-gate.mjs', 'local-ci.sh'],
  '{{RUNNER_LABEL}}': ['ci.yml', 'full-gate.yml'],
  '{{OWNER_LOGIN}}': ['ci.yml', 'full-gate.yml'],
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
    for (const f of ['local-ci.sh', 'gate-slot.sh', 'install-wsl.sh']) {
      const out = join(dir, f);
      writeFileSync(out, render(f));
      expect(spawnSync('bash', ['-n', out], { encoding: 'utf8' }).status, f).toBe(0);
    }
  });

  it('the workflows run only on the labelled runner and never on pull_request_target', () => {
    for (const f of ['ci.yml', 'full-gate.yml']) {
      const y = render(f);
      expect(y).toContain('runs-on: [self-hosted, widget]');
      expect(y).toContain("'acme'");
      expect(y).not.toMatch(/^\s*pull_request_target\s*:/m);
    }
  });
});
