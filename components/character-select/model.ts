// Ported from STCC src/ui/select/takeTheChair.ts (27fb8882): the pure model of a character select screen.

export interface PortraitSpec {
  src: string;
  /** The face, as shares of the image (0..1); default the middle, a little high. */
  focus?: { x: number; y: number } | undefined;
  /** Crop a region of a larger image (a card's art box) instead of covering the box with the whole image. */
  crop?: { width: number; ratio: number; bottom?: number | undefined; top?: number | undefined; faceAt?: number | undefined } | undefined;
}
export interface CharacterSet {
  id: string;
  label: string;
}
export interface DeckCard {
  id: string;
  name: string;
  kind: string;
}
export interface Character {
  id: string;
  name: string;
  /** The short name (the roster, the deck heading); the last part of the name on the hero. */
  short?: string | undefined;
  set: string;
  /** The meter value (complexity, difficulty), 0..statMax. */
  stat?: number | undefined;
  statLine?: string | undefined;
  meta?: string | undefined;
  summary?: string | undefined;
  full?: string | undefined;
  links?: readonly TextLink[] | undefined;
  portrait?: PortraitSpec | undefined;
  deck?: readonly DeckCard[] | undefined;
}
export interface Opponent {
  id: string;
  name: string;
  set?: string | undefined;
  stat?: number | undefined;
  statLine?: string | undefined;
  meta?: string | undefined;
  summary?: string | undefined;
  full?: string | undefined;
  portrait?: PortraitSpec | undefined;
}
export interface Mode {
  id: string;
  label: string;
  line?: string | undefined;
  /** false: the mode has no opponent to pick (the strip shows `note` instead). */
  opponents?: boolean | undefined;
  note?: string | undefined;
}
export interface OptionField {
  id: string;
  label: string;
  kind: 'select' | 'text' | 'check';
  choices?: readonly { value: string; label: string; disabled?: string | null | undefined }[] | undefined;
  /** The modes the field shows in (all when absent). */
  modes?: readonly string[] | undefined;
}
export interface Choice {
  mode: string;
  pick: string;
  opponent: string | null;
  options: Record<string, string | boolean>;
}
export interface TextLink {
  phrase: string;
  id: string;
}

/** The roster by set (in `sets` order, unknown sets last), then by stat, lowest first; ties keep their order. */
export function sortRoster<T extends { set?: string | undefined; stat?: number | undefined }>(list: readonly T[], sets: readonly CharacterSet[]): T[] {
  const at = (s: string | undefined): number => {
    const i = sets.findIndex((x) => x.id === s);
    return i < 0 ? sets.length : i;
  };
  return [...list].sort((a, b) => at(a.set) - at(b.set) || (a.stat ?? 0) - (b.stat ?? 0));
}

/** The roster as groups, one per set that has someone, in roster order. */
export function groupBySet<T extends { set?: string | undefined }>(
  list: readonly T[],
  sets: readonly CharacterSet[],
): { set: CharacterSet; items: T[] }[] {
  const out: { set: CharacterSet; items: T[] }[] = [];
  for (const c of list) {
    const last = out[out.length - 1];
    if (last !== undefined && last.set.id === c.set) last.items.push(c);
    else out.push({ set: sets.find((s) => s.id === c.set) ?? { id: c.set ?? '', label: c.set ?? '' }, items: [c] });
  }
  return out;
}

/** The name on the hero: `first` above, `last` large (the short name when the name ends with it, else the last word). */
export function splitName(name: string, short?: string): { first: string; last: string } {
  if (short !== undefined && short !== '' && name.endsWith(short))
    return { first: name.slice(0, -short.length).trim(), last: short };
  const i = name.lastIndexOf(' ');
  return i < 0 ? { first: '', last: name } : { first: name.slice(0, i), last: name.slice(i + 1) };
}

export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'icon'; name: string }
  | { kind: 'chip'; name: string }
  | { kind: 'link'; text: string; id: string };

