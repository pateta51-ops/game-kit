// Node only (reads the disk): import it from a game's check script, never from the app.
import fs from 'node:fs';
import path from 'node:path';
import type { SoundTable } from './player';

export interface SoundCheckOptions {
  /** Names with no file yet: a cue name, `layer:<name>`, `once:<name>` or `ambience:<name>`. */
  missing?: readonly string[];
  formats?: readonly string[];
  maxCueBytes?: number;
  maxLoopBytes?: number;
}

/** Lines of problems (none: all good). `dir` is the folder the table's file paths start from. */
export function checkSoundFiles(table: SoundTable, dir: string, o: SoundCheckOptions = {}): string[] {
  const formats = o.formats ?? ['.ogg', '.opus', '.webm', '.mp3', '.m4a'];
  const missing = new Set(o.missing ?? []);
  const bad: string[] = [];
  const rows: { name: string; files: readonly string[]; max: number }[] = [
    ...Object.entries(table.cues).filter(([, c]) => c.files.length > 0 || !c.synth?.length).map(([k, c]) => ({ name: k, files: c.files, max: o.maxCueBytes ?? 400_000 })),
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
