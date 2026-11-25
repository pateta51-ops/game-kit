import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { e2eCommand, e2eNeeded, finish, kitImports, orders, type Exec } from '../scripts/agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'k712-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const FIX = path.join(import.meta.dirname, 'fixtures', 'k712-pr305');
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, t = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
const imps = (o: Record<string, string[]>) => new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]));

function game(name: string, base: Record<string, string>, files: Record<string, string>): string {
  const bare = path.join(root, `${name}.git`), main = path.join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  for (const [f, t] of Object.entries({ 'src/old.ts': 'export const a = 1', ...base })) put(main, f, t);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  g(main, 'switch', '-qc', 'batch');
  for (const [f, t] of Object.entries(files)) put(main, f, t);
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'work');
  return main;
}
function run(main: string, body: string | null, extra: string[] = []) {
  const out: string[] = [], sent: string[] = [];
  const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
  const bf = path.join(root, `${path.basename(main)}-${out.length}-body.md`);
  if (body !== null) fs.writeFileSync(bf, body);
  const exec: Exec = (c, _a, input) => c === 'gh' ? { status: 1, output: '' } : (sent.push(input), { status: 0, output: 'all good' });
  const rc = finish(['--repo', main, ...(body !== null ? ['--body', bf] : []), ...extra], io, exec, false);
  const script = sent.find((s) => s.includes('npm run check') || s.includes('echo hi')) ?? '';
  return { rc, text: out.join('\n'), ran: script !== '', script };
}
const E2E = { 'package.json': JSON.stringify({ scripts: { e2e: 'playwright test' } }) };
const proof = '| readme: "Fits, zooms and pans a large SVG or DOM board." | tried: e2e table.spec.ts -> the wheel zooms';

