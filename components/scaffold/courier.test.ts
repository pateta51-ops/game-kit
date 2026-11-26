import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const kit = path.dirname(path.dirname(import.meta.dirname));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'courier-assembly-'));
const source = path.join(tmp, 'source');
const modules = path.join(kit, 'node_modules');
const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kit, encoding: 'utf8' }).trim();
const assembly = {
  kind: 'courier', version: 1,
  board: { rows: 2, cols: 3, walls: [[0, 0, 'e']] },
  depot: 'r0c0', pickup: 'r1c1', destination: 'r0c2', allowances: [5, 1],
  acceptanceRoute: ['r1c0', 'r1c1', 'r0c1', 'r0c2'],
};
const spec = { version: 1, id: 'demo', name: 'Courier Demo', profiles: ['tactical-board'], assembly };
let ref: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
const write = (name: string, value: unknown): string => {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
};
const ports = write('ports', { games: { demo: { block: 6990, serve: { local: 4199 } } } });
const run = (command: string, value: unknown, ...args: string[]) => spawnSync(process.execPath,
  [path.join(source, 'kit.mjs'), 'spec', command, write('spec', value), '--ref', ref, ...args],
  { cwd: source, encoding: 'utf8' });
const generate = (name: string, value: unknown = spec) => {
  const dir = path.join(tmp, name);
  const result = run('generate', value, '--dir', dir, '--ports', ports, '--link', modules);
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return dir;
};
const consumer = (dir: string, ...args: string[]) => spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
const changed = (dir: string, file: string, edit: (text: string) => string, check: () => void): void => {
  const target = path.join(dir, file);
  const before = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, edit(before));
  try { check(); } finally { fs.writeFileSync(target, before); }
};

