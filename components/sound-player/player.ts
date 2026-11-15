// Graph: source -> voice gain -> bus (sounds | voice | music) -> master -> limiter -> destination
//        layer / ambience loop -> its gain -> duck -> music bus
// A cue is never cut: it plays out, or its gain ramps to zero over MIN_FADE_MS or more before its source stops.

export type Tier = 'quiet' | 'normal' | 'loud';
export type Bus = 'sounds' | 'voice' | 'music';
export const MIN_FADE_MS = 150;
export type EndHow = 'ended' | 'faded' | 'dropped';

export interface CueDef {
  /** The variations, paths under `base`. None: the cue is silent. */
  files: readonly string[];
  tier: Tier;
  gainDb?: number;
  bus?: Bus;
  /** How far the music drops while this cue plays (default: the table's `duck` for its tier or bus; 0: not at all). */
  duckDb?: number;
  /** How many of this cue at once (default: the table's `maxPerCue`). */
  max?: number;
  /** Information only: never a stop time. */
  lengthMs?: number;
}

export interface MusicDef {
  bpm: number;
  beatsPerBar?: number;
  fadeMs?: number;
  /** A state sounds at least this long before the next one starts. */
  holdMs?: number;
  /** Layer name to file: loops of equal length. */
  layers: Readonly<Record<string, string>>;
  /** State name to the gain (0 to 1) of each layer it has. */
  states: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** State name to a file played once, on the music bus, when that state starts; it fades when the state is left. */
  once?: Readonly<Record<string, string>>;
}

export interface SoundTable {
  cues: Readonly<Record<string, CueDef>>;
  tierDb?: Partial<Record<Tier, number>>;
  maxPerCue?: number;
  maxVoices?: number;
  /** How far the music drops under a loud cue and under the voice bus (default 8 each); `ambience`: it drops too. */
  duck?: { loudDb?: number; voiceDb?: number; ambience?: boolean };
  /** A cue asked for before its file is decoded still plays when that takes no longer than this (default 200). */
  lateMs?: number;
  music?: MusicDef;
  ambience?: Readonly<Record<string, string>>;
}

export interface Volumes {
  music: number;
  sounds: number;
  voice: number;
  muted: boolean;
}

type Listens = { addEventListener: (type: string, f: () => void) => void; removeEventListener: (type: string, f: () => void) => void };

export interface SoundPlayerOptions {
  table: SoundTable;
  /** Prefix of every file (ends with `/`). */
  base?: string;
  volumes?: Partial<Volumes>;
  /** Called with the new volumes after every change: the game stores them. */
  onVolumes?: (v: Volumes) => void;
  /** Tests: no context is ever made, nothing plays. */
  silent?: boolean;
  context?: () => AudioContext;
  fetch?: (url: string) => Promise<Response>;
  random?: () => number;
  /** Where the first tap is heard (default `window`). */
  target?: Listens;
  document?: Listens & { hidden: boolean };
}

export interface SoundPlayer {
  /** Called by the first tap or key; a game may call it from its own gesture handler. */
  unlock: () => Promise<void>;
  /** `onEnd(how)` is called exactly once: 'ended' (played out), 'faded' (stopped by a fade) or 'dropped' (never started, also before the first tap or when the file never loads). */
  play: (cue: string, o?: { times?: number; delayMs?: number; onEnd?: (how: EndHow) => void }) => void;
  /** False when the cue is not in the table or has no file that decoded; true when it can play or is not decoded yet. */
  canPlay: (cue: string) => boolean;
  /** Fades the playing cues (all, or one name) over `ms`, never less than MIN_FADE_MS. */
  stopCues: (ms?: number, cue?: string) => void;
  setState: (state: string | null) => void;
  setAmbience: (name: string | null, gain?: number) => void;
  setVolumes: (v: Partial<Volumes>) => void;
  volumes: () => Volumes;
  /** Ducks the music (by the table's voice depth, or `db`) until the returned function is called. */
  duck: (db?: number) => () => void;
  /** Decodes these cues first (all cues are decoded after the first tap anyway). */
  preload: (cues: readonly string[]) => Promise<void>;
  /** Cues playing now. */
  count: () => number;
  dispose: () => void;
}