describe('K712 orders: Must use, Waived, Kit gap proof, ORDERS n/m', () => {
  it('K712 a Must use part that is not imported fails, naming the part and its exports; ORDERS 0/1', () => {
    const r = orders('Must use: card-zoom:transcribe, card-zoom:CardZoom\n', imps({ 'card-hand': ['CardHand'] }));
    expect(r.probs).toHaveLength(1);
    expect(r.probs[0]).toContain('must use: card-zoom (transcribe, CardZoom)');
    expect(r.line).toBe('ORDERS 0/1 missing: card-zoom (transcribe, CardZoom)');
  });
  it('K712 a part imported but missing one listed export still fails, naming that export only', () => {
    const r = orders('- **Must use:** `card-zoom:transcribe`, `card-zoom:placeZoom`, card-hand:CardHand\n', imps({ 'card-zoom': ['placeZoom'], 'card-hand': ['CardHand'] }));
    expect(r.probs).toEqual([expect.stringContaining('must use: card-zoom (transcribe)')]);
    expect(r.line).toBe('ORDERS 1/2 missing: card-zoom (transcribe)');
  });
  it('K712 every listed export imported (or a namespace import) passes: ORDERS 2/2', () => {
    const r = orders('Must use: card-zoom:transcribe, card-hand:CardHand\n', imps({ 'card-zoom': ['transcribe'], 'card-hand': ['*'] }));
    expect(r.probs).toEqual([]);
    expect(r.line).toBe('ORDERS 2/2');
  });
  it('K712 only Waived: <part> | architect | <why> clears a part; a waiver by anyone else fails and the part stays missing', () => {
    const ok = orders('Must use: card-zoom:transcribe\nWaived: card-zoom | architect | the icon table lands next batch\n', imps({}));
    expect(ok.probs).toEqual([]);
    expect(ok.line).toBe('ORDERS 1/1');
    const self = orders('Must use: card-zoom:transcribe\nWaived: card-zoom | worker | too big\n', imps({}));
    expect(self.probs.some((p) => p.startsWith('waiver not valid'))).toBe(true);
    expect(self.probs.some((p) => p.startsWith('must use: card-zoom'))).toBe(true);
    expect(self.line).toBe('ORDERS 0/1 missing: card-zoom (transcribe)');
    const noWhy = orders('Must use: card-zoom:transcribe\nWaived: card-zoom | architect |\n', imps({}));
    expect(noWhy.probs.some((p) => p.startsWith('waiver not valid'))).toBe(true);
  });
  it('K712 a Kit gap line needs readme: "<line>" and tried: <case> -> <result>; with both it passes', () => {
    const noReadme = orders('## Kit gap\n- board-viewport: no wheel pan | tried: e2e -> zooms\n', imps({}));
    expect(noReadme.probs).toEqual([expect.stringContaining('needs readme: "<the README line it rests on>"')]);
    const noTried = orders('## Kit gap\n- board-viewport: no wheel pan | readme: "Fits, zooms and pans."\n', imps({}));
    expect(noTried.probs).toEqual([expect.stringContaining('needs tried: <command or test> -> <result>')]);
    const both = orders(`## Kit gap\n- board-viewport: no wheel pan ${proof}\n\n## Kit override\n- card-zoom: anything\n`, imps({}));
    expect(both.probs).toEqual([]);
    expect(both.line).toBe('ORDERS 0/0');
  });
  it('K712 a Kit gap line for a Must use part fails even with its proof', () => {
    const r = orders(`Must use: card-attachments:HostStack\n## Kit gap\n- card-attachments: not used ${proof}\n`, imps({ 'card-attachments': ['HostStack'] }));
    expect(r.probs).toEqual([expect.stringContaining('kit gap line for a Must use part card-attachments')]);
  });
  it('K712 no Must use line and a "none" Kit gap section pass as today: ORDERS 0/0', () => {
    const r = orders('## Summary\nstuff\n## Kit gap\nnone\n', imps({}));
    expect(r).toEqual({ line: 'ORDERS 0/0', probs: [] });
  });
  it('K712 kit imports: resolved from the file, kit/<part>/ or kit/components/<part>/, names, default, namespace, multi-line, re-exports; the game\'s own src kit folder does not count', () => {
    const m = kitImports([
      ['src/screen/table/A.tsx', "import { placeZoom, type ZoomOptions as Z } from '../../../kit/card-zoom/index';\nimport Def, * as All from '../../../kit/card-pile/ui';\nimport {\n  HostStack,\n  footprint,\n} from '../../../kit/components/card-attachments/ui';\nimport { Panel } from '../kit/K';\nimport { Fake } from './kit/card-hand/index';"],
      ['src/x.ts', "export { buildIndex } from '../kit/glossary/match';\nexport * from '../kit/tutorial/index';\nconst t = import('../kit/saves/index');"],
    ]);
    expect([...m.get('card-zoom')!]).toEqual(['placeZoom']); // K712 review 3: a type import is not a use
    expect([...m.get('card-pile')!].sort()).toEqual(['*', 'default']);
    expect([...m.get('card-attachments')!]).toEqual(['HostStack', 'footprint']);
    expect([...m.get('glossary')!]).toEqual(['buildIndex']);
    expect([...m.get('tutorial')!]).toEqual(['*']);
    expect([...m.get('saves')!]).toEqual(['*']);
    expect(m.has('K')).toBe(false);
    expect(m.has('card-hand')).toBe(false);
  });
  it('K712 e2e paths: src/screen/** and src/app/** need e2e, other paths do not', () => {
    expect(e2eNeeded(['src/screen/table/Table.tsx', 'src/app/x/y.ts', 'src/engine/a.ts', 'docs/screen/a.md'])).toEqual(['src/screen/table/Table.tsx', 'src/app/x/y.ts']);
    expect(e2eNeeded(['src/engine/a.ts', 'e2e/flows.ts'])).toEqual([]);
  });
});

