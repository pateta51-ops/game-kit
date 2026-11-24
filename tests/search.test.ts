import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// K500: kit.mjs search reads titles, tags, looks, use and effect words; the top hit is what a director expects.
const ROOT = path.resolve(import.meta.dirname, '..');
const KIT = path.join(ROOT, 'kit.mjs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'k500h-'));
const env = { ...process.env, HOME: home, USERPROFILE: home };
const run = (...a: string[]) => spawnSync('node', [KIT, ...a], { cwd: ROOT, encoding: 'utf8', env });
const first = (q: string) => run('search', ...q.split(' ')).stdout.split('\n')[0] ?? '';

const top: [string, string][] = [
  ['burn', 'burn-away (was dissolve):'],
  ['undo button', 'mechanic: undo'],
  ['sparkle shine', 'light-sweep (was sheen):'],
  ['heavy queue', 'mechanic: heavy queue'],
  ['burning', 'burn-away (was dissolve):'],
  ['question box', 'Question box (`prompt-host`)'],
  ['count up', 'countUp:'],
  ['light sweeps across the card', 'light-sweep (was sheen):'],
  ['teleport', 'light-teleport (was warp-transfer):'],
  ['sparkle', 'particles-rise (was motes):'],
  ['explosion', 'ring-pulse:'],
  ['motes', 'particles-rise (was motes):'],
  ['warp-transfer', 'light-teleport (was warp-transfer):'],
  ['flip card', 'flip:'],
  ['screen shake', 'shakeAt:'],
  ['glow', 'glow:'],
  ['fade in', 'fade-in:'],
  ['fade out', 'fade-out:'],
  ['banner', 'banner:'],
  ['shatter', 'shatter:'],
  ['shield', 'shield-bubble:'],
  ['ring pulse', 'ring-pulse:'],
  ['slash', 'slash:'],
  ['stamp', 'stamp:'],
  ['progress bar', 'bar-fill:'],
  ['meter', 'bar-fill:'],
  ['spin', 'spin:'],
  ['glitch', 'createGlitch:'],
  ['camera', 'cameraPull:'],
  ['smoke', 'burn-away (was dissolve):'],
  ['trail', 'trail:'],
  ['laser beam', 'projectile:'],
  ['rays', 'streak-burst (was radial-streaks):'],
  ['speed', 'Game speed limits (`perf`)'],
  ['speeds', 'Game speed limits (`perf`)'],
  ['shakes', 'shake:'],
  ['sparkles', 'particles-rise (was motes):'],
  ['hand of cards', 'Fan of cards in hand (`card-hand`)'],
  ['card pile', 'Draw pile, discard pile and fan view (`card-pile`)'],
  ['settings', 'Settings store and screen (`settings`)'],
  ['tutorial', 'Scripted tutorial on a fixed game (`tutorial`)'],
  ['phone', 'Phone screen layout (`phone-mode`)'],
  ['zoom card', 'Big card view with full text (`card-zoom`)'],
  ['bug report', 'In-game bug report with screenshot (`bug-reporter`)'],
  ['drag drop', 'Drag a card onto a target (`drag-drop`)'],
  ['achievements', 'Unlockable feats from finished games (`achievements`)'],
  ['tooltip', 'Glossary links in game text (`glossary`)'],
];

describe('K500 search', () => {
  it('forty-seven plain queries find the expected top hit', () => {
    expect(top).toHaveLength(47);
    const bad = top.filter(([q, want]) => !first(q).startsWith(want) || run('search', ...q.split(' ')).stdout.includes('not in the kit')).map(([q]) => q + ' -> ' + first(q).slice(0, 40));
    expect(bad).toEqual([]);
  });

  it('an effect hit prints the effect line with its words, not the component sentence', () => {
    expect(first('burn')).toMatch(/^burn-away \(was dissolve\): Heats up.*\. Use: .* Words: burn, /);
    expect(run('search', 'burn').stdout).not.toContain('effect-library');
  });

  it('arise does not match rise', () => {
    expect(run('search', 'arise').stdout).toContain('not in the kit by that name');
  });

  it('every query word must match inside one entry', () => {
    expect(run('search', 'burn', 'quarterback').stdout).toContain('not in the kit by that name');
  });

  it('effects lists only effects, filtered by words', () => {
    const o = run('effects', 'burn');
    expect(o.status).toBe(0);
    expect(o.stdout.split('\n').filter(Boolean).every((l) => l.includes(' Use: ') && l.includes(' Words: '))).toBe(true);
    expect(o.stdout).toContain('burn-away (was dissolve):');
    expect(o.stdout).not.toContain('`');
    expect(run('effects').stdout.split('\n').filter(Boolean).length).toBeGreaterThan(80);
  });

  it('a miss prints three nearest and logs in the home folder', () => {
    const g = fs.mkdtempSync(path.join(os.tmpdir(), 'k500-'));
    try {
      fs.mkdirSync(path.join(g, 'kit/effect-library'), { recursive: true });
      fs.copyFileSync(KIT, path.join(g, 'kit/kit.mjs'));
      fs.copyFileSync(path.join(ROOT, 'docs/CATALOG.md'), path.join(g, 'kit/CATALOG.md'));
      fs.copyFileSync(path.join(ROOT, 'components/effect-library/catalog.json'), path.join(g, 'kit/effect-library/catalog.json'));
      fs.writeFileSync(path.join(g, 'kit/kit.lock.json'), '{}');
      const kit = (...a: string[]) => spawnSync('node', [path.join(g, 'kit/kit.mjs'), ...a], { cwd: g, encoding: 'utf8', env });
      expect(kit('search', 'burn').stdout).toMatch(/^burn-away \(was dissolve\):/);
      const m = kit('search', 'burn', 'zebra');
      expect(m.status).toBe(0);
      expect(m.stdout).toContain('not in the kit by that name');
      expect(m.stdout.split('\n').filter(Boolean)).toHaveLength(4);
      expect(fs.readFileSync(path.join(home, '.game-kit/search-misses.log'), 'utf8')).toMatch(/\d{4}-\d\d-\d\d burn zebra\n$/);
      expect(fs.existsSync(path.join(g, '.kit-search-misses.log'))).toBe(false);
      expect(kit('search', '--misses', '1').stdout).toMatch(/burn zebra/);
    } finally { fs.rmSync(g, { recursive: true, force: true }); }
  });
});

describe('K685 hooks and the kit-internal miss log', () => {
  it('a hook match ranks its component first and prints the hook line under it', () => {
    const r = run('search', 'hold', 'with', 'fallback');
    expect(r.status).toBe(0);
    const L = r.stdout.split('\n');
    expect(L[0]).toMatch(/^Motion player \(`motion-frame`\)/);
    expect(L[1]).toBe('  hook: holdUntil + autoContinueMs: hold a beat until a condition, with a timed fallback');
    expect(run('search', 'motion', 'player').stdout).not.toContain('  hook: ');
  });
  it('a miss in the kit repository itself (components/ beside kit.mjs) is not logged; in a game it is', () => {
    const g = fs.mkdtempSync(path.join(os.tmpdir(), 'k685-'));
    const h = fs.mkdtempSync(path.join(os.tmpdir(), 'k685h-'));
    try {
      fs.copyFileSync(KIT, path.join(g, 'kit.mjs'));
      fs.copyFileSync(path.join(ROOT, 'docs/CATALOG.md'), path.join(g, 'CATALOG.md'));
      const log = path.join(h, '.game-kit/search-misses.log');
      const miss = () => spawnSync('node', [path.join(g, 'kit.mjs'), 'search', 'burn', 'zebra'], { cwd: g, encoding: 'utf8', env: { ...process.env, HOME: h, USERPROFILE: h } });
      fs.mkdirSync(path.join(g, 'components'));
      let r = miss();
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('not in the kit by that name');
      expect(fs.existsSync(log)).toBe(false);
      fs.rmdirSync(path.join(g, 'components'));
      r = miss();
      expect(r.status).toBe(0);
      expect(fs.readFileSync(log, 'utf8')).toMatch(/\d{4}-\d\d-\d\d burn zebra\n$/);
    } finally { fs.rmSync(g, { recursive: true, force: true }); fs.rmSync(h, { recursive: true, force: true }); }
  });
});

describe('K673 search --check', () => {
  it('passes the cases that hold, fails with exit 1 naming each miss', () => {
    const g = fs.mkdtempSync(path.join(os.tmpdir(), 'k673-'));
    try {
      fs.mkdirSync(path.join(g, 'effect-library'));
      fs.copyFileSync(KIT, path.join(g, 'kit.mjs'));
      fs.copyFileSync(path.join(ROOT, 'docs/CATALOG.md'), path.join(g, 'CATALOG.md'));
      fs.copyFileSync(path.join(ROOT, 'components/effect-library/catalog.json'), path.join(g, 'effect-library/catalog.json'));
      const check = () => spawnSync('node', [path.join(g, 'kit.mjs'), 'search', '--check'], { encoding: 'utf8', env });
      expect(check().status).toBe(2);
      const cases = (c: object[]) => fs.writeFileSync(path.join(g, 'search-cases.json'), JSON.stringify(c));
      cases([{ q: 'burn', first: 'burn-away' }, { q: 'hand of cards', first: 'card-hand' }, { q: 'burn quarterback', first: 'none' }]);
      let r = check();
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('search cases ok: 3\n');
      cases([{ q: 'burn', first: 'card-hand' }, { q: 'hand of cards', first: 'none' }, { q: 'burn quarterback', first: 'burn-away' }, { q: 'burn', first: 'burn-away' }]);
      r = check();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('search "burn": want card-hand on the first line');
      expect(r.stderr).toContain('search "hand of cards": want nothing');
      expect(r.stderr).toContain('search "burn quarterback": want burn-away');
      expect(r.stderr).toContain('3 of 4 search cases failed');    } finally { fs.rmSync(g, { recursive: true, force: true }); }
  });
});

describe('K523 candidates', () => {
  const lines = (q: string) => run('search', ...q.split(' ')).stdout.split('\n');
  it('finds a candidate row by its content line and tags, first for discard row', () => {
    expect(lines('discard row')[0]).toMatch(/^candidate K520, wanted by Hunted North Pole, Hunted Mining Colony, Dungeon Ball Legend: discard-row/);
    expect(lines('test pilot bot random greedy')[0]).toMatch(/^candidate K424, wanted by Astra Imperium, Crystallo, Dungeon Ball Legend, Dice Commandos: /);
    expect(lines('chamfered keys')[0]).toMatch(/^candidate K423, /);
    expect(lines('test pilot bot random greedy')).toContain('not built yet');
    expect(lines('test pilot bot random greedy').join('\n')).not.toContain('not in the kit by that name');
  });
  it('a second game in wanted-by changes the line; no second row', () => {
    const g = fs.mkdtempSync(path.join(os.tmpdir(), 'k523-'));
    try {
      fs.mkdirSync(path.join(g, 'recipes'));
      fs.copyFileSync(KIT, path.join(g, 'kit.mjs'));
      fs.copyFileSync(path.join(ROOT, 'docs/CATALOG.md'), path.join(g, 'CATALOG.md'));
      const page = (w: string) => '| Id | Content | Wanted by | Tags |\n|---|---|---|---|\n| K900 | zork-row: a row of zorks | ' + w + ' | zork, row |\n';
      const out = () => spawnSync('node', [path.join(g, 'kit.mjs'), 'search', 'zork'], { encoding: 'utf8', env }).stdout;
      fs.writeFileSync(path.join(g, 'recipes/candidates.md'), page('A'));
      expect(out().split('\n')[0]).toBe('candidate K900, wanted by A: zork-row: a row of zorks');
      fs.writeFileSync(path.join(g, 'recipes/candidates.md'), page('A, B'));
      expect(out().split('\n')[0]).toBe('candidate K900, wanted by A, B: zork-row: a row of zorks');
      expect(out().split('\n').filter((l) => l.startsWith('candidate'))).toHaveLength(1);
    } finally { fs.rmSync(g, { recursive: true, force: true }); }
  });
});
