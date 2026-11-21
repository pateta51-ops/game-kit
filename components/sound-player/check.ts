// Node only (reads the disk): import it from a game's check script, never from the app.
import fs from 'node:fs';
import path from 'node:path';
import type { SoundTable } from './player.ts';

export interface SoundCheckOptions {
  /** Names with no file yet: a cue name, `layer:<name>`, `once:<name>` or `ambience:<name>`. */
  missing?: readonly string[];
  formats?: readonly string[];
  maxCueBytes?: number;
  maxLoopBytes?: number;
  /** Limit for a cue on the music bus (a whole track): default `maxLoopBytes`, else 4 MB. */
  maxTrackBytes?: number;
  /** Extension to sibling extension (as the player's `fallback`): every file with a key must have its sibling in `dir`. Default: not checked. */
  fallback?: Readonly<Record<string, string>>;
}

/** Lines of problems (none: all good). `dir` is the folder the table's file paths start from. */
export function checkSoundFiles(table: SoundTable, dir: string, o: SoundCheckOptions = {}): string[] {
  const formats = o.formats ?? ['.ogg', '.opus', '.webm', '.mp3', '.m4a'];
  const missing = new Set(o.missing ?? []);
  const bad: string[] = [];
  const rows: { name: string; files: readonly string[]; max: number }[] = [
    ...Object.entries(table.cues).filter(([, c]) => c.files.length > 0 || !c.synth?.length).map(([k, c]) => ({ name: k, files: c.files, max: c.bus === 'music' ? (o.maxTrackBytes ?? o.maxLoopBytes ?? 4_000_000) : (o.maxCueBytes ?? 400_000) })),
    ...Object.entries(table.music?.layers ?? {}).map(([k, f]) => ({ name: `layer:${k}`, files: [f], max: o.maxLoopBytes ?? 4_000_000 })),
    ...Object.entries(table.music?.once ?? {}).map(([k, f]) => ({ name: `once:${k}`, files: [f], max: o.maxLoopBytes ?? 4_000_000 })),
    ...Object.entries(table.ambience ?? {}).map(([k, f]) => ({ name: `ambience:${k}`, files: [f], max: o.maxLoopBytes ?? 4_000_000 })),
  ];
  for (const r of rows) {
    const there = r.files.filter((f) => f !== '' && fs.existsSync(path.join(dir, f)));
    const whole = r.files.length > 0 && there.length === r.files.length;
    if (!whole && !missing.has(r.name))
      bad.push(r.files.length === 0 ? `${r.name}: no file, and not listed as missing` : `${r.name}: file not found: ${r.files.filter((f) => !there.includes(f)).join(', ')}`);
    if (whole && missing.has(r.name)) bad.push(`${r.name}: listed as missing, but its files are there`);
    for (const f of there) {
      if (!formats.includes(path.extname(f).toLowerCase())) bad.push(`${r.name}: ${f} is not one of ${formats.join(' ')}`);
      const alt = o.fallback?.[path.extname(f).toLowerCase()];
      if (alt !== undefined && !fs.existsSync(path.join(dir, f.slice(0, f.length - path.extname(f).length) + alt))) bad.push(`${r.name}: ${f} has no ${alt} sibling`);
      const size = fs.statSync(path.join(dir, f)).size;
      if (size > r.max) bad.push(`${r.name}: ${f} is ${String(size)} bytes, over ${String(r.max)}`);
      if (size === 0) bad.push(`${r.name}: ${f} is empty`);
    }
  }
  for (const k of missing) if (!rows.some((r) => r.name === k)) bad.push(`${k}: listed as missing, but not in the table`);
  for (const [s, gains] of Object.entries(table.music?.states ?? {}))
    for (const k of Object.keys(gains)) if (table.music?.layers[k] === undefined) bad.push(`state ${s}: layer ${k} is not in the table`);
  return bad;
}

export interface Pcm {
  samples: Float32Array;
  rate: number;
}

/** Reads a PCM wav (8, 16, 24, 32 bit or float, first channel); null: not one. Other formats need a game's own `decode`. */
export function decodeWav(b: Buffer): Pcm | null {
  if (b.length < 44 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') return null;
  let fmt = { tag: 0, ch: 0, rate: 0, bits: 0 };
  for (let p = 12; p + 8 <= b.length; ) {
    const id = b.toString('latin1', p, p + 4);
    const n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'fmt ' && fmt.tag === 0xfffe && n >= 26) fmt.tag = b.readUInt16LE(p + 32);
    if (id === 'data') {
      if (!fmt.ch || !fmt.rate || !fmt.bits) return null;
      const w = fmt.bits / 8;
      const out = new Float32Array(Math.floor(Math.min(n, b.length - p - 8) / (w * fmt.ch)));
      for (let i = 0; i < out.length; i++) {
        const o = p + 8 + i * w * fmt.ch;
        out[i] = fmt.tag === 3 ? b.readFloatLE(o) : fmt.bits === 8 ? (b.readUInt8(o) - 128) / 128 : fmt.bits === 16 ? b.readInt16LE(o) / 32768 : fmt.bits === 24 ? b.readIntLE(o, 3) / 8388608 : b.readInt32LE(o) / 2147483648;
      }
      return { samples: out, rate: fmt.rate };
    }
    p += 8 + n + (n % 2);
  }
  return null;
}

/** Cue files whose sound starts later than `maxMs` (60) after the file's start: a sound that waits lands late on the action. Files `decode` cannot read (default: wav only) are not checked. */
export function checkFrontSilence(table: SoundTable, dir: string, o: { maxMs?: number; threshold?: number; decode?: (file: string, bytes: Buffer) => Pcm | null } = {}): string[] {
  const bad: string[] = [];
  for (const [name, c] of Object.entries(table.cues))
    for (const f of c.files) {
      const full = path.join(dir, f);
      if (!fs.existsSync(full)) continue;
      const bytes = fs.readFileSync(full);
      const pcm = o.decode ? o.decode(f, bytes) : decodeWav(bytes);
      if (!pcm) continue;
      const i = pcm.samples.findIndex((s) => Math.abs(s) > (o.threshold ?? 0.02));
      const ms = ((i < 0 ? pcm.samples.length : i) / pcm.rate) * 1000;
      if (ms > (o.maxMs ?? 60)) bad.push(`${name}: ${f} is silent for ${String(Math.round(ms))} ms at the start, over ${String(o.maxMs ?? 60)}`);
    }
  return bad;
}