beforeAll(() => {
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', kit, source]);
  git('sparse-checkout', 'set', '--no-cone', '/kit.mjs', '/components/scaffold/', '/ports.json');
  git('checkout', '--quiet', '--detach', base);
  fs.cpSync(path.join(kit, 'components/scaffold'), path.join(source, 'components/scaffold'), { recursive: true });
  git('add', 'components/scaffold');
  ref = git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', git('write-tree'), '-p', base, '-m', 'Courier assembly fixture');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('bounded courier assembly', () => {
  it('resolves an explicit executable assembly while profile-only specs remain scaffold-only', () => {
    const result = run('resolve', spec);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ assembly: { kind: 'courier', version: 1 }, commit: ref });
    const stub = run('resolve', { version: 1, id: 'demo', name: 'Demo', profiles: ['tactical-board'] });
    expect(stub.status, stub.stderr).toBe(0);
    expect(JSON.parse(stub.stdout)).not.toHaveProperty('assembly');
  });

  it('declares applicable courier gates and an independent executable rule inventory', () => {
    const dir = generate('gates');
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    for (const name of ['plancheck', 'traceability', 'plain-text', 'theme-check']) expect(pkg.scripts[name], name).toBeTypeOf('string');
    expect(pkg.scripts['plancheck']).toBe('node kit/plan-checker/plancheck.ts --plan docs/PLAN.md --applicability docs/check-applicability.json --cover Rules');
    expect(pkg.scripts['plancheck']).not.toContain('-optional');
    const trace = JSON.parse(fs.readFileSync(path.join(dir, 'trace.config.json'), 'utf8')) as { executableRuleIds: string[]; executableSuite: string };
    expect(trace.executableRuleIds).toEqual(['COU-01', 'COU-02', 'COU-03', 'COU-04', 'COU-05', 'COU-06', 'COU-07']);
    expect(fs.existsSync(path.join(dir, trace.executableSuite))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'docs/PLAN.md'), 'utf8')).toContain('## 3. Rules');
  });

  it('runs the strict non-card plan gate and rejects missing rule and scenario inputs', () => {
    const dir = generate('plan-gate');
    const check = () => consumer(dir, 'kit/plan-checker/plancheck.ts', '--plan', 'docs/PLAN.md', '--applicability', 'docs/check-applicability.json', '--cover', 'Rules');
    const passed = check();
    expect(passed.status, passed.stdout + passed.stderr).toBe(0);
    expect(passed.stdout).toContain('checked against the locked copy');
    for (const pattern of [/^- \*\*COU-07\*\*.*\n/m, /^\| SC-009 \|.*\n/m]) changed(dir, 'docs/PLAN.md', text => text.replace(pattern, ''), () => {
      const failed = check();
      expect(failed.status, failed.stdout + failed.stderr).toBe(1);
    });
  });

  it('makes the real traceability and runner commands reject omitted or incorrect evidence', () => {
    const dir = generate('gate-controls');
    const trace = () => consumer(dir, 'kit/traceability/check-traceability.ts', '--config', 'trace.config.json', '--strict', '--release');
    const passed = trace();
    expect(passed.status, passed.stdout + passed.stderr).toBe(0);
    const refuse = (diagnostic: string): void => {
      const failed = trace();
      expect(failed.status, failed.stdout + failed.stderr).toBe(1);
      expect(failed.stdout + failed.stderr).toContain(diagnostic);
    };
    changed(dir, 'docs/PLAN.md', text => text.replace(/^- \*\*COU-07\*\*.*\n/m, ''), () => refuse('inventory'));
    changed(dir, 'trace.config.json', text => JSON.stringify({ ...JSON.parse(text) as object, executableSuite: 'tests/missing.ts' }), () => refuse('missing.ts'));
    changed(dir, 'tests/rule-evidence.ts', text => text.replace('export default { adapter, cases, rules };', 'export default { adapter, cases: cases.slice(0, -1), rules };'), () => refuse('COU-07'));
    changed(dir, 'src/engine/courier.ts', text => text.replace('gridMap(config.board)', 'gridMap({ ...config.board, walls: [] })'), () => refuse('wall-diagonal-and-remote'));
    // Disable the matching invariant too: this control must reach the independent pre-pickup oracle.
    changed(dir, 'src/engine/courier.ts', text => text.replace('if (state.parcel && to === config.destination)', 'if (to === config.destination)').replace('!state.parcel || ', ''), () => refuse('destination-needs-parcel'));
    changed(dir, 'scripts/check-runner.config.json', text => {
      const config = JSON.parse(text) as { lanes: string[][] };
      return JSON.stringify({ ...config, lanes: config.lanes.map(lane => lane.filter(name => name !== 'plancheck')) });
    }, () => {
      const failed = consumer(dir, 'kit/check-runner/check-runner.ts', '--config', 'scripts/check-runner.config.json');
      expect(failed.status, failed.stdout + failed.stderr).toBe(1);
      expect(failed.stdout + failed.stderr).toContain('plancheck is a CI check but in no lane');
    });
  }, 60_000);

  it('makes presentation commands reject empty rendered UI and a literal outside theme tokens', () => {
    const dir = generate('presentation-controls');
    const plain = () => consumer(dir, 'node_modules/vitest/vitest.mjs', 'run', 'tests/presentation.test.tsx');
    const theme = () => consumer(dir, 'kit/theme-check/theme-check.ts', '--config', 'theme-check.config.json');
    for (const check of [plain, theme]) {
      const passed = check();
      expect(passed.status, passed.stdout + passed.stderr).toBe(0);
    }
    changed(dir, 'src/ui/App.tsx', text => text.replace('return <div className="courier-app" data-courier-root><AppFrame routes={ROUTES} home="menu" /></div>;', 'return null;'), () => {
      const failed = plain();
      expect(failed.status, failed.stdout + failed.stderr).toBe(1);
      expect(failed.stdout + failed.stderr).toContain('rendered courier UI must be nonempty');
    });
    changed(dir, 'src/ui/theme/courier.css', text => text + '\n.courier-app {\n  color: #123456;\n}\n', () => {
      const failed = theme();
      expect(failed.status, failed.stdout + failed.stderr).toBe(1);
      expect(failed.stdout + failed.stderr).toContain('COLOR');
    });
  }, 60_000);

  it('rejects unsupported or invalid assemblies before publishing a destination', () => {
    for (const [index, invalid] of [
      { ...assembly, kind: 'combat' }, { ...assembly, version: 2 },
      { ...assembly, allowances: [0] }, { ...assembly, depot: 'r9c9' },
      { ...assembly, acceptanceRoute: ['r0c1', 'r0c2'] },
      { ...assembly, board: { ...assembly.board, diagonal: true } },
    ].entries()) {
      const dir = path.join(tmp, `invalid-${index}`);
      const result = run('generate', { ...spec, assembly: invalid }, '--dir', dir, '--ports', ports, '--no-install');
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stderr).toContain('courier');
      expect(fs.existsSync(dir)).toBe(false);
      expect(fs.readdirSync(tmp).filter(file => file.startsWith('.kit-spec-'))).toEqual([]);
    }
    const missing = run('resolve', { ...spec, opponent: 'automa' });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('opponent');
  });

  it('uses the pinned assembly and refuses an older pin that lacks its contract', () => {
    const file = write('old-spec', spec);
    const dir = path.join(tmp, 'old');
    const result = spawnSync(process.execPath, [path.join(source, 'kit.mjs'), 'spec', 'generate', file, '--ref', 'v0.276.1', '--dir', dir, '--ports', ports, '--no-install'], { cwd: source, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('assembly');
    expect(fs.existsSync(dir)).toBe(false);
    const template = path.join(source, 'components/scaffold/courier/src/engine/courier.ts.tpl');
    const original = fs.readFileSync(template, 'utf8');
    fs.writeFileSync(template, original.replace('state.movesLeft--', 'state.movesLeft += 0'));
    try {
      const pinned = generate('pinned');
      expect(fs.readFileSync(path.join(pinned, 'src/engine/courier.ts'), 'utf8')).toContain('state.movesLeft--');
    } finally { fs.writeFileSync(template, original); }
  });

  it('generates one game definition used by rules, store, UI and simulation, with a second configuration', () => {
    for (const [name, configuration] of [
      ['default', assembly],
      ['short', { ...assembly, board: { rows: 1, cols: 3 }, depot: 'r0c0', pickup: 'r0c1', destination: 'r0c2', allowances: [2, 1], acceptanceRoute: ['r0c1', 'r0c2'] }],
    ] as const) {
      const dir = generate(name, { ...spec, assembly: configuration });
      const locked = consumer(dir, 'kit/kit.mjs', 'check', '--source', source);
      expect(locked.status, locked.stdout + locked.stderr).toBe(0);
      const checked = consumer(dir, 'node_modules/typescript/bin/tsc', '-b', '--noEmit');
      expect(checked.status, checked.stdout + checked.stderr).toBe(0);
      const tested = consumer(dir, 'node_modules/vitest/vitest.mjs', 'run');
      expect(tested.status, tested.stdout + tested.stderr).toBe(0);
      expect(tested.stdout).toContain('passed');
      const linted = consumer(dir, 'node_modules/eslint/bin/eslint.js', 'src', 'tests');
      expect(linted.status, linted.stdout + linted.stderr).toBe(0);
      if (name === 'default') {
        const built = consumer(dir, 'node_modules/vite/bin/vite.js', 'build');
        expect(built.status, built.stdout + built.stderr).toBe(0);
      }
    }
    for (const file of ['src/engine/courier.ts', 'src/engine/rules.ts', 'src/ui/store.ts', 'src/sim.ts'])
      expect(fs.readFileSync(path.join(tmp, 'default', file), 'utf8')).toBe(fs.readFileSync(path.join(tmp, 'short', file), 'utf8'));
  }, 120_000);

  it('makes the generated consumer command reject a broken movement cost', () => {
    const dir = generate('bad-cost');
    const file = path.join(dir, 'src/engine/courier.ts');
    const before = fs.readFileSync(file, 'utf8');
    expect(before).toContain('state.movesLeft--');
    fs.writeFileSync(file, before.replace('state.movesLeft--', 'state.movesLeft += 0'));
    const tested = consumer(dir, 'node_modules/vitest/vitest.mjs', 'run', 'tests/smoke.test.ts');
    expect(tested.status, tested.stdout + tested.stderr).toBe(1);
    expect(tested.stdout + tested.stderr).toContain('movement allowance');
  }, 60_000);

  it.skipIf(!process.env['PW_CHROMIUM_PATH'] && !fs.existsSync(chromium.executablePath()) && !process.env['CI'])('plays the generated browser game and rejects a disconnected move button', () => {
    const dir = generate('browser');
    const browser = (gameDir: string, timeout: string) => spawnSync(process.execPath, ['kit/ci-templates/full-gate.mjs', 'e2e'], {
      cwd: gameDir, encoding: 'utf8', env: { ...process.env, E2E_SCRIPTS: 'test:e2e', E2E_TEST_TIMEOUT_MS: timeout },
    });
    const played = browser(dir, '10000');
    expect(played.status, played.stdout + played.stderr).toBe(0);
    expect(played.stdout).toContain('Courier browser acceptance passed');
    const wide = generate('browser-wide', { ...spec, name: 'IntercontinentalCourierDispatchService', assembly: { ...assembly, board: { ...assembly.board, cols: 20 } } });
    const widePlayed = browser(wide, '10000');
    expect(widePlayed.status, widePlayed.stdout + widePlayed.stderr).toBe(0);
    expect(widePlayed.stdout).toContain('Courier browser acceptance passed');
    const file = path.join(dir, 'src/ui/App.tsx');
    const before = fs.readFileSync(file, 'utf8');
    const answer = 'game.answer([option.id], view.prompt?.id ?? -1)';
    expect(before).toContain(answer);
    fs.writeFileSync(file, before.replace(answer, 'undefined'));
    const broken = browser(dir, '1500');
    expect(broken.status, broken.stdout + broken.stderr).toBe(1);
  }, 90_000);
});
