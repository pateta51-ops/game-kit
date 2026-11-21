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
  it('forty-four plain queries find the expected top hit', () => {
    expect(top).toHaveLength(44);
    const bad = top.filter(([q, want]) => !first(q).startsWith(want) || run('search', ...q.split(' ')).stdout.includes('not in the kit')).map(([q]) => q + ' -> ' + first(q).slice(0, 40));
    expect(bad).toEqual([]);
  });

  it('an effect hit prints the effect line with its words, not the component sentence', () => {
    expect(first('burn')).toMatch(/^burn-away (was dissolve): Heats up.*\. Use: .* Words: burn, /);
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
      expect(kit('search', 'burn').stdout).toMatch(/^burn-away (was dissolve):/);
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