/** A text as pieces: plain text, icons (`[name]`, only names in `icons`), chips (`<NAME>`) and linked phrases (each once). */
export function pieces(text: string, icons: Iterable<string> = [], links: readonly TextLink[] = []): Piece[] {
  const known = new Set(icons);
  const marks: { at: number; end: number; id: string }[] = [];
  for (const l of [...links].sort((a, b) => b.phrase.length - a.phrase.length)) {
    const re = new RegExp(`(?<![A-Za-z’])${l.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`);
    const m = re.exec(text);
    if (m === null) continue;
    const at = m.index;
    const end = at + l.phrase.length;
    if (marks.some((x) => at < x.end && end > x.at)) continue;
    marks.push({ at, end, id: l.id });
  }
  marks.sort((a, b) => a.at - b.at);
  const out: Piece[] = [];
  const plain = (s: string): void => {
    const re = /\[([a-z-]+)\]|<([A-Z0-9 -]+)>/g;
    let last = 0;
    for (let m = re.exec(s); m !== null; m = re.exec(s)) {
      if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
      const icon = m[1];
      const chip = m[2];
      if (icon !== undefined && known.has(icon)) out.push({ kind: 'icon', name: icon });
      else if (chip !== undefined) out.push({ kind: 'chip', name: chip });
      else out.push({ kind: 'text', text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  };
  let pos = 0;
  for (const m of marks) {
    plain(text.slice(pos, m.at));
    out.push({ kind: 'link', text: text.slice(m.at, m.end), id: m.id });
    pos = m.end;
  }
  plain(text.slice(pos));
  return out;
}

/** The deck tabs: All, then one per kind the deck has (in `order`, unknown kinds after), with counts. */
export function deckTabs(deck: readonly DeckCard[], order: readonly string[] = []): { kind: string; count: number }[] {
  const n = new Map<string, number>();
  for (const c of deck) n.set(c.kind, (n.get(c.kind) ?? 0) + 1);
  const kinds = [...order.filter((k) => n.has(k)), ...[...n.keys()].filter((k) => !order.includes(k))];
  return [{ kind: 'ALL', count: deck.length }, ...kinds.map((k) => ({ kind: k, count: n.get(k) ?? 0 }))];
}

/** The cards a tab and a search show, and the page of them (clamped). */
export function deckPage<T extends DeckCard>(
  deck: readonly T[],
  kind: string,
  query: string,
  page: number,
  perPage: number,
): { cards: T[]; list: number; pages: number; page: number } {
  const q = query.trim().toLowerCase();
  const list = deck.filter((c) => (kind === 'ALL' || c.kind === kind) && (q === '' || c.name.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const p = Math.max(0, Math.min(page, pages - 1));
  return { cards: list.slice(p * perPage, p * perPage + perPage), list: list.length, pages, page: p };
}

/**
 * The background size and position that crop a box of aspect `aspect` (width / height) out of an image of aspect `ratio`:
 * `width` is the crop's share of the image width, the focus at `faceAt` of the crop's height, never below `bottom` nor
 * (for a wide crop) above `top`.
 */
export function portraitCrop(
  focus: { x: number; y: number },
  crop: { width: number; ratio: number; bottom?: number | undefined; top?: number | undefined; faceAt?: number | undefined },
  aspect: number,
): { size: string; position: string } {
  const bottom = crop.bottom ?? 1;
  const top = crop.width > 0.45 ? (crop.top ?? 0) : 0;
  let w = crop.width;
  let h = (w * crop.ratio) / aspect;
  if (h > bottom - top) {
    h = bottom - top;
    w = (h * aspect) / crop.ratio;
  }
  const x0 = Math.max(0, Math.min(1 - w, focus.x - w / 2));
  const y0 = Math.max(0, Math.min(bottom - h, Math.max(top, focus.y - h * (crop.faceAt ?? 0.38))));
  const px = w >= 1 ? 0 : (x0 / (1 - w)) * 100;
  const py = h >= 1 ? 0 : (y0 / (1 - h)) * 100;
  return { size: `${(100 / w).toFixed(2)}% auto`, position: `${px.toFixed(2)}% ${py.toFixed(2)}%` };
}

/** The fields shown in a mode. */
export const fieldsFor = (fields: readonly OptionField[], mode: string): OptionField[] =>
  fields.filter((f) => f.modes === undefined || f.modes.includes(mode));

/** A mode's choice: the opponent is null when the mode has none. */
export function choiceOf(
  mode: Mode,
  pick: string,
  opponent: string | null,
  options: Record<string, string | boolean>,
  fields: readonly OptionField[] = [],
): Choice {
  const shown = new Set(fieldsFor(fields, mode.id).map((f) => f.id));
  return {
    mode: mode.id,
    pick,
    opponent: mode.opponents === false ? null : opponent,
    options: Object.fromEntries(Object.entries(options).filter(([k]) => fields.length === 0 || shown.has(k))),
  };
}

/** The first opponent that is allowed, keeping `current` when it still is. */
export function firstAllowed(
  list: readonly { id: string }[],
  current: string | null,
  ok: (id: string) => boolean,
): string | null {
  if (current !== null && ok(current)) return current;
  return list.find((o) => ok(o.id))?.id ?? null;
}