const TIER_DB: Record<Tier, number> = { quiet: -12, normal: -6, loud: 0 };
const RANK: Record<Tier, number> = { quiet: 0, normal: 1, loud: 2 };
const BUSES = ['sounds', 'voice', 'music'] as const;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const lin = (db: number): number => 10 ** (db / 20);

type Pt = readonly [number, number];
interface Fader {
  node: GainNode;
  ramp: (target: number, start: number, ms: number) => void;
}
function fader(ctx: AudioContext, v: number, out: AudioNode): Fader {
  const node = ctx.createGain();
  node.gain.value = v;
  node.connect(out);
  let pts: Pt[] = [[0, v]];
  const at = (t: number): number => {
    let p = pts[0] ?? [0, v];
    if (t <= p[0]) return p[1];
    for (const q of pts) {
      if (q[0] >= t) return q[0] === p[0] ? q[1] : p[1] + ((q[1] - p[1]) * (t - p[0])) / (q[0] - p[0]);
      p = q;
    }
    return p[1];
  };
  return {
    node,
    ramp(target, start, ms) {
      const now = ctx.currentTime;
      const s = Math.max(start, now);
      const next: Pt[] = [[now, at(now)], ...pts.filter((p) => p[0] > now && p[0] < s), [s, at(s)], [s + ms / 1000, target]];
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(at(now), now);
      for (const p of next.slice(1)) node.gain.linearRampToValueAtTime(p[1], p[0]);
      pts = next;
    },
  };
}

interface Voice {
  cue: string;
  rank: number;
  fade: Fader;
  srcs: AudioBufferSourceNode[];
  left: number;
  unduck: (() => void) | null;
  onEnd?: ((how: EndHow) => void) | undefined;
}

