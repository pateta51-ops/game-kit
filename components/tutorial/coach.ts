// The coach: first-time tips as data, and a suggested move from the game's driver with its plain-word reasons.
export interface Tip<S, E> {
  id: string;
  title: string;
  text: string;
  /** Did the last action make this tip relevant? */
  when(events: readonly E[], state: S): boolean;
  /** Held back while a guided lesson runs (it is about the state, not about what just happened). */
  situational?: boolean;
  /** Target ids to spotlight (the game's own spelling, as for the highlight). */
  targets?: string[];
}

export interface CoachCard {
  id: string;
  title: string;
  text: string;
  targets?: string[];
}

/** The first tip, in list order, that the last action makes relevant and the player has not seen. */
export function nextTip<S, E>(tips: readonly Tip<S, E>[], events: readonly E[], state: S, seen: ReadonlySet<string>, inLesson = false): CoachCard | null {
  const t = tips.find((x) => !seen.has(x.id) && !(inLesson && x.situational) && x.when(events, state));
  return t ? { id: t.id, title: t.title, text: t.text, ...(t.targets ? { targets: t.targets } : {}) } : null;
}

export interface Suggestion {
  choiceId: string;
  text: string;
  /** Short plain-word reasons. */
  why: string[];
  /** Where to look: target ids to spotlight. */
  targets?: string[];
}

export interface Coach<S> {
  /** The id the game's driver would pick in the open prompt, or undefined (nothing to suggest). */
  choose(state: S): string | undefined;
  /** The move in words, its reasons and the places to spotlight; null when it has nothing to say. */
  explain(state: S, choiceId: string): { text: string; why?: string[]; targets?: string[] } | null;
  /** At most this many reasons (default 4). */
  maxWhy?: number;
}

export function suggest<S>(coach: Coach<S>, state: S): Suggestion | null {
  const choiceId = coach.choose(state);
  const e = choiceId === undefined ? null : coach.explain(state, choiceId);
  return choiceId === undefined || !e ? null : { choiceId, text: e.text, why: (e.why ?? []).slice(0, coach.maxWhy ?? 4), ...(e.targets ? { targets: e.targets } : {}) };
}

export interface SeenStore {
  seen(): Set<string>;
  mark(id: string): void;
  reset(): void;
}

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** The tip ids already seen, kept per browser under `key`; without storage the coach forgets on reload. */
export function seenStore(key: string, storage?: Store): SeenStore {
  const st = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  const load = (): Set<string> => {
    try {
      const v: unknown = JSON.parse(st?.getItem(key) ?? '[]');
      return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const save = (s: Set<string>) => {
    try {
      st?.setItem(key, JSON.stringify([...s]));
    } catch {
      // storage unavailable
    }
  };
  let cur = load();
  return {
    seen: () => new Set(cur),
    mark: (id) => {
      if (cur.has(id)) return;
      cur = new Set([...cur, id]);
      save(cur);
    },
    reset: () => {
      cur = new Set();
      save(cur);
    },
  };
}
