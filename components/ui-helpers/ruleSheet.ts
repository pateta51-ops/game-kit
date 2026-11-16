// Lifted from jarl src/ui/screens/rulesSearch.ts: the search of a rules screen. A block is shown when it holds every
// word typed; a heading is shown when it matches (then its whole section shows) or when anything under it is shown.
// The game gives each block's words; nothing here knows or returns a rule id.
export interface SheetBlock {
  /** 1, 2, 3... for a heading (1 the outermost); absent for a paragraph, a list, a table. */
  level?: number;
  /** The words a reader can find in it, as printed (never a rule id). */
  text: string;
}

/** A printed text as searchable words: each [TOKEN] read as its word, bold marks gone, lowercased. */
export function sheetWords(raw: string): string {
  return raw
    .replace(/\[([A-Z_0-9]+)\]/g, (_, t: string) => ` ${t.replace(/_/g, ' ')} `)
    .replace(/\*\*/g, '')
    .toLowerCase();
}

/** The indexes of the blocks to show for the search `q`, or every index when `q` is blank. */
export function sheetMatching(
  blocks: readonly SheetBlock[],
  q: string,
  read: (text: string) => string = sheetWords,
): Set<number> {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return new Set(blocks.map((_, i) => i));
  const out = new Set<number>();
  let heads: { i: number; level: number; hit: boolean }[] = [];
  blocks.forEach((b, i) => {
    const t = read(b.text);
    const hit = words.every((w) => t.includes(w));
    const level = b.level;
    if (level !== undefined) heads = heads.filter((h) => h.level < level);
    if (hit || heads.some((h) => h.hit)) {
      out.add(i);
      for (const h of heads) out.add(h.i);
    }
    if (level !== undefined) heads.push({ i, level, hit });
  });
  return out;
}