describe('K712 review round', () => {
  it('K712 review 1+2: imports inside comments and strings do not count; an inline comment in the braces keeps every name', () => {
    const m = kitImports([['src/a.ts', "// import { transcribe } from '../kit/card-zoom/index'\n/* import { CardZoom } from '../kit/card-zoom/ui' */\nconst s = \"import { HostStack } from '../kit/card-attachments/ui'\";\nconst u = `export * from '../kit/saves/index'`;\nimport { placeZoom /* x */, transcribe } from '../kit/card-hand/index';\nimport {\n  a, // why\n  b,\n} from '../kit/card-pile/ui';"]]);
    expect([...m.get('card-hand')!]).toEqual(['placeZoom', 'transcribe']);
    expect([...m.get('card-pile')!]).toEqual(['a', 'b']);
    expect(m.has('card-zoom')).toBe(false);
    expect(m.has('card-attachments')).toBe(false);
    expect(m.has('saves')).toBe(false);
  });
  it('K712 review 1: finish fails when the ordered import sits only in a comment', () => {
    const main = game('v1', { 'src/engine/a.ts': '' }, { 'src/engine/a.ts': "// import { transcribe } from '../../kit/card-zoom/index'\nexport {}" });
    const r = run(main, 'Must use: card-zoom:transcribe\n');
    expect(r.rc).toBe(1);
    expect(r.text).toContain('must use: card-zoom (transcribe)');
  });
  it('K712 review 3: import type and inline type names do not fulfil an order', () => {
    const m = kitImports([['src/a.ts', "import type { Transcription } from '../kit/card-zoom/index';\nimport { type ZoomOptions, placeZoom } from '../kit/card-zoom/index';\nexport type { IconSet } from '../kit/card-parts/index';"]]);
    expect([...m.get('card-zoom') ?? []]).toEqual(['placeZoom']);
    expect(m.get('card-parts')?.size ?? 0).toBe(0);
    const r = orders('Must use: card-zoom:Transcription, card-zoom:ZoomOptions, card-parts:IconSet\n', m);
    expect(r.line).toBe('ORDERS 0/2 missing: card-zoom (Transcription, ZoomOptions), card-parts (IconSet)');
  });
  it('K712 review 4: the Kit gap section ends at a bold label, or at a paragraph after a blank line; "none" is an empty section', () => {
    expect(orders('## Kit gap\nnone\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n', imps({})).probs).toEqual([]);
    expect(orders(`## Kit gap\n- board-viewport: no pan ${proof}\n**Kit override:** none\n- not a gap line\n`, imps({})).probs).toEqual([]);
    expect(orders(`## Kit gap\n- board-viewport: no pan ${proof}\n\nLook questions (for the director):\n1. a question\n`, imps({})).probs).toEqual([]);
    expect(orders('## Kit gap\n\n- board-viewport: no proof\n', imps({})).probs).toEqual([expect.stringContaining('kit gap line without proof: board-viewport: no proof')]);
    expect(orders(`## Kit gap\n- a: x ${proof}\n\n- b: no proof\n`, imps({})).probs).toEqual([expect.stringContaining('kit gap line without proof: b: no proof')]);
  });
  it('K712 review 5: an inline "Kit gap: <text>" label and a "## Kit gaps (first round)" heading are read', () => {
    expect(orders('Kit gap: board-viewport has no wheel pan\n', imps({})).probs).toEqual([expect.stringContaining('kit gap line without proof: board-viewport has no wheel pan')]);
    expect(orders('## Kit gaps (first round)\n- table-panels: no newest first\n', imps({})).probs).toEqual([expect.stringContaining('kit gap line without proof: table-panels')]);
    expect(orders('**Kit gap:** none\n', imps({})).probs).toEqual([]);
    expect(orders(`Kit gap: board-viewport has no wheel pan ${proof}\n`, imps({})).probs).toEqual([]);
  });
  it('K712 review 6: an e2e command that is a shell no-op is rejected, and the message says where the command came from', () => {
    const cases = [[{ kit: { e2e: 'true' } }, 'kit.e2e'], [{ kit: { e2e: ':' } }, 'kit.e2e'], [{ kit: { e2e: 'exit 0' } }, 'kit.e2e'], [{ scripts: { e2e: 'echo skip' } }, 'scripts e2e'], [{ kit: { e2e: 'npm run e2e' }, scripts: { e2e: 'true && echo ok' } }, 'kit.e2e'], [{ kit: { e2e: '  ' } }, 'kit.e2e']] as const;
    cases.forEach(([pk, why], i) => {
      const main = game('n' + i, { 'src/app/t.ts': '', 'package.json': JSON.stringify(pk) }, { 'src/app/t.ts': 'const x = 1' });
      const r = run(main, '');
      expect(r.rc).toBe(1);
      expect(r.ran).toBe(false);
      expect(r.text).toContain('is a no-op');
      expect(r.text).toContain(why);
    });
  });
  it('K712 review 7: with no PR body finish fails before any run (no ORDERS 0/0); --check still runs', () => {
    const main = game('p1', { 'src/engine/a.ts': '' }, { 'src/engine/a.ts': 'const x = 1' });
    const r = run(main, null);
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toContain('no PR body: open the draft PR first');
    expect(r.text).not.toContain('ORDERS');
    const c = run(main, null, ['--check', 'echo hi']);
    expect(c.rc).toBe(0);
    expect(c.text).toMatch(/^check passed /);
  });
  it('K715 a bare part in Must use is refused, saying why; <part>:* is the form for a part used whole', () => {
    const bare = orders('Must use: card-zoom\n', imps({ 'card-zoom': ['placeZoom'] }));
    expect(bare.probs).toEqual([expect.stringContaining('must use entry "card-zoom" names no export: write card-zoom:<export> (a bare part passes on any import')]);
    expect(bare.probs[0]).toContain('card-zoom:* when the part is used whole');
    const mixed = orders('Must use: pieces-3d:Chip, track\n', imps({ 'pieces-3d': ['Chip'], track: ['Track'] }));
    expect(mixed.probs).toEqual([expect.stringContaining('must use entry "track" names no export')]);
    const whole = orders('Must use: card-zoom:*\n', imps({ 'card-hand': ['CardHand'] }));
    expect(whole.probs).toEqual([expect.stringContaining('must use: card-zoom is not imported')]);
    expect(whole.line).toBe('ORDERS 0/1 missing: card-zoom');
    expect(orders('Must use: card-zoom:*\n', imps({ 'card-zoom': ['placeZoom'] }))).toEqual({ line: 'ORDERS 1/1', probs: [] });
  });
});

