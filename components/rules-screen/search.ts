import type { Block, Rulebook } from "./rulebook.ts";

export function blockText(block: Block): string {
  switch (block.kind) {
    case "h2":
    case "h3":
    case "p":
    case "intro":
    case "note":
      return block.text;
    case "ul":
    case "ol":
    case "credits":
      return block.items
        .map((item) =>
          typeof item === "string"
            ? item
            : [item.text, ...(item.bullets ?? [])].join(" "),
        )
        .join(" ");
    case "table":
      return block.rows.flat().join(" ");
    case "figure":
      return [
        ...block.scenes.flatMap((scene) => [
          scene.alt,
          ...scene.els.flatMap((el) => ("text" in el ? [el.text] : [])),
        ]),
        ...(block.callouts ?? []).map(({ lead, text }) =>
          [lead, text].join(" "),
        ),
      ].join(" ");
    case "sheet":
      return [
        block.text,
        block.description,
        ...block.sides.map(({ label }) => label),
      ].join(" ");
  }
}

export function searchText(text: string): string {
  return text
    .replace(
      /\[\[?([\w-]+)\]\]?|\{([\w:-]+)\}/g,
      (_, bracket: string | undefined, brace: string | undefined) =>
        (bracket ?? brace ?? "").replace(/_/g, " "),
    )
    .replace(/\*\*/g, "");
}

const words = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export interface RuleHit {
  index: number;
  text: string;
  score: number;
}

export function searchRules(
  book: Rulebook,
  query: string,
  plain = searchText,
): RuleHit[] {
  const terms = words(query);
  if (terms.length === 0) return [];
  return book
    .flatMap((block, index) => {
      const text = plain(blockText(block));
      const tokens = words(text);
      const normalized = tokens.join(" ");
      if (!terms.every((term) => normalized.includes(term))) return [];
      const heading = block.kind === "h2" || block.kind === "h3";
      const score =
        (normalized === terms.join(" ") ? 8 : 0) +
        (normalized.includes(terms.join(" ")) ? 4 : 0) +
        (terms.filter((term) => tokens.includes(term)).length / terms.length) *
          2 +
        (heading ? 1 : 0);
      return [{ index, text, score }];
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export function rulesMatching(
  book: Rulebook,
  query: string,
  hits = searchRules(book, query),
): Set<number> {
  if (words(query).length === 0) return new Set(book.map((_, index) => index));
  const direct = new Set(hits.map(({ index }) => index));
  const shown = new Set<number>();
  let chapter = -1;
  let section = -1;
  book.forEach((block, index) => {
    if (block.kind === "h2") {
      chapter = index;
      section = -1;
    }
    if (block.kind === "h3") section = index;
    if (direct.has(index) || direct.has(chapter) || direct.has(section)) {
      shown.add(index);
      if (chapter >= 0) shown.add(chapter);
      if (section >= 0) shown.add(section);
    }
  });
  return new Set([...shown].sort((a, b) => a - b));
}

export function highlight(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const terms = [...new Set(words(query))].sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text, match: false }];
  const matcher = new RegExp(terms.join("|"), "giu");
  const parts: { text: string; match: boolean }[] = [];
  let start = 0;
  for (const match of text.matchAll(matcher)) {
    if (match.index > start)
      parts.push({ text: text.slice(start, match.index), match: false });
    parts.push({ text: match[0], match: true });
    start = match.index + match[0].length;
  }
  if (start < text.length)
    parts.push({ text: text.slice(start), match: false });
  return parts;
}
