// K90: every prompt names its source frame (card and clause); a decision-authority tag when the player decides for the
// automated side; a read-only view of the resolution stack. Ideas from marvel-champions-digital-game (AGPL-3.0, idea
// only, written new from docs/evaluation/outside/marvel-champions.md items 5 to 7).

/** Where an open prompt comes from. The game adds `source: PromptSource` (and `authority?`) to its own prompt type. */
export interface PromptSource {
  /** The stack frame the prompt belongs to (the game's frame id, as `stackView` rows carry it). */
  readonly frame: string;
  /** The card asking, by id; absent when a rule asks. */
  readonly card?: string;
  /** The printed clause asking, or the rule id when no card asks. */
  readonly clause: string;
  /** A trigger window: the event is about to happen ('before', interrupt) or just happened ('after', response). */
  readonly window?: 'before' | 'after';
  /** The event the window is about, in the game's terms. */
  readonly event?: string;
}

/** A decision the player makes for the automated side: the constant instruction and the quoted rule that put it there. */
export interface Authority {
  readonly instruction: string;
  readonly rule: string;
}

/** The game's authority tags; 'player' (or no tag) is the player's own decision and needs no entry. */
export type AuthorityTable = Readonly<Record<string, Authority>>;

/** The notice for a tag, or null for the player's own decision or an unknown tag (`checkPromptSources` reports those). */
export const authorityNotice = (tag: string | undefined, table: AuthorityTable): Authority | null =>
  tag === undefined || tag === 'player' ? null : (table[tag] ?? null);

export type StackRow<R> = R & {
  readonly frame: string;
  /** 0 resolves next. */
  readonly depth: number;
  /** The frame the open prompt belongs to. */
  readonly open: boolean;
};

/**
 * Read-only rows of a LIFO stack (the last entry runs first), the next to resolve first. `describe` gives a task's
 * frame id and row data (kind, card, event, window half, what it awaits), or null to leave an internal task out.
 */
export function stackView<T, R extends object>(
  stack: readonly T[],
  describe: (task: T, index: number) => (R & { readonly frame: string }) | null,
  openFrame: string | null = null,
): StackRow<R>[] {
  const rows: StackRow<R>[] = [];
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const r = describe(stack[i] as T, i);
    if (r !== null) rows.push({ ...r, depth: rows.length, open: r.frame === openFrame });
  }
  return rows;
}

export interface OpenPrompt {
  readonly source?: PromptSource;
  readonly authority?: string;
}

export interface SourceSpec<S> {
  readonly states: Iterable<{ readonly id: string; readonly state: S }>;
  /** The open prompt, or null when none is open. */
  readonly prompt: (state: S) => OpenPrompt | null;
  /** The frame ids on the stack view; when given, a source frame must be one of them. */
  readonly frames?: (state: S) => readonly string[];
  /** Every tag a prompt may carry besides 'player'. */
  readonly authorities?: AuthorityTable;
}

/** A line per open prompt that names no source, an empty clause, a frame not on the stack or an unknown authority tag. */
export function checkPromptSources<S>(spec: SourceSpec<S>): string[] {
  const bad: string[] = [];
  for (const { id, state } of spec.states) {
    const p = spec.prompt(state);
    if (p === null) continue;
    const s = p.source;
    if (s === undefined) bad.push(`${id}: the prompt names no source`);
    else {
      if (s.clause.trim() === '') bad.push(`${id}: the source names no clause`);
      if (spec.frames !== undefined && !spec.frames(state).includes(s.frame)) bad.push(`${id}: source frame ${s.frame} is not on the stack`);
    }
    const t = p.authority;
    if (t !== undefined && t !== 'player' && spec.authorities?.[t] === undefined) bad.push(`${id}: unknown authority tag ${t}`);
  }
  return bad;
}
