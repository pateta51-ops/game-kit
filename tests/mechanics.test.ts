import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// K524: the mechanics map, parts inside big parts, search over both, the gate, and a clean `list`.
const ROOT = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k524-'));
const env = { ...process.env, HOME: tmp, USERPROFILE: tmp };
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const put = (f: string, s: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const node = (...a: string[]) => spawnSync('node', a, { encoding: 'utf8', env });

type Line = { words: string; tool?: string; part?: string; read?: string; pending?: string; row?: string; sheet?: string };
type Fake = { notes: Record<string, Record<string, unknown>>; lines: Line[]; searches: Record<string, string>; rows: Record<string, string> };
const entry = (title: string, more: Record<string, unknown> = {}) => ({ title, use: 'You need ' + title + '.', not: 'Anything else.', tags: ['one', 'two', 'three'], visible: false, release: 1, ...more });
let n = 0;
const fake = (edit: (f: Fake) => void = () => {}) => {
  const root = path.join(tmp, 'r' + String(n++));
  for (const f of ['catalog.mjs', 'plan.mjs', 'mechanics-check.mjs']) put(path.join(root, 'scripts', f), fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'));
  put(path.join(root, 'kit.mjs'), fs.readFileSync(path.join(ROOT, 'kit.mjs'), 'utf8'));
  put(path.join(root, 'components', 'plan-checker', 'plancheck.py'), fs.readFileSync(path.join(ROOT, 'components', 'plan-checker', 'plancheck.py'), 'utf8'));
  put(path.join(root, 'components', 'plan-checker', 'component.json'), JSON.stringify({ name: 'plan-checker', source: { game: 'none' }, needs: [] }));
  put(path.join(root, 'components', 'plan-checker', 'README.md'), '# plan-checker\n\nThe plan checker.\n');
  put(path.join(root, 'components', 'plan-checker', 'index.ts'), 'export const zplan = 1\n');
  for (const c of ['alpha', 'tool']) {
    put(path.join(root, 'components', c, 'component.json'), JSON.stringify({ name: c, source: { game: 'none' }, needs: [] }));
    put(path.join(root, 'components', c, 'README.md'), '# ' + c + '\n\nThe ' + c + ' part.\n');
    put(path.join(root, 'components', c, 'index.ts'), 'export const ' + c + ' = 1\n');
  }
  put(path.join(root, 'components', 'alpha', 'guide.md'), '# guide\n');
  const f: Fake = {
    notes: {
      alpha: entry('Alpha things'),
      tool: entry('Tool things', { mechanics: 'none: tooling' }),
      'plan-checker': entry('Zplan things', { mechanics: 'none: tooling' }),
      'alpha/inner': { title: 'Inner blorp of alpha', use: 'You blorp.', tags: ['blorp', 'inner', 'deep'], guide: 'guide.md' },
    },
    lines: [
      { words: 'zorking, zork a blip', part: 'alpha', read: 'guide.md', sheet: 'dice' },
      { words: 'flarn', part: 'ghost', pending: 'K900', sheet: 'dice' },
      { words: 'quux', row: 'K901', sheet: 'dice' },
    ],
    searches: { zorking: 'alpha' },
    rows: { K900: 'open', K901: 'candidate' },
  };
  edit(f);
  put(path.join(root, 'docs', 'catalog-notes.json'), JSON.stringify(f.notes));
  put(path.join(root, 'docs', 'mechanics.json'), JSON.stringify({ lines: f.lines, searches: f.searches }));
  put(path.join(root, 'docs', 'plan', '_template.md'), '# Plan\n\n| Id | Content | State |\n|---|---|---|\n<!-- rows: Test -->\n');
  for (const [id, state] of Object.entries(f.rows)) put(path.join(root, 'docs', 'plan', id + '.md'), '---\nsection: Test\nstate: ' + state + '\n---\nA row.\n');
  fs.mkdirSync(path.join(root, 'docs', 'recipes'), { recursive: true });
  const write = node(path.join(root, 'scripts', 'catalog.mjs'));
  return {
    root, write,
    catalog: () => node(path.join(root, 'scripts', 'catalog.mjs'), '--check'),
    gate: () => node(path.join(root, 'scripts', 'mechanics-check.mjs'), root),
    kit: (...a: string[]) => node(path.join(root, 'kit.mjs'), ...a),
  };
};

describe('K524 parts inside a component', () => {
  it('a sub-part entry is accepted, prints under its component, and search names its guide', () => {
    const r = fake();
    expect(r.write.status).toBe(0);
    expect(r.catalog().status).toBe(0);
    const cat = fs.readFileSync(path.join(r.root, 'docs', 'CATALOG.md'), 'utf8');
    expect(cat.indexOf('### alpha/inner')).toBeGreaterThan(cat.indexOf('## alpha'));
    expect(cat.indexOf('### alpha/inner')).toBeLessThan(cat.indexOf('## tool'));
    expect(r.kit('search', 'blorp').stdout).toBe('Inner blorp of alpha (`alpha/inner`): Use: You blorp. Guide: alpha/guide.md\n');
  });
  it('a sub-part with no guide file, or under no component, fails with exit 1', () => {
    const a = fake((f) => { f.notes['alpha/inner']!.guide = 'absent.md'; });
    expect(a.write.status).toBe(1);
    expect(a.write.stderr).toContain('alpha/inner: a part inside a component needs');
    const b = fake((f) => { f.notes['ghost/inner'] = f.notes['alpha/inner']!; });
    expect(b.write.status).toBe(1);
    expect(b.write.stderr).toContain('ghost/inner: in docs/catalog-notes.json but not a component');
  });
});

describe('K524 mechanics page and search', () => {
  it('the page is generated, and a stale page fails --check', () => {
    const r = fake();
    const page = path.join(r.root, 'docs', 'recipes', 'mechanics.md');
    expect(fs.readFileSync(page, 'utf8')).toContain('\n## Dice\n\n| Mechanic | Answer |\n|---|---|\n| zorking, zork a blip | `alpha`: read guide.md |\n| flarn | `ghost` (pending: K900) |\n| quux | not in the kit (candidate K901) |\n');
    fs.appendFileSync(page, 'x');
    const c = r.catalog();
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('docs/recipes/mechanics.md is stale');
  });
  it('a mechanics hit prints first; component lines keep their order after it', () => {
    const r = fake((f) => { f.lines[0]!.words = 'zorking, alpha zork'; });
    expect(r.kit('search', 'alpha').stdout.split('\n').slice(0, 3)).toEqual([
      'mechanic: zorking, alpha zork -> `alpha`: read guide.md',
      'Alpha things (`alpha`): Use: You need Alpha things.',
      'Inner blorp of alpha (`alpha/inner`): Use: You blorp. Guide: alpha/guide.md',
    ]);
    expect(r.kit('search', 'zork').stdout).toBe('mechanic: zorking, alpha zork -> `alpha`: read guide.md\n');
  });
  it('a miss prints the nearest mechanics line before "not in the kit by that name"', () => {
    const r = fake();
    const out = r.kit('search', 'quuz').stdout.split('\n').filter(Boolean);
    expect(out.slice(-2)).toEqual(['nearest mechanic: quux -> not in the kit (candidate K901)', 'not in the kit by that name']);
  });
  it('a nonsense miss prints no nearest line: only a shared word or a small edit distance counts', () => {
    const r = fake();
    const out = r.kit('search', 'zzgravity').stdout;
    expect(out).not.toContain('nearest mechanic');
    expect(out.endsWith('not in the kit by that name\n')).toBe(true);
    expect(r.kit('search', 'zork', 'wibble').stdout).toContain('nearest mechanic: zorking, zork a blip -> ');
  });
  it('K673 a query of two or more words never gets a "not in the kit" or candidate line as nearest on one shared word', () => {
    const r = fake();
    const out = r.kit('search', 'quux', 'zebra').stdout;
    expect(out).not.toContain('nearest mechanic');
    expect(out).not.toContain('K901');
    expect(out.endsWith('not in the kit by that name\n')).toBe(true);
  });
  it('a search that hits only a "not in the kit" mechanics line is logged as a miss; a hit on a part is not', () => {
    const r = fake();
    expect(r.kit('search', 'zorking').stdout).toMatch(/^mechanic: zorking/);
    expect(r.kit('search', 'quux').stdout).toBe('mechanic: quux -> not in the kit (candidate K901)\n');
    // K685: the fake is a kit repository (components/ beside kit.mjs), so nothing is logged there; a game layout logs
    const logFile = path.join(tmp, '.game-kit', 'search-misses.log');
    expect(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '').not.toContain('quux');
    const g = path.join(r.root, 'game', 'kit');
    put(path.join(g, 'kit.mjs'), fs.readFileSync(path.join(r.root, 'kit.mjs'), 'utf8'));
    fs.copyFileSync(path.join(r.root, 'docs', 'CATALOG.md'), path.join(g, 'CATALOG.md'));
    fs.cpSync(path.join(r.root, 'docs', 'recipes'), path.join(g, 'recipes'), { recursive: true });
    for (const q of ['zorking', 'quux']) expect(node(path.join(g, 'kit.mjs'), 'search', q).status).toBe(0);
    const log = fs.readFileSync(logFile, 'utf8');
    expect(log).toMatch(/\d{4}-\d\d-\d\d quux\n$/);
    expect(log).not.toContain('zorking');
  });
  it('list prints one clean line per component: id, title, use', () => {
    expect(fake().kit('list').stdout).toBe('alpha: Alpha things. Use: You need Alpha things.\nplan-checker: Zplan things. Use: You need Zplan things.\ntool: Tool things. Use: You need Tool things.\n');
  });
  it('a search inside a game layout (kit.mjs, CATALOG.md, recipes/ side by side) finds a mechanics line', () => {
    const g = path.join(tmp, 'game', 'kit');
    put(path.join(g, 'kit.mjs'), fs.readFileSync(path.join(ROOT, 'kit.mjs'), 'utf8'));
    fs.copyFileSync(path.join(ROOT, 'docs', 'CATALOG.md'), path.join(g, 'CATALOG.md'));
    fs.cpSync(path.join(ROOT, 'docs', 'recipes'), path.join(g, 'recipes'), { recursive: true });
    const o = spawnSync('node', [path.join(g, 'kit.mjs'), 'search', 'pay', 'cost'], { cwd: path.dirname(g), encoding: 'utf8', env });
    expect(o.status).toBe(0);
    expect(o.stdout.split('\n')[0]).toMatch(/^mechanic: pay a cost, .* -> `card-language`: read pack\.md/);
  });
});

describe('K524 gate (scripts/mechanics-check.mjs)', () => {
  it('passes the fake kit: a pending line whose row is open, a named candidate, a component with mechanics: none', () => {
    const g = fake().gate();
    expect(g.stderr).toBe('');
    expect(g.status).toBe(0);
    expect(g.stdout).toBe('mechanics ok: 3 lines, 1 searches\n');
  });
  it('a component no line names fails with its name and exit 1', () => {
    const g = fake((f) => { delete f.notes['tool']!.mechanics; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toMatch(/^tool: no line of docs\/mechanics\.json names this component/);
    expect(fake((f) => { f.notes['tool']!.mechanics = 'none: '; }).gate().status).toBe(1);
  });
  it('a candidate row no line names fails, unless its row file says mechanics: none', () => {
    const g = fake((f) => { f.lines.pop(); }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toMatch(/^K901: no line of docs\/mechanics\.json names this candidate row/);
    expect(fake((f) => { f.lines.pop(); f.rows['K901'] = 'candidate\nmechanics: none: tooling'; }).gate().status).toBe(0);
  });
  it('a pending line fails once its row is done and the part is still missing; a missing part with no pending fails', () => {
    const g = fake((f) => { f.rows['K900'] = 'done'; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('"flarn": row K900 is done and ghost is still not a component');
    const h = fake((f) => { delete f.lines[1]!.pending; }).gate();
    expect(h.status).toBe(1);
    expect(h.stderr).toContain('"flarn": ghost is not a component');
  });
  it('a pending line fails once its row is done, also when the part exists', () => {
    const open = fake((f) => { f.lines[0]!.pending = 'K900'; }).gate();
    expect(open.status).toBe(0);
    const g = fake((f) => { f.lines[0]!.pending = 'K902'; f.rows['K902'] = 'done'; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('"zorking, zork a blip": row K902 is done: drop pending and name what it built');
  });
  it('a backticked name in read must be an exported name of the part, a member of an exported type, or a file of it', () => {
    const typed = fake((f) => { f.lines[0]!.read = '`Shape` (`wide`, `tall`), `grow`, `outer`, `py_name`'; });
    put(path.join(typed.root, 'components', 'alpha', 'shape.ts'), "// narrow\nexport type Shape = { readonly wide?: number; readonly kind: 'tall' | 'flat' };\nexport function grow(shape: Shape) { const inner = shape; return inner; }\nconst hidden = 1\nexport { hidden as outer }\n");
    put(path.join(typed.root, 'components', 'alpha', 'helper.py'), 'def py_name():\n    pass\n');
    const tg = typed.gate();
    expect(tg.stderr).toBe('');
    expect(tg.status).toBe(0);
    // K585: a name in prose, a test file, a comment, a function's inside or a const's keys is not a name of the part
    const not: [string, string, string][] = [
      ['part', 'README.md', '# alpha\n\nThe alpha part.\n'],
      ['helperOnly', 'alpha.test.ts', 'export const helperOnly = 1\n'],
      ['specOnly', 'alpha.spec.ts', 'export const specOnly = 1\n'],
      ['py_test', 'test_alpha.py', 'def py_test():\n    pass\n'],
      ['narrow', 'shape.ts', '/*\nexport const narrow = 1\n*/\nexport const wide = 1\n'],
      ['gone', 'shape.ts', 'export type Shape = {\n  // gone: number\n  wide: number }\n'],
      ['inner', 'shape.ts', 'export function grow(inner: number) { return inner }\n'],
      ['innerKey', 'shape.ts', 'export const table = { innerKey: 1 }\n'],
      ['hidden', 'shape.ts', 'const hidden = 1\nexport { hidden as outer }\n'],
      ['alp', 'index.ts', 'export const alpha = 1\n'],
    ];
    for (const [name, file, text] of not) {
      const r = fake((f) => { f.lines[0]!.read = 'guide.md, `' + name + '`'; });
      put(path.join(r.root, 'components', 'alpha', file), text);
      const g = r.gate();
      expect(g.status, name).toBe(1);
      expect(g.stderr).toContain('"zorking, zork a blip": `' + name + '` is not in components/alpha/');
    }
    expect(fake((f) => { f.lines[0]!.read = 'guide.md, `alpha`, `guide`, `index.ts`'; }).gate().status).toBe(0);
    const g = fake((f) => { f.lines[0]!.read = 'guide.md, `alpha`, `nopeName(x)`'; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('"zorking, zork a blip": `nopeName` is not in components/alpha/');
  });
  it('a guide that is not in the part folder fails', () => {
    const g = fake((f) => { f.lines[0]!.read = 'absent.md'; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('absent.md is not in components/alpha/');
  });
  it('a listed search whose first line is not a mechanic line naming the expected part fails', () => {
    const g = fake((f) => { f.searches = { zorking: 'tool', blorp: 'alpha' }; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('search "zorking": the first line must be a mechanic: line naming `tool`');
    expect(g.stderr).toContain('search "blorp": the first line must be a mechanic: line naming `alpha`; got: Inner blorp');
  });
  it('the 20 planner searches, the 4 K574 ones and the 5 K585 ones pass on the repository, each naming its part', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'mechanics.json'), 'utf8')) as { searches: Record<string, string> };
    expect(Object.keys(m.searches)).toEqual(['undo button', 'line of sight', 'wall', 'heavy queue', 'modifier', 'why disabled', 'objective', 'encounter', 'adjacent', 'resource pool', 'pay cost', 'duration', 'trigger', 'status', 'legal moves', 'distance', 'health', 'continuous effect', 'prevent damage', 'replacement', 'preview', 'scenario', 'dice odds', 'reroll', 'stat breakdown', 'cost reduction', 'dry run', 'can resolve', 'unpayable cost']);
    const g = node(path.join(ROOT, 'scripts', 'mechanics-check.mjs'));
    expect(g.stderr).toBe('');
    expect(g.status).toBe(0);
    for (const q of ['modifier', 'adjacent', 'pay cost']) expect(node(path.join(ROOT, 'kit.mjs'), 'search', ...q.split(' ')).stdout).toMatch(/^mechanic: /);
    for (const q of ['stat breakdown', 'cost reduction']) expect(node(path.join(ROOT, 'kit.mjs'), 'search', ...q.split(' ')).stdout.split('\n')[0]).toMatch(/^mechanic: .* -> `engine-core`: read numbers\.md, `numberParts`/);
    for (const q of ['dry run', 'can resolve', 'unpayable cost']) expect(node(path.join(ROOT, 'kit.mjs'), 'search', ...q.split(' ')).stdout.split('\n')[0]).toMatch(/^mechanic: may this effect be offered, .* -> `card-language`: read its README "Offer policy"/);
  });
});

describe('K584 every line names a question of the game sheet', () => {
  it('a line with no sheet key fails the gate with its words and exit 1', () => {
    const g = fake((f) => { delete f.lines[2]!.sheet; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('"quux": no sheet key (name one of: player, run-out, clocks, ');
  });
  it('a sheet key that is no question fails the gate', () => {
    const g = fake((f) => { f.lines[0]!.sheet = 'Dice'; }).gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('"zorking, zork a blip": sheet "Dice" is no question of the game sheet');
  });
  it('the page groups the lines under their questions, in the order of the sheet; search still reads every line', () => {
    const r = fake((f) => { f.lines[0]!.sheet = 'markets'; f.lines[2]!.sheet = 'player'; });
    const page = fs.readFileSync(path.join(r.root, 'docs', 'recipes', 'mechanics.md'), 'utf8');
    expect(page.split('\n').filter((l) => l.startsWith('## ') || /^\| [a-z]/.test(l))).toEqual(['## Who the player controls', '| quux | not in the kit (candidate K901) |', '## Dice', '| flarn | `ghost` (pending: K900) |', '## Markets and rows', '| zorking, zork a blip | `alpha`: read guide.md |']);
    expect(r.catalog().status).toBe(0);
    expect(r.kit('search', 'zorking').stdout).toMatch(/^mechanic: zorking/);
    expect(r.kit('search', 'quux').stdout).toBe('mechanic: quux -> not in the kit (candidate K901)\n');
  });
  it('the repository: 22 questions written once in plancheck.py, every line of the map under one of them', () => {
    const qs = JSON.parse(/^SHEET_QUESTIONS = (\[[\s\S]*?\]\])/m.exec(fs.readFileSync(path.join(ROOT, 'components', 'plan-checker', 'plancheck.py'), 'utf8'))![1]!) as [string, string][];
    expect(qs).toHaveLength(22);
    expect(new Set(qs.map(([k]) => k)).size).toBe(22);
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'mechanics.json'), 'utf8')) as { lines: Line[] };
    expect(m.lines.filter((l) => !qs.some(([k]) => k === l.sheet))).toEqual([]);
    const page = fs.readFileSync(path.join(ROOT, 'docs', 'recipes', 'mechanics.md'), 'utf8').split(/\r?\n/);
    expect(page.filter((l) => l.startsWith('## ')).map((l) => l.slice(3))).toEqual(qs.map(([, w]) => w));
    expect(page.filter((l) => l.startsWith('| ') && !l.startsWith('| Mechanic'))).toHaveLength(m.lines.length);
  });
});

describe('K574 a line may name a tool', () => {
  it('prints first as a tool line, is not logged as a miss, and the gate fails a tool with no README', () => {
    const r = fake((f) => { f.lines.push({ words: 'queue a heavy job', tool: 'qtool', read: 'its README', sheet: 'content' }); });
    expect(r.write.status).toBe(0);
    expect(r.kit('search', 'heavy', 'queue').stdout).toBe('mechanic: queue a heavy job -> tool `qtool` (tools/qtool): read its README\n');
    expect(fs.existsSync(path.join(tmp, '.game-kit/search-misses.log')) ? fs.readFileSync(path.join(tmp, '.game-kit/search-misses.log'), 'utf8') : '').not.toContain('heavy queue');
    const g = r.gate();
    expect(g.status).toBe(1);
    expect(g.stderr).toContain('"queue a heavy job": tools/qtool/README.md is missing');
    put(path.join(r.root, 'tools', 'qtool', 'README.md'), '# qtool\n');
    expect(r.gate().stderr).not.toContain('qtool');
  });
});
