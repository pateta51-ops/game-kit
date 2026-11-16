import type { KernelEvent } from '../engine-core/index';

export type LogKind = 'structure' | 'action' | 'mechanic' | 'test' | 'narrative' | 'record' | 'notice' | 'problem';
/** A reference to a thing the game owns (card, space, piece, player). `type` is the game's own word; the client resolves it. */
export interface Ref { readonly type: string; readonly id: string }
export type Part =
  | { readonly t: 'text'; readonly text: string }
  | { readonly t: 'num'; readonly n: number }
  | { readonly t: 'delta'; readonly n: number }
  | { readonly t: 'ref'; readonly ref: Ref; readonly label?: string }
  | { readonly t: 'icon'; readonly name: string }
  | { readonly t: 'list'; readonly items: readonly (readonly Part[])[] };

export interface Narrated {
  readonly kind: LogKind;
  readonly parts: readonly Part[];
  /** Why it happened: a ref (card, rule), never prose. */
  readonly cause?: Ref;
  /** Rows sharing `id` are shown as one block: a header, members, perhaps a summary. */
  readonly group?: { readonly id: string; readonly role: 'header' | 'member' | 'summary' };
  readonly tone?: 'good' | 'bad';
  /** For later retraction by a newer row. */
  readonly tag?: string;
}
/** One row. Rows are immutable and only appended; later rows (undo, preview, space refs) add optional fields. */
export interface LogEntry extends Narrated {
  /** Row number, from 0, in order of writing. */
  readonly id: number;
  /** The event it came from. */
  readonly seq: number;
  /** The undo point it was written under; all rows of one action share it. */
  readonly step: number;
}

/** An event with a type word; a game's events are a union of these. */
export type TypedEvent = KernelEvent & { readonly type: string };
type Out = Narrated | readonly Narrated[] | null;
/** The one table: event type to rows. Silence is the default: no catch-all, and wrapper copies of an occurrence are left out. */
export type Narrator<E extends TypedEvent> = {
  readonly [K in E['type']]?: (e: Extract<E, { type: K }>) => Out;
};

export const text = (s: string): Part => ({ t: 'text', text: s });
export const num = (n: number): Part => ({ t: 'num', n });
export const delta = (n: number): Part => ({ t: 'delta', n });
export const ref = (type: string, id: string, label?: string): Part => (label === undefined ? { t: 'ref', ref: { type, id } } : { t: 'ref', ref: { type, id }, label });
export const icon = (name: string): Part => ({ t: 'icon', name });

/** Rows for events, appended to `log` (a new array; `log` is untouched). A narration that throws becomes a problem row. */
export function appendLog<E extends TypedEvent>(log: readonly LogEntry[], events: readonly E[], table: Narrator<E>, step: number): LogEntry[] {
  const out = [...log];
  for (const e of events) {
    const fn = (table as Record<string, ((e: E) => Out) | undefined>)[e.type];
    if (!fn) continue;
    let r: Out;
    try { r = fn(e); } catch { r = { kind: 'problem', parts: [text(`Log line failed for ${e.type}`)] }; }
    if (!r) continue;
    for (const n of Array.isArray(r) ? (r as readonly Narrated[]) : [r as Narrated]) out.push({ ...n, id: out.length, seq: e.seq, step });
  }
  return out;
}

/** A run of rows sharing a group id is one block; other rows are blocks of one. */
export function blocks(log: readonly LogEntry[]): LogEntry[][] {
  const out: LogEntry[][] = [];
  for (const r of log) {
    const last = out[out.length - 1];
    if (r.group && last && last[0]?.group?.id === r.group.id) last.push(r);
    else out.push([r]);
  }
  return out;
}

export function plainParts(parts: readonly Part[]): string {
  return parts.map((p) => {
    switch (p.t) {
      case 'text': return p.text;
      case 'num': return String(p.n);
      case 'delta': return p.n > 0 ? `+${p.n}` : String(p.n);
      case 'ref': return p.label ?? p.ref.id;
      case 'icon': return `[${p.name}]`;
      case 'list': return p.items.map(plainParts).join(', ');
    }
  }).join('');
}
export const plainLine = (e: Narrated): string => plainParts(e.parts);

