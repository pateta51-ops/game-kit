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

type Line = { words: string; part?: string; read?: string; pending?: string; row?: string };
type Fake = { notes: Record<string, Record<string, unknown>>; lines: Line[]; searches: Record<string, string>; rows: Record<string, string> };
const entry = (title: string, more: Record<string, unknown> = {}) => ({ title, use: 'You need ' + title + '.', not: 'Anything else.', tags: ['one', 'two', 'three'], visible: false, release: 1, ...more });
let n = 0;
const fake = (edit: (f: Fake) => void = () => {}) => {
  const root = path.join(tmp, 'r' + String(n++));
  for (const f of ['catalog.mjs', 'plan.mjs', 'mechanics-check.mjs']) put(path.join(root, 'scripts', f), fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'));
  put(path.join(root, 'kit.mjs'), fs.readFileSync(path.join(ROOT, 'kit.mjs'), 'utf8'));
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
      'alpha/inner': { title: 'Inner blorp of alpha', use: 'You blorp.', tags: ['blorp', 'inner', 'deep'], guide: 'guide.md' },
    },
    lines: [
      { words: 'zorking, zork a blip', part: 'alpha', read: 'guide.md' },
      { words: 'flarn', part: 'ghost', pending: 'K900' },
      { words: 'quux', row: 'K901' },
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
    expect(fs.readFileSync(page, 'utf8')).toContain('| zorking, zork a blip | `alpha`: read guide.md |\n| flarn | `ghost` (pending: K900) |\n| quux | not in the kit (candidate K901) |\n');
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
  it('a search that hits only a "not in the kit" mechanics line is logged as a miss; a hit on a part is not', () => {
    const r = fake();
    expect(r.kit('search', 'zorking').stdout).toMatch(/^mechanic: zorking/);
    expect(r.kit('search', 'quux').stdout).toBe('mechanic: quux -> not in the kit (candidate K901)\n');
    const log = fs.readFileSync(path.join(tmp, '.game-kit', 'search-misses.log'), 'utf8');
    expect(log).toMatch(/\d{4}-\d\d-\d\d quux\n$/);
    expect(log).not.toContain('zorking');
  });
  it('list prints one clean line per component: id, title, use', () => {
    expect(fake().kit('list').stdout).toBe('alpha: Alpha things. Use: You need Alpha things.\ntool: Tool things. Use: You need Tool things.\n');
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
  it('a backticked name in read must be in the part\'s guide, README or code', () => {
    expect(fake((f) => { f.lines[0]!.read = 'guide.md, `alpha`, `The alpha part`'; }).gate().status).toBe(0);
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
  it('the 20 planner searches pass on the repository, each naming its part', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'mechanics.json'), 'utf8')) as { searches: Record<string, string> };
    expect(Object.keys(m.searches)).toEqual(['modifier', 'why disabled', 'objective', 'encounter', 'adjacent', 'resource pool', 'pay cost', 'duration', 'trigger', 'status', 'legal moves', 'distance', 'health', 'continuous effect', 'prevent damage', 'replacement', 'preview', 'scenario', 'dice odds', 'reroll']);
    const g = node(path.join(ROOT, 'scripts', 'mechanics-check.mjs'));
    expect(g.stderr).toBe('');
    expect(g.status).toBe(0);
    for (const q of ['modifier', 'adjacent', 'pay cost']) expect(node(path.join(ROOT, 'kit.mjs'), 'search', ...q.split(' ')).stdout).toMatch(/^mechanic: /);
  });
});
