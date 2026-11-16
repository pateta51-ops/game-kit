// A story page: a small tree of text keys (prose lives in a text table, never in the tree). Draws nothing; loads in node.
export type Cond = string | { not: Cond } | { all: Cond[] } | { any: Cond[] };
export type Mod = 'resolution' | 'interlude' | 'boxed';
export type Entry =
  | { t: 'text'; key: string; vars?: Record<string, string | number> }
  | { t: 'header'; key: string; level?: number }
  | { t: 'list'; items: Entry[] }
  | { t: 'card'; card: string; note?: string }
  | { t: 'icon'; icon: string }
  | { t: 'footnote'; n: number; key: string }
  | { t: 'branch'; cases: { when?: Cond; entry: Entry }[] }
  | { t: 'mod'; mods: Mod[]; entry: Entry };
export type Page = { id: string; entries: Entry[] };
export type Texts = Record<string, string>;
export type Node =
  | { t: 'text' | 'header' | 'footnote'; text: string; changed: boolean; level?: number; n?: number }
  | { t: 'list'; items: Node[] }
  | { t: 'card'; card: string; note?: string }
  | { t: 'icon'; icon: string }
  | { t: 'branch'; cases: { when?: Cond; applied: boolean; node: Node }[] }
  | { t: 'mod'; mods: Mod[]; node: Node };

// A condition over the campaign log (the set of keys written so far).
export const holds = (c: Cond, log: readonly string[]): boolean =>
  typeof c === 'string' ? log.includes(c) : 'not' in c ? !holds(c.not, log) : 'all' in c ? c.all.every((x) => holds(x, log)) : c.any.some((x) => holds(x, log));

// Alternative prose is an overlay of keys merged over the base text; mechanics untouched. A missing key shows the key itself.
export const textOf = (key: string, base: Texts, overlay?: Texts) => ({ text: overlay?.[key] ?? base[key] ?? key, changed: overlay?.[key] !== undefined });
export const fill = (s: string, vars?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m));

// Every "if / otherwise" branch is kept; the first case whose condition holds (no condition = otherwise) is marked applied.
export function pageView(page: Page, base: Texts, log: readonly string[], overlay?: Texts): Node[] {
  const go = (e: Entry): Node => {
    switch (e.t) {
      case 'text': case 'header': case 'footnote': {
        const x = textOf(e.key, base, overlay);
        return { t: e.t, ...x, text: fill(x.text, e.t === 'text' ? e.vars : undefined), ...(e.t === 'header' && e.level !== undefined ? { level: e.level } : {}), ...(e.t === 'footnote' ? { n: e.n } : {}) };
      }
      case 'list': return { t: 'list', items: e.items.map(go) };
      case 'branch': {
        const i = e.cases.findIndex((c) => c.when === undefined || holds(c.when, log));
        return { t: 'branch', cases: e.cases.map((c, j) => ({ ...(c.when !== undefined ? { when: c.when } : {}), applied: j === i, node: go(c.entry) })) };
      }
      case 'mod': return { t: 'mod', mods: e.mods, node: go(e.entry) };
      case 'card': return { t: 'card', card: e.card, ...(e.note !== undefined ? { note: fill(textOf(e.note, base, overlay).text) } : {}) };
      case 'icon': return { t: 'icon', icon: e.icon };
    }
  };
  return page.entries.map(go);
}

export function pageProblems(page: Page, base: Texts): string[] {
  const out: string[] = [];
  const go = (e: Entry): void => {
    if (e.t === 'card') { if (e.note !== undefined && !(e.note in base)) out.push(`${page.id}: missing text "${e.note}"`); }
    else if (e.t === 'text' || e.t === 'header' || e.t === 'footnote') { if (!(e.key in base)) out.push(`${page.id}: missing text "${e.key}"`); }
    else if (e.t === 'list') e.items.forEach(go);
    else if (e.t === 'branch') { e.cases.forEach((c) => go(c.entry)); if (e.cases.length === 0) out.push(`${page.id}: empty branch`); }
    else if (e.t === 'mod') go(e.entry);
  };
  page.entries.forEach(go);
  return out;
}
