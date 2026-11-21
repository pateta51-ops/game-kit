import { z } from 'zod';
import { parseIconText, type IconSet, type Part, type Syntax } from '../card-parts/text.ts';

export type DossierOptions = {
  readonly icons: IconSet;
  readonly syntax?: Syntax;
  /** The game's text columns, joined in this order (empty ones skipped). */
  readonly textColumns: readonly string[];
  /** Game column name -> shared column name (component_id, deck, name, type, quantity, icons_on_card, art_front, art_back). */
  readonly columns?: Readonly<Record<string, string>>;
  readonly joiner?: string;
  /** Types that are not deck cards: `expand` skips them. */
  readonly notDeck?: readonly string[];
};
export type DossierRecord = {
  id: string; deck: string; name: string; type: string; quantity: number; text: string;
  icons: Extract<Part, { t: 'icon' }>[]; iconsOnCard: number | undefined; artFront: string; artBack: string; extra: Record<string, string>;
};
const SHARED = ['component_id', 'deck', 'name', 'type', 'quantity', 'icons_on_card', 'art_front', 'art_back'];

export function dossierRow(o: DossierOptions) {
  const joiner = o.joiner ?? ' ¶ ';
  const schema = z.record(z.string(), z.string()).transform((raw, ctx): DossierRecord => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) row[o.columns?.[k] ?? k] = v;
    const cols = o.textColumns.map((c) => o.columns?.[c] ?? c);
    const text = cols.map((c) => row[c] ?? '').filter((s) => s !== '').join(joiner);
    const id = row.component_id ?? '';
    const icons = parseIconText(text, o.icons, o.syntax).filter((p): p is Extract<Part, { t: 'icon' }> => p.t === 'icon');
    const given = (row.icons_on_card ?? '').trim();
    const iconsOnCard = given === '' ? undefined : Number(given);
    if (iconsOnCard !== undefined && iconsOnCard !== icons.length) ctx.addIssue({ code: 'custom', message: `component "${id}": icons_on_card is ${given} but the text prints ${String(icons.length)} icons` });
    for (const u of icons.filter((p) => !p.known)) ctx.addIssue({ code: 'custom', message: `component "${id}": unknown icon "${u.name}"` });
    const skip = new Set([...SHARED, ...cols]);
    const q = (row.quantity ?? '').trim();
    return {
      id, deck: row.deck ?? '', name: row.name ?? '', type: row.type ?? '', quantity: q === '' ? 1 : Number(q), text, icons, iconsOnCard,
      artFront: row.art_front ?? '', artBack: row.art_back ?? '',
      extra: Object.fromEntries(Object.entries(row).filter(([k]) => !skip.has(k))),
    };
  });
  const expand = (records: readonly DossierRecord[]): (DossierRecord & { base: string })[] =>
    records.filter((r) => !o.notDeck?.includes(r.type)).flatMap((r) => Array.from({ length: r.quantity }, (_, i) => ({ ...r, base: r.id, id: `${r.id}#${String(i + 1)}` })));
  return { schema, kind: { schema, id: 'id' }, expand };
}
