// K505: shooting the same demo twice gives the same picture (fake clock, paused animations).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const only = 'move,glow--latch,warp-transfer--mode-zip,dissolve,shatter,crumple';
const shoot = (): string => {
  const out = mkdtempSync(join(tmpdir(), 'strips-'));
  execFileSync('node', ['gallery/build.mjs', '--strips', `--only=${only}`, `--out=${out}`], { stdio: 'pipe' });
  return out;
};
it('K505 the same demo shot twice is byte-identical', () => {
  const a = shoot(), b = shoot();
  expect(only.split(',').filter((n) => !readFileSync(join(a, `${n}.png`)).equals(readFileSync(join(b, `${n}.png`))))).toEqual([]);
}, 480000);