/** Wording rules for a row, as problems: for a game's test over what its table writes. */
export function wordingProblems(e: Narrated): string[] {
  const out: string[] = [];
  if (!e.parts.length) out.push('no parts');
  const walk = (ps: readonly Part[]): void => {
    for (const p of ps) {
      if (p.t === 'num' || p.t === 'delta') { if (!Number.isFinite(p.n)) out.push('number is not finite'); }
      if (p.t === 'delta' && p.n === 0) out.push('delta of 0');
      if (p.t === 'ref' && (!p.ref.id || !p.ref.type)) out.push('ref without type or id');
      if (p.t === 'list') p.items.forEach(walk);
    }
  };
  walk(e.parts);
  const line = plainLine(e);
  if (line !== line.trim() || line.includes('  ')) out.push('line has stray spaces');
  if (e.kind !== 'problem' && /(?<![A-Za-z])(undefined|null|NaN)(?![A-Za-z])|\[object/.test(line)) out.push('line shows a raw value');
  return out;
}

/** The undo point of a row (the step it was written under), or undefined when no row has that id. */
export const stepOf = (log: readonly LogEntry[], id: number): number | undefined => log.find((r) => r.id === id)?.step;

/** Undo back to a line: the log as it was before that line's action (`after: true`: just after it) and the step the game restores its snapshot for. Undefined for an unknown id. Rows stay append-only; this returns a shorter copy. */
export function rewindLog(log: readonly LogEntry[], id: number, after = false): { log: LogEntry[]; step: number } | undefined {
  const s = stepOf(log, id);
  return s === undefined ? undefined : { log: log.filter((r) => (after ? r.step <= s : r.step < s)), step: after ? s : s - 1 };
}

/** Hover preview: the rows up to and including the hovered line's action, and its step (the game shows its snapshot for that step, read-only). */
export function previewAt(log: readonly LogEntry[], id: number): { rows: LogEntry[]; step: number } | undefined {
  const s = stepOf(log, id);
  return s === undefined ? undefined : { rows: log.filter((r) => r.step <= s), step: s };
}

/** Every ref in a row's parts (lists included), in reading order; the cause last when `withCause`. */
export function refsOf(e: Narrated, withCause = false): Ref[] {
  const out: Ref[] = [];
  const walk = (ps: readonly Part[]): void => { for (const p of ps) { if (p.t === 'ref') out.push(p.ref); else if (p.t === 'list') p.items.forEach(walk); } };
  walk(e.parts);
  if (withCause && e.cause) out.push(e.cause);
  return out;
}

/** What the map does for a log reference: hover highlights it, click highlights and scrolls to it. `mapTypes` are the game's ref types that live on the map (space, piece...); other refs (card, player) do nothing. */
export interface MapFocus { readonly highlight: readonly Ref[]; readonly scrollTo?: Ref }
export function refFocus(r: Ref, mapTypes: readonly string[], on: 'hover' | 'click' = 'hover'): MapFocus {
  if (!mapTypes.includes(r.type)) return { highlight: [] };
  return on === 'click' ? { highlight: [r], scrollTo: r } : { highlight: [r] };
}
/** Hovering a whole row lights every map ref in it; clicking it scrolls to the first. */
export function rowFocus(e: Narrated, mapTypes: readonly string[], on: 'hover' | 'click' = 'hover'): MapFocus {
  const hit = refsOf(e).filter((r) => mapTypes.includes(r.type));
  const first = hit[0];
  return on === 'click' && first ? { highlight: hit, scrollTo: first } : { highlight: hit };
}

/** One block as a box (a battle, an activation): its header, members and summary rows. */
export interface GroupBox { id?: string; header?: LogEntry; members: LogEntry[]; summary?: LogEntry }
export function groupBox(block: readonly LogEntry[]): GroupBox {
  const box: GroupBox = { members: [] };
  const g = block[0]?.group;
  if (g) box.id = g.id;
  for (const r of block) {
    if (r.group?.role === 'header') box.header = r;
    else if (r.group?.role === 'summary') box.summary = r;
    else box.members.push(r);
  }
  return box;
}

const pad = (r: LogEntry): string => (r.group?.role === 'member' ? '  ' : '');
/** The log as plain text a golden can pin: one line per row, `step kind: line (cause type:id)`, group members indented, a marker for tone. Same log, same text. */
export function exportText(log: readonly LogEntry[]): string {
  return log.map((r) => `${r.step} ${r.kind}: ${pad(r)}${plainLine(r)}${r.tone ? ` <${r.tone}>` : ''}${r.cause ? ` (${r.cause.type}:${r.cause.id})` : ''}`).join('\n') + '\n';
}