export function createSoundPlayer(o: SoundPlayerOptions): SoundPlayer {
  const { table } = o;
  const base = o.base ?? '';
  const random = o.random ?? Math.random;
  const get = o.fetch ?? ((u: string) => fetch(u));
  const doc = o.document ?? (typeof document === 'undefined' ? undefined : document);
  const target = o.target ?? (typeof window === 'undefined' ? undefined : window);
  let vol: Volumes = { music: 1, sounds: 1, voice: 1, muted: false, ...o.volumes };
  let hidden = doc?.hidden ?? false;
  let wantState: string | null = null;
  let wantAmb: { name: string; gain: number } | null = null;
  const warned = new Set<string>();
  const warn = (what: string, err?: unknown): void => {
    if (warned.has(what)) return;
    warned.add(what);
    console.warn(`sound: ${what} is silent`, err ?? '');
  };

  const live = (ctx: AudioContext) => {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.knee.value = 0;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
    const master = fader(ctx, vol.muted || hidden ? 0 : 1, limiter);
    const buses = {
      sounds: fader(ctx, clamp01(vol.sounds), master.node),
      voice: fader(ctx, clamp01(vol.voice), master.node),
      music: fader(ctx, clamp01(vol.music), master.node),
    };
    const ducker = fader(ctx, 1, buses.music.node);
    const levels = (): void => {
      const now = ctx.currentTime;
      master.ramp(vol.muted || hidden ? 0 : 1, now, MIN_FADE_MS);
      for (const k of BUSES) buses[k].ramp(clamp01(vol[k]), now, MIN_FADE_MS);
    };
    const ducks: { db: number }[] = [];
    let depth = 0;
    const reduck = (): void => {
      const d = Math.max(0, ...ducks.map((x) => x.db));
      if (d !== depth) ducker.ramp(lin(-d), ctx.currentTime, d > depth ? MIN_FADE_MS : 500);
      depth = d;
    };
    const duck = (db = table.duck?.voiceDb ?? 8): (() => void) => {
      const e = { db };
      ducks.push(e);
      reduck();
      return () => {
        const i = ducks.indexOf(e);
        if (i < 0) return;
        ducks.splice(i, 1);
        reduck();
      };
    };
    const bed = table.duck?.ambience ? ducker.node : buses.music.node;

    const decode = async (file: string, what: string): Promise<AudioBuffer | null> => {
      try {
        const r = await get(base + file);
        if (!r.ok) throw new Error(`${String(r.status)} ${file}`);
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (err) {
        warn(`${what} (${file})`, err);
        return null;
      }
    };

    // ---- cues
    const buffers = new Map<string, AudioBuffer[]>();
    const loading = new Map<string, Promise<void>>();
    const load = (name: string): Promise<void> => {
      let p = loading.get(name);
      if (p === undefined) {
        p = Promise.all((table.cues[name]?.files ?? []).map((f) => decode(f, `cue ${name}`))).then((list) => {
          const ok = list.filter((b) => b !== null);
          if (ok.length === 0) warn(`cue ${name}`, 'no file');
          buffers.set(name, ok);
        });
        loading.set(name, p);
      }
      return p;
    };
    const preload = async (first: readonly string[]): Promise<void> => {
      await Promise.all(first.map(load));
    };
    const preloadAll = async (): Promise<void> => {
      for (const k of Object.keys(table.cues)) await load(k);
    };
    const voices: Voice[] = [];
    const lastAt = new Map<string, number>();
    const lastPick = new Map<string, number>();
    const done = (v: Voice, how: EndHow): void => {
      const i = voices.indexOf(v);
      if (i >= 0) voices.splice(i, 1);
      v.unduck?.();
      v.unduck = null;
      const e = v.onEnd;
      v.onEnd = undefined;
      e?.(how);
    };
    const stop = (v: Voice, ms = MIN_FADE_MS): void => {
      const now = ctx.currentTime;
      const f = Math.max(MIN_FADE_MS, ms);
      v.fade.ramp(0, now, f);
      for (const s of v.srcs) {
        try {
          s.stop(now + f / 1000 + 0.01);
        } catch {
          // already ended
        }
      }
      done(v, 'faded');
    };
    const canPlay = (name: string): boolean => table.cues[name] !== undefined && (buffers.get(name)?.length ?? 1) > 0;
    const play = (name: string, opts: { times?: number; delayMs?: number; onEnd?: (how: EndHow) => void } = {}): void => {
      let began = false;
      let deferred = false;
      try {
        if (ctx.state !== 'running' || hidden) return;
        const def = table.cues[name];
        if (def === undefined) return warn(`cue ${name}`, 'not in the table');
        const list = buffers.get(name);
        if (list === undefined) {
          const asked = ctx.currentTime;
          const delay = opts.delayMs ?? 0;
          deferred = true;
          const giveUp = setTimeout(() => opts.onEnd?.('dropped'), delay + (table.lateMs ?? 200) + 2000);
          return void load(name).then(() => {
            clearTimeout(giveUp);
            const ms = (ctx.currentTime - asked) * 1000;
            if (ms - delay <= (table.lateMs ?? 200)) play(name, { ...opts, delayMs: Math.max(0, delay - ms) });
            else opts.onEnd?.('dropped');
          }, () => opts.onEnd?.('dropped'));
        }
        if (list.length === 0) return;
        const when = ctx.currentTime + Math.max(0, opts.delayMs ?? 0) / 1000;
        const last = lastAt.get(name);
        if (last !== undefined && Math.abs(when - last) < 0.04) return;
        const rank = RANK[def.tier];
        const same = voices.filter((v) => v.cue === name);
        const room = voices.length - (same.length >= (def.max ?? table.maxPerCue ?? 3) ? 1 : 0) < (table.maxVoices ?? 12);
        const victim = room ? undefined : voices.filter((v) => v.rank <= rank).sort((x, y) => x.rank - y.rank)[0];
        if (!room && victim === undefined) return;
        if (same[0] !== undefined && same.length >= (def.max ?? table.maxPerCue ?? 3)) stop(same[0]);
        if (victim !== undefined && voices.includes(victim)) stop(victim);
        lastAt.set(name, when);
        const bus = def.bus ?? 'sounds';
        const db = def.duckDb ?? (bus === 'voice' ? (table.duck?.voiceDb ?? 8) : def.tier === 'loud' ? (table.duck?.loudDb ?? 8) : 0);
        const v: Voice = {
          cue: name,
          rank,
          fade: fader(ctx, lin((table.tierDb?.[def.tier] ?? TIER_DB[def.tier]) + (def.gainDb ?? 0)), buses[bus].node),
          srcs: [],
          left: 0,
          unduck: db > 0 ? duck(db) : null,
          onEnd: opts.onEnd,
        };
        let t = when;
        for (let i = 0; i < Math.max(1, Math.floor(opts.times ?? 1)); i += 1) {
          let n = Math.floor(random() * (list.length - (list.length > 1 && lastPick.has(name) ? 1 : 0)));
          if (list.length > 1 && n >= (lastPick.get(name) ?? Infinity)) n += 1;
          lastPick.set(name, n);
          const buffer = list[n];
          if (buffer === undefined) continue;
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(v.fade.node);
          src.onended = () => {
            if ((v.left -= 1) > 0) return;
            done(v, 'ended');
            v.fade.node.disconnect();
          };
          src.start(t);
          t += buffer.duration;
          v.srcs.push(src);
          v.left += 1;
        }
        voices.push(v);
        began = true;
        if (v.left === 0) done(v, 'dropped');
      } catch (err) {
        warn(`cue ${name}`, err);
      } finally {
        if (!began && !deferred) opts.onEnd?.('dropped');
      }
    };

    // ---- music: every layer loops from one start; a state is a set of gains
    const m = table.music;
    const bar = m ? ((m.beatsPerBar ?? 4) * 60) / m.bpm : 1;
    const fadeMs = m?.fadeMs ?? 2000;
    let layers: Map<string, Fader> | null = null;
    let epoch = 0;
    let starting = false;
    let held: { at: number } | null = null;
    let pending: { at: number } | null = null;
    let asked: string | null | undefined;
    const tunes = new Map<string, AudioBuffer>();
    let once: { f: Fader; src: AudioBufferSourceNode; at: number } | null = null;
    const schedule = (): void => {
      if (!m || !layers || wantState === asked) return;
      asked = wantState;
      const now = ctx.currentTime;
      if (pending && pending.at <= now) held = pending;
      let at = now;
      if (held) at = epoch + Math.ceil((Math.max(now, held.at + (m.holdMs ?? 0) / 1000) - epoch) / bar - 1e-6) * bar;
      if (wantState !== null && m.states[wantState] === undefined && m.once?.[wantState] === undefined) warn(`music state ${wantState}`, 'not in the table');
      const gains = wantState === null ? {} : (m.states[wantState] ?? {});
      for (const [k, f] of layers) f.ramp(clamp01(gains[k] ?? 0), at, fadeMs);
      if (held) pending = { at };
      else held = { at };
      if (once) {
        if (once.at <= now) once.f.ramp(0, at, fadeMs);
        once.src.stop(once.at <= now ? at + fadeMs / 1000 + 0.01 : now);
        once = null;
      }
      const tune = wantState === null ? undefined : tunes.get(wantState);
      if (tune) {
        const f = fader(ctx, 1, ducker.node);
        const src = ctx.createBufferSource();
        src.buffer = tune;
        src.connect(f.node);
        src.onended = () => f.node.disconnect();
        src.start(at);
        once = { f, src, at };
      }
    };
    const setState = (): void => {
      if (!m) return;
      if (layers) return schedule();
      if (starting || wantState === null) return;
      starting = true;
      const loops = Promise.all(Object.entries(m.layers).map(async ([k, f]) => [k, await decode(f, `layer ${k}`)] as const));
      const ones = Promise.all(Object.entries(m.once ?? {}).map(async ([k, f]) => [k, await decode(f, `music ${k}`)] as const));
      void Promise.all([loops, ones]).then(([got, one]) => {
        try {
          for (const [k, b] of one) if (b) tunes.set(k, b);
          epoch = ctx.currentTime + 0.05;
          layers = new Map();
          for (const [k, b] of got) {
            if (b === null) continue;
            const f = fader(ctx, 0, ducker.node);
            const s = ctx.createBufferSource();
            s.buffer = b;
            s.loop = true;
            s.connect(f.node);
            s.start(epoch);
            layers.set(k, f);
          }
          schedule();
        } catch (err) {
          warn('music', err);
        }
      });
    };

    // ---- ambience: one loop, crossfaded, off the bar
    let amb: { name: string; f: Fader; src: AudioBufferSourceNode } | null = null;
    const setAmbience = (): void => {
      const w = wantAmb;
      const now = ctx.currentTime;
      if (amb && amb.name === w?.name) return amb.f.ramp(clamp01(w.gain), now, fadeMs);
      if (amb) {
        const old = amb;
        amb = null;
        old.f.ramp(0, now, fadeMs);
        old.src.onended = () => old.f.node.disconnect();
        old.src.stop(now + fadeMs / 1000 + 0.01);
      }
      if (!w) return;
      const file = table.ambience?.[w.name];
      if (file === undefined) return warn(`ambience ${w.name}`, 'not in the table');
      void decode(file, `ambience ${w.name}`).then((b) => {
        try {
          if (b === null || wantAmb?.name !== w.name || amb) return;
          const f = fader(ctx, 0, bed);
          const src = ctx.createBufferSource();
          src.buffer = b;
          src.loop = true;
          src.connect(f.node);
          src.start(ctx.currentTime);
          f.ramp(clamp01(wantAmb.gain), ctx.currentTime, fadeMs);
          amb = { name: w.name, f, src };
        } catch (err) {
          warn(`ambience ${w.name}`, err);
        }
      });
    };

    return {
      play,
      stopCues: (ms?: number, cue?: string) => {
        for (const v of [...voices]) if (cue === undefined || v.cue === cue) stop(v, ms);
      },
      setState,
      setAmbience,
      levels,
      duck,
      preload,
      preloadAll,
      count: () => voices.length,
      canPlay,
    };
  };

  let ctx: AudioContext | null = null;
  let a: ReturnType<typeof live> | null = null;
  let off = (): void => undefined;
  let first: readonly string[] = [];
  const unlock = async (): Promise<void> => {
    if (o.silent || a) return;
    try {
      ctx ??= (o.context ?? (() => new AudioContext()))();
      const c = ctx;
      await c.resume();
      if (a || c.state !== 'running') return;
      a = live(c);
      void a.preload(first).then(() => a?.preloadAll());
      a.setState();
      a.setAmbience();
    } catch (err) {
      warn('the audio context', err);
    }
  };
  // the listeners stay: a context suspended later (a phone lock, a call) resumes on the next tap
  const tap = (): void => {
    if (a && ctx) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    } else void unlock();
  };
  const seen = (): void => {
    hidden = doc?.hidden ?? false;
    if (!hidden && ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    a?.levels();
  };
  if (!o.silent) {
    const kinds = ['pointerdown', 'keydown', 'touchend'];
    for (const k of kinds) target?.addEventListener(k, tap);
    off = () => {
      for (const k of kinds) target?.removeEventListener(k, tap);
    };
    doc?.addEventListener('visibilitychange', seen);
  }

  return {
    unlock,
    play(cue, opts) {
      let fired = false;
      const onEnd = opts?.onEnd;
      const o2 = onEnd ? { ...opts, onEnd: (h: EndHow) => { if (!fired) { fired = true; onEnd(h); } } } : opts;
      if (a) a.play(cue, o2);
      else o2?.onEnd?.('dropped');
    },
    canPlay: (cue) => a?.canPlay(cue) ?? table.cues[cue] !== undefined,
    stopCues: (ms, cue) => a?.stopCues(ms, cue),
    setState(state) {
      wantState = state;
      a?.setState();
    },
    setAmbience(name, gain = 1) {
      wantAmb = name === null ? null : { name, gain };
      a?.setAmbience();
    },
    setVolumes(v) {
      vol = { ...vol, ...v };
      o.onVolumes?.(vol);
      a?.levels();
    },
    volumes: () => vol,
    duck: (db) => a?.duck(db) ?? (() => undefined),
    preload(cues) {
      first = cues;
      return a?.preload(cues) ?? Promise.resolve();
    },
    count: () => a?.count() ?? 0,
    dispose() {
      off();
      doc?.removeEventListener('visibilitychange', seen);
      a?.stopCues();
      const c = ctx;
      if (c) setTimeout(() => void c.close().catch(() => undefined), MIN_FADE_MS + 50);
      a = null;
      ctx = null;
    },
  };
}
