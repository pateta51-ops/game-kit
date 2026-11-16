// A line player on the sound player's voice bus. It knows no game: lines are data, the game gives the gate.
// A line is never cut: it plays out. It only waits, or is not started.

export interface LineDef {
  /** Files played back to back as one line (paths under the sound player's base). */
  files: readonly string[];
  /** A line asked for while another plays: 'drop' (default) forgets it, 'wait' plays it after the others. */
  busy?: 'wait' | 'drop';
  /** `once`: one time per game. `every: n`: the 1st, (n+1)th, (2n+1)th ask play; the others do not. */
  limit?: { once?: boolean; every?: number };
  /** Silence between the files (default: the voice's `gapMs`). */
  gapMs?: number;
}

export interface VoiceTable {
  lines: Readonly<Record<string, LineDef>>;
  /** Name to file: pieces a line is assembled from at play time (`play(id, { parts })`), such as number words. */
  parts?: Readonly<Record<string, string>>;
}

export interface VoicePlayer {
  play: (cue: string, o?: { delayMs?: number; onEnd?: (how: 'ended' | 'faded' | 'dropped') => void }) => void;
  /** False when a file will never sound (not in the table, or none decoded). Without it, only a part missing from the voice table is checked. */
  canPlay?: (cue: string) => boolean;
  setVolumes: (v: { voice?: number }) => void;
}

export interface VoiceOptions {
  table: VoiceTable;
  player: VoicePlayer;
  /** Asked before each line starts (also for a waiting one); false: the line is dropped. */
  mayPlay?: (id: string) => boolean;
  /** Silence between files (default 80). */
  gapMs?: number;
  /** Waiting lines kept (default 8); one more drops the oldest. */
  maxWaiting?: number;
  /** Frees the queue when the player never reports an end (default 20000). The sound is never stopped by it. */
  fileTimeoutMs?: number;
  enabled?: boolean;
  volume?: number;
  /** Counts for `limit`, from a saved game. */
  counts?: Readonly<Record<string, number>>;
}

export interface Voice {
  /** Asks for a line. True when it started or waits. */
  play: (id: string, o?: { parts?: readonly string[]; pieces?: readonly string[]; gapsMs?: readonly number[] }) => boolean;
  setEnabled: (on: boolean) => void;
  enabled: () => boolean;
  /** The voice bus volume, 0 to 1 (the sound player's own `setVolumes({ voice })`). */
  setVolume: (v: number) => void;
  /** Empties the queue; the line playing finishes. */
  clearWaiting: () => void;
  /** Times each line was counted by its limit: save it with the game. */
  counts: () => Record<string, number>;
  /** New game: the limits and the last line start over. */
  reset: (counts?: Readonly<Record<string, number>>) => void;
  playing: () => string | null;
  waiting: () => number;
  dispose: () => void;
}

/** The cue name the sound player gets for a file. */
export const voiceCue = (file: string): string => `voice:${file}`;

export interface VoiceCue {
  files: string[];
  tier: 'normal';
  bus: 'voice';
}

/** Cue entries for the sound table's `cues`: every file of every line and part, on the voice bus. */
export function voiceCues(t: VoiceTable, extraFiles: readonly string[] = []): Record<string, VoiceCue> {
  const out: Record<string, VoiceCue> = {};
  const files = [...Object.values(t.lines).flatMap((l) => l.files), ...Object.values(t.parts ?? {}), ...extraFiles];
  for (const f of files) out[voiceCue(f)] = { files: [f], tier: 'normal', bus: 'voice' };
  return out;
}

interface Item {
  id: string;
  key: string;
  files: string[];
  gaps?: readonly number[] | undefined;
}

export function createVoice(o: VoiceOptions): Voice {
  const gap = o.gapMs ?? 80;
  const timeout = o.fileTimeoutMs ?? 20000;
  const maxWaiting = o.maxWaiting ?? 8;
  let on = o.enabled ?? true;
  let counts: Record<string, number> = { ...(o.counts ?? {}) };
  let last: string | null = null;
  let current: { id: string; token: number } | null = null;
  let token = 0;
  let queue: Item[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;
  if (o.volume !== undefined) o.player.setVolumes({ voice: o.volume });

  const finish = (t: number): void => {
    if (current?.token !== t) return;
    clearTimeout(timer);
    current = null;
    next();
  };
  const run = (item: Item): void => {
    const t = (token += 1);
    current = { id: item.id, token: t };
    counts[item.id] = (counts[item.id] ?? 0) + 1;
    last = item.key;
    const g = o.table.lines[item.id]?.gapMs ?? gap;
    const step = (i: number): void => {
      if (current?.token !== t || dead) return;
      const f = item.files[i];
      if (f === undefined) return finish(t);
      clearTimeout(timer);
      timer = setTimeout(() => step(i + 1), timeout + g);
      let ended = false;
      o.player.play(voiceCue(f), {
        delayMs: i === 0 ? 0 : (item.gaps?.[i - 1] ?? g),
        onEnd: (how) => {
          if (ended) return;
          ended = true;
          if (how === 'ended') step(i + 1);
          else finish(t);
        },
      });
    };
    step(0);
  };
  // A line counts when it starts, or when its own `every` skips it; one dropped by the gate, by never-twice or by a busy voice does not.
  const limitOk = (id: string, skip: boolean): boolean => {
    const l = o.table.lines[id]?.limit;
    const n = counts[id] ?? 0;
    if (l?.once && n >= 1) return false;
    if (l?.every !== undefined && n % Math.max(1, Math.floor(l.every)) !== 0) {
      if (skip) counts[id] = n + 1;
      return false;
    }
    return true;
  };
  function next(): void {
    while (current === null && !dead) {
      const item = queue.shift();
      if (item === undefined) return;
      if (on && item.key !== last && limitOk(item.id, false) && o.mayPlay?.(item.id) !== false) run(item);
    }
  }

  const play: Voice['play'] = (id, opts = {}) => {
    const def = o.table.lines[id];
    if (dead || !on || def === undefined) return false;
    const files = [...(opts.pieces ?? def.files)];
    for (const p of opts.parts ?? []) {
      const f = o.table.parts?.[p];
      if (f === undefined) return false;
      files.push(f);
    }
    if (files.length === 0 || files.some((f) => o.player.canPlay?.(voiceCue(f)) === false)) return false;
    const key = JSON.stringify([id, files]);
    if (current === null && key === last) return false;
    if (current !== null && def.busy !== 'wait') return false;
    if (!limitOk(id, true)) return false;
    if (current === null && o.mayPlay?.(id) === false) return false;
    if (current !== null) {
      queue.push({ id, key, files, gaps: opts.gapsMs });
      while (queue.length > maxWaiting) queue.shift();
      return true;
    }
    run({ id, key, files, gaps: opts.gapsMs });
    return true;
  };

  return {
    play,
    setEnabled: (v) => {
      on = v;
      if (!v) queue = [];
    },
    enabled: () => on,
    setVolume: (v) => {
      o.player.setVolumes({ voice: v });
    },
    clearWaiting: () => {
      queue = [];
    },
    counts: () => ({ ...counts }),
    reset: (c) => {
      counts = { ...(c ?? {}) };
      last = null;
      queue = [];
    },
    playing: () => current?.id ?? null,
    waiting: () => queue.length,
    dispose: () => {
      dead = true;
      queue = [];
      clearTimeout(timer);
    },
  };
}