describe('K712 finish: orders and e2e from the changed paths', () => {
  it('K712 finish fails before any run when a Must use export is not imported, exit 1, naming the part, with the ORDERS line', () => {
    const main = game('o1', {}, { 'src/engine/a.ts': "import { CardHand } from '../../kit/card-hand/ui'" });
    const r = run(main, 'Must use: card-zoom:transcribe, card-hand:CardHand\n');
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toMatch(/^FAIL [0-9a-f]{40} \(batch; orders:/);
    expect(r.text).toContain('must use: card-zoom (transcribe)');
    expect(r.text).toContain('ORDERS 1/2 missing: card-zoom (transcribe)');
  });
  it('K712 finish passes and prints ORDERS n/m under PASS when every order is imported; a test file import does not count', () => {
    const main = game('o2', { 'src/engine/a.ts': '', 'src/engine/a.test.ts': '' }, { 'src/engine/a.ts': "import { CardHand } from '../../kit/card-hand/ui'", 'src/engine/a.test.ts': "import { transcribe } from '../../kit/card-zoom/index'" });
    const r = run(main, 'Must use: card-hand:CardHand\n');
    expect(r.rc).toBe(0);
    expect(r.text).toMatch(/^PASS [0-9a-f]{40} \(batch; check passed, clone removed\)\nORDERS 1\/1\n/);
    const t = run(main, 'Must use: card-zoom:transcribe\n');
    expect(t.rc).toBe(1);
    expect(t.text).toContain('must use: card-zoom (transcribe)');
  });
  it('K712 a change under src/screen runs e2e after the check, whatever the body says; a change elsewhere does not', () => {
    const main = game('e1', { ...E2E, 'src/screen/t.ts': '' }, { 'src/screen/t.ts': 'const x = 1' });
    const r = run(main, '## Checks\ne2e not needed: no flow change\n');
    expect(r.rc).toBe(0);
    expect(r.script).toContain(`bash -c 'npm run check && npm run e2e'`);
    expect(r.text).toContain('ORDERS 0/0\nE2E: runs (1 changed UI path(s), first src/screen/t.ts): npm run e2e (package.json scripts e2e)');
    const other = run(game('e2', { ...E2E, 'src/engine/t.ts': '' }, { 'src/engine/t.ts': 'const x = 1' }), '');
    expect(other.rc).toBe(0);
    expect(other.script).toContain(`bash -c 'npm run check'`);
    expect(other.text).not.toContain('E2E:');
  });
  it.each(['src/ui/App.tsx', 'src/ui/store.ts', 'src/main.tsx', 'index.html'])('K754 selects the scaffold browser smoke for %s', (file) => {
    const pkg = { 'package.json': JSON.stringify({ scripts: { 'test:e2e': 'node tests/scaffold.e2e.mjs' } }) };
    const result = run(game('k754-' + path.basename(file), { ...pkg, [file]: '' }, { [file]: 'changed' }), '');
    expect(result.rc).toBe(0);
    expect(result.script).toContain(`bash -c 'npm run check && npm run test:e2e'`);
    expect(result.text).toContain('first ' + file);
  });
  it('K754 uses an explicitly declared root and keeps an engine-only scoped check', () => {
    const pkg = { 'package.json': JSON.stringify({ scripts: { 'test:e2e': 'node tests/scaffold.e2e.mjs' }, kit: { e2eRoots: ['frontend/Tableaux éclairés'] } }) };
    const name = 'frontend/Tableaux éclairés/Board.tsx';
    const result = run(game('k754-frontend', { ...pkg, [name]: '' }, { [name]: 'changed' }), '');
    expect(result.rc).toBe(0);
    expect(result.script).toContain(`bash -c 'npm run check && npm run test:e2e'`);
    expect(result.text).toContain('first ' + name);
    const engine = 'src/engine/rules.ts';
    const scoped = run(game('k754-engine', { ...pkg, [engine]: '' }, { [engine]: 'changed' }), '', ['--check', 'echo hi']);
    expect(scoped.rc).toBe(0);
    expect(scoped.script).toContain(`bash -c 'echo hi'`);
    expect(scoped.text).not.toContain('E2E:');
  });
  it('K754 rejects malformed browser roots before full finish', () => {
    const name = 'src/engine/rules.ts';
    const pkg = { 'package.json': JSON.stringify({ kit: { e2eRoots: ['../elsewhere'] } }) };
    const result = run(game('k754-invalid', { ...pkg, [name]: '' }, { [name]: 'changed' }), '');
    expect(result.rc).toBe(1);
    expect(result.ran).toBe(false);
    expect(result.text).toContain('kit.e2eRoots must be an array of repository-relative directory names');
  });
  it('K712 a change under src/app with no e2e script fails before any run, exit 1; test:e2e and its phone script are found; kit.e2e wins', () => {
    const main = game('e3', { 'src/app/t.ts': '' }, { 'src/app/t.ts': 'const x = 1' });
    const r = run(main, '');
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toContain('so e2e must run, but package.json has no kit.e2e command and no e2e or test:e2e script');
    const two = game('e4', { 'package.json': JSON.stringify({ scripts: { 'test:e2e': 'p', 'test:e2e:phone': 'p' } }) }, { 'b.txt': 'b' });
    expect(e2eCommand(two)).toEqual({ cmd: 'npm run test:e2e && npm run test:e2e:phone', from: 'package.json scripts test:e2e, test:e2e:phone' });
    const own = game('e5', { 'package.json': JSON.stringify({ scripts: { e2e: 'p' }, kit: { e2e: 'npm run e2e:all' } }) }, { 'b.txt': 'b' });
    expect(e2eCommand(own)).toEqual({ cmd: 'npm run e2e:all', from: 'package.json kit.e2e' });
  });
  it('K712 second review: a kit.e2e that reaches no playwright or e2e script is refused; one that does through npm run is kept', () => {
    const chk = game('e6', { 'package.json': JSON.stringify({ scripts: { check: 'node check.mjs' }, kit: { e2e: 'npm run check' } }) }, { 'b.txt': 'b' });
    expect(e2eCommand(chk).cmd).toBe(null);
    expect((e2eCommand(chk) as { why: string }).why).toContain('runs no e2e suite');
    const gate = game('e7', { 'package.json': JSON.stringify({ scripts: { gate: 'playwright test' }, kit: { e2e: 'npm run gate' } }) }, { 'b.txt': 'b' });
    expect(e2eCommand(gate)).toEqual({ cmd: 'npm run gate', from: 'package.json kit.e2e' });
    for (const cmd of ['npm run check && echo e2e', 'tsc # e2e']) {
      const g = game('e8' + cmd.length, { 'package.json': JSON.stringify({ scripts: { check: 'node check.mjs' }, kit: { e2e: cmd } }) }, { 'b.txt': 'b' });
      expect(e2eCommand(g).cmd).toBe(null);
    }
  });
  it('K712 second review: a Kit gap line that only starts with none needs its proof', () => {
    const r = orders('## Kit gap\n- none of the viewports pan, so the table scrolls itself\n', imps({}));
    expect(r.probs.join('\n')).toMatch(/kit gap/i);
    expect(orders('## Kit gap\nnone\n', imps({})).probs).toEqual([]);
  });
});

describe('K712 replay: Unstoppable PR 305 (fixtures: kit import lines and the Must use, Built new, Kit gap sections only)', () => {
  const imports = JSON.parse(fs.readFileSync(path.join(FIX, 'imports.json'), 'utf8')) as Record<string, Record<string, string[]>>;
  const placeholders = Object.fromEntries(Object.values(imports).flatMap((o) => Object.keys(o)).map((f) => [f, '// placeholder\n']));
  const at = (name: string, sha: string) => game(name, { ...E2E, ...placeholders }, Object.fromEntries(Object.entries(imports[sha]!).map(([f, ls]) => [f, ls.join('\n') + '\n'])));
  it('K712 the first hand-back 37ad6a2f fails, naming card-zoom and card-attachments', () => {
    const r = run(at('r1', '37ad6a2f13e4a0bdf0e2219d6563a02788612ba0'), fs.readFileSync(path.join(FIX, 'body-first.md'), 'utf8'));
    expect(r.rc).toBe(1);
    expect(r.ran).toBe(false);
    expect(r.text).toContain('must use: card-zoom (transcribe, CardZoom)');
    expect(r.text).toContain('must use: card-attachments (HostStack)');
    expect(r.text).toContain('ORDERS 0/2 missing: card-zoom (transcribe, CardZoom), card-attachments (HostStack)');
  });
  it('K712 the final commit beea5568 passes, ORDERS 2/2, and e2e runs (src/screen changed)', () => {
    const r = run(at('r2', 'beea5568caa43a98737b569008412a09759640ed'), fs.readFileSync(path.join(FIX, 'body-final.md'), 'utf8'));
    expect(r.rc).toBe(0);
    expect(r.text).toMatch(/^PASS [0-9a-f]{40} .*\nORDERS 2\/2\nE2E: runs/);
    expect(r.script).toContain('npm run check && npm run e2e');
  });
});

describe('K717 test-only parts', () => {
  const kit = { 'kit/card-harness/component.json': JSON.stringify({ name: 'card-harness', testOnly: true }), 'kit/card-zoom/component.json': JSON.stringify({ name: 'card-zoom' }) };
  it('K717 a testOnly part is found in tests/ through a local re-export; it fails when no test imports it', () => {
    const ok = game('t1', kit, { 'src/engine/a.ts': 'export const z = 1', 'tests/cards/harness/index.ts': "export { expectNotOffered, expectNotFired } from '../../../kit/card-harness/index';", 'tests/cards/s15.test.ts': "import { expectNotOffered, expectNotFired } from './harness';\nexpectNotOffered; expectNotFired;" });
    const r = run(ok, 'Must use: card-harness:expectNotOffered, card-harness:expectNotFired\n');
    expect(r.text).toContain('ORDERS 1/1');
    expect(r.text).not.toContain('must use: card-harness');
    const no = game('t2', kit, { 'src/engine/a.ts': 'export const z = 1', 'tests/cards/s15.test.ts': 'export {}' });
    const f = run(no, 'Must use: card-harness:expectNotOffered\n');
    expect(f.rc).toBe(1);
    expect(f.text).toContain('must use: card-harness (expectNotOffered) is not imported under src/ or tests/');
  });
  it('K717 a part without testOnly still counts only src/ imports: a test import does not fulfil it', () => {
    const m = game('t3', kit, { 'src/engine/a.ts': 'export const z = 1', 'tests/zoom.test.ts': "import { placeZoom } from '../kit/card-zoom/index';\nplaceZoom;" });
    const r = run(m, 'Must use: card-zoom:placeZoom\n');
    expect(r.rc).toBe(1);
    expect(r.text).toContain('must use: card-zoom (placeZoom) is not imported under src/ from kit/card-zoom/');
  });
  it('K717 the kit marks card-harness and test-setup testOnly', () => {
    for (const n of ['card-harness', 'test-setup']) expect((JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'components', n, 'component.json'), 'utf8')) as { testOnly?: boolean }).testOnly).toBe(true);
  });
});
