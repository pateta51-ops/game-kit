import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
let tmp: string;
let src: string;
let n = 0;
const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const put = (f: string, s: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
};
// a game with motion-frame and sound-player pulled (their real component.json), and the given src/ files
const check = (files: Record<string, string>) => {
  const g = path.join(tmp, 'game' + String(++n));
  fs.mkdirSync(g);
  expect(spawnSync('node', [path.join(src, 'kit.mjs'), 'pull', src, 'b1', 'motion-frame', 'sound-player'], { cwd: g, encoding: 'utf8' }).status).toBe(0);
  for (const [f, s] of Object.entries(files)) put(path.join(g, f), s);
  return spawnSync('node', [path.join(g, 'kit/kit.mjs'), 'check'], { cwd: g, encoding: 'utf8' });
};
const MF = "import { createMotionPlayer } from '../kit/motion-frame/index.ts';\n";
const SP = "import type { SoundPlayer } from '../kit/sound-player/index.ts';\n";
const BYPASS =
  MF +
  SP +
  'export function playTurn(sound: SoundPlayer, beats: { name: string; maxMs: number; cues: string[] }[], queue: string[], speed: number) {\n' +
  '  let at = 0;\n' +
  '  beats.sort((a, b) => a.name.localeCompare(b.name));\n' +
  '  queue.splice(0, 0, "last");\n' +
  '  for (const b of beats) {\n' +
  '    setTimeout(() => sound.play(b.cues[0]), at);\n' +
  '    at += b.maxMs * speed;\n' +
  '  }\n' +
  '}\n';
const PING = MF + "export const ping = (sound: { play: (c: string) => void }) => setTimeout(() => sound.play('ping'), 50);";

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-k675-'));
  src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  git(src, 'init', '-q');
  git(src, 'config', 'core.autocrlf', 'false');
  fs.copyFileSync(path.join(ROOT, 'kit.mjs'), path.join(src, 'kit.mjs'));
  for (const c of ['motion-frame', 'sound-player']) put(path.join(src, 'components', c, 'component.json'), fs.readFileSync(path.join(ROOT, 'components', c, 'component.json'), 'utf8'));
  git(src, 'add', '-A');
  git(src, 'commit', '-qm', 'b1');
  git(src, 'tag', '-a', 'b1', '-m', 'b1');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('K675: kit check fails a game that goes around a kit part', () => {
  it('K675: sound on a timer, a maxMs sum and reordered beats fail with their ids and hooks', () => {
    const c = check({ 'src/turn.ts': BYPASS });
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('src/turn.ts:5 beats-reordered (motion-frame): beat order comes only from the motion player queue: play beats in event order, with parallel: true to overlap and holdUntil to wait');
    expect(c.stderr).toContain('src/turn.ts:6 beats-reordered (motion-frame)');
    expect(c.stderr).toContain('src/turn.ts:8 sound-on-timer (sound-player): with motion-frame, a sound cue plays only from createMotionPlayer onCue / onDroppedCue, never from a timer');
    expect(c.stderr).toContain('src/turn.ts:9 cue-time-from-maxms (motion-frame): a sum of maxMs is not when a beat plays: play sounds from createMotionPlayer onCue / onDroppedCue');
    expect(c.stderr.split('\n').filter((l) => /^src\/\S+:\d+ /.test(l))).toHaveLength(4);
  });

  it('K675: cue times from a maxMs sum and sorted cue rows fail where only sound-player is imported', () => {
    const c = check({
      'src/tally.ts':
        SP +
        'export function cuesOf(specs: { maxMs: number; sound?: { t: number; cue: string }[] }[], player: SoundPlayer) {\n' +
        '  let queue = 0;\n' +
        '  for (const s of specs) {\n' +
        '    for (const r of [...(s.sound ?? [])].sort((a, b) => a.t - b.t)) player.play(r.cue, { delayMs: queue + r.t });\n' +
        '    queue += s.maxMs;\n' +
        '  }\n' +
        '}\n',
    });
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('src/tally.ts:5 beats-reordered');
    expect(c.stderr).toContain('src/tally.ts:6 cue-time-from-maxms');
    expect(c.stderr).not.toContain('sound-on-timer');
  });

  it('K675: onCue, parallel and timers that play no sound pass', () => {
    const c = check({
      'src/wire.ts':
        MF +
        SP +
        'export function wire(sound: SoundPlayer, hand: { cost: number }[], setHint: (s: string) => void) {\n' +
        '  const motion = createMotionPlayer({ specs: {}, stages: {}, verbs: [], speed: () => 1, onCue: (cue) => sound.play(cue), onDroppedCue: (cue) => sound.play(cue) } as never);\n' +
        "  motion.play({ id: 'tally', parallel: true, maxMs: 400, steps: [] } as never);\n" +
        '  hand.sort((a, b) => a.cost - b.cost);\n' +
        "  setTimeout(() => setHint(''), 500);\n" +
        '  return motion;\n' +
        '}\n',
    });
    expect(c.stderr).toBe('');
    expect(c.status).toBe(0);
    expect(c.stdout).toContain('kit ok at b1');
  });

  it('K675: a file that does not import motion-frame may play sound from a timer', () => {
    const c = check({ 'src/later.ts': SP + "export const later = (sound: SoundPlayer) => setTimeout(() => sound.play('chime'), 300);\n" });
    expect(c.stderr).toBe('');
    expect(c.status).toBe(0);
  });

  it('K675: an allow comment with a reason passes, one without a reason fails', () => {
    const ok = check({ 'src/ping.ts': PING + ' // kit-allow sound-on-timer: menu ping, no beat on screen\n', 'src/above.ts': MF + '// kit-allow sound-on-timer: menu ping\n' + PING.slice(MF.length) + '\n' });
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    const bad = check({ 'src/ping.ts': PING + ' // kit-allow sound-on-timer\n' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('src/ping.ts:2 sound-on-timer (sound-player): kit-allow sound-on-timer needs a reason');
    const other = check({ 'src/ping.ts': PING + ' // kit-allow beats-reordered: wrong id\n' });
    expect(other.status).toBe(1);
    expect(other.stderr).toContain('src/ping.ts:2 sound-on-timer (sound-player): with motion-frame');
  });

  it('K675: tests and folders outside src/ are not scanned', () => {
    const c = check({ 'src/turn.test.ts': BYPASS, 'src/tests/turn.ts': BYPASS, 'scripts/turn.ts': BYPASS });
    expect(c.stderr).toBe('');
    expect(c.status).toBe(0);
  });
});
