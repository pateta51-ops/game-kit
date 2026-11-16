// A cue without a file: voices as data, each a gliding tone or a band-passed burst of noise.

export type SynthVoice =
  | { kind: 'tone'; wave?: OscillatorType; /** Hz at the start and (default: the same) at the end. */ from: number; to?: number; at?: number; dur: number; gain: number }
  | { kind: 'noise'; /** The centre of the band-pass filter in Hz, and its Q (default 1). */ band: number; q?: number; at?: number; dur: number; gain: number };

const SILENCE = 0.0001;
const noises = new WeakMap<object, AudioBuffer>();
function noise(ctx: AudioContext): AudioBuffer {
  let b = noises.get(ctx);
  if (b === undefined) {
    const n = Math.floor(ctx.sampleRate * 0.5);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 0x2545f491;
    for (let i = 0; i < n; i += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      d[i] = ((seed >>> 0) / 4294967296 - 0.5) * 1.8;
    }
    noises.set(ctx, b);
  }
  return b;
}

/** Seconds from the start of the first voice to the end of the last. */
export const synthLength = (voices: readonly SynthVoice[]): number => Math.max(0, ...voices.map((v) => (v.at ?? 0) + v.dur));

/** Starts one voice into `out` at `at` (context seconds). Null when it cannot be made: nothing is left connected. */
export function startSynthVoice(ctx: AudioContext, out: AudioNode, v: SynthVoice, at: number, rate = 1): AudioScheduledSourceNode | null {
  let g: GainNode | null = null;
  try {
    const t = at + (v.at ?? 0);
    const end = t + Math.max(0.01, v.dur);
    g = ctx.createGain();
    g.gain.value = SILENCE;
    g.gain.setValueAtTime(SILENCE, t);
    g.gain.linearRampToValueAtTime(v.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(SILENCE, end);
    let src: AudioScheduledSourceNode;
    if (v.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = v.wave ?? 'sine';
      osc.frequency.setValueAtTime(v.from * rate, t);
      if (v.to !== undefined && v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(v.to * rate, end);
      osc.connect(g);
      osc.start(t);
      src = osc;
    } else {
      const s = ctx.createBufferSource();
      s.buffer = noise(ctx);
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(v.band * rate, t);
      f.Q.setValueAtTime(v.q ?? 1, t);
      s.connect(f);
      f.connect(g);
      s.start(t, (Math.abs(v.band) % 97) / 400);
      src = s;
    }
    src.stop(end + 0.02);
    const stop = src.stop.bind(src);
    src.stop = (w = 0) => stop(Math.min(w, end + 0.02));
    g.connect(out);
    return src;
  } catch {
    try {
      g?.disconnect();
    } catch {
      // nothing was connected
    }
    return null;
  }
}
