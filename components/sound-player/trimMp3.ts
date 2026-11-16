// Cuts an MP3 by whole frames, no re-encoding. Drops the ID3v2 tag, trailing tags and the Xing/Info frame.
const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const SR = [44100, 48000, 32000];

/** Frames of an MPEG-1 layer III file as [start, length]; any other file: `[]`. */
export function mp3Frames(b: Uint8Array): [number, number][] {
  let p = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) p = 10 + (((b[6] ?? 0) & 127) << 21) + (((b[7] ?? 0) & 127) << 14) + (((b[8] ?? 0) & 127) << 7) + ((b[9] ?? 0) & 127);
  const out: [number, number][] = [];
  while (p + 4 <= b.length) {
    const h = ((b[p] ?? 0) << 24) | ((b[p + 1] ?? 0) << 16) | ((b[p + 2] ?? 0) << 8) | (b[p + 3] ?? 0);
    const br = BR[(h >>> 12) & 15];
    const sr = SR[(h >>> 10) & 3];
    if (h >>> 21 !== 0x7ff || ((h >>> 19) & 3) !== 3 || ((h >>> 17) & 3) !== 1 || !br || !sr) break;
    const len = Math.floor((144 * br * 1000) / sr) + ((h >>> 9) & 1);
    if (p + len > b.length) break;
    out.push([p, len]);
    p += len;
  }
  return out;
}

/** Keeps the audio frames from `front` to the end minus `back`; the Xing/Info frame and tags go. */
export function trimMp3(b: Uint8Array, front = 0, back = 0): Uint8Array {
  let f = mp3Frames(b);
  const first = f[0];
  if (first) {
    const t = String.fromCharCode(...b.slice(first[0] + 4, first[0] + 44));
    if (t.includes('Xing') || t.includes('Info')) f = f.slice(1);
  }
  f = f.slice(front, Math.max(front, f.length - back));
  const out = new Uint8Array(f.reduce((n, s) => n + s[1], 0));
  let o = 0;
  for (const [s, n] of f) {
    out.set(b.subarray(s, s + n), o);
    o += n;
  }
  return out;
}
