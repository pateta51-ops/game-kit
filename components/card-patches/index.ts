export type Card = { code: string } & Record<string, unknown>;
export type PatchRow = { code: string; patch?: true } & Record<string, unknown>;
export type PatchFile = { reason: string; rows: PatchRow[] };
export type PatchLog = { reason: string; code: string; fields: string[] }[];

// Source cards are never edited: returns new cards. Files apply in the order given (later wins on the same field).
// A `patch: true` row changes the card with that code (a missing code throws); any other row adds a card (a duplicate code throws).
export function applyPatches(cards: readonly Card[], files: PatchFile[], log?: PatchLog): Card[] {
  const out = new Map<string, Card>(cards.map((c) => [c.code, c]));
  for (const { reason, rows } of files) {
    for (const { patch, ...row } of rows) {
      const cur = out.get(row.code);
      if (patch) {
        if (!cur) throw new Error(`patch "${reason}": no card ${row.code}`);
        out.set(row.code, { ...cur, ...row });
      } else {
        if (cur) throw new Error(`patch "${reason}": card ${row.code} already exists`);
        out.set(row.code, row);
      }
      log?.push({ reason, code: row.code, fields: Object.keys(row).filter((k) => k !== 'code') });
    }
  }
  return [...out.values()];
}

export type DiffPart = { op: 'same' | 'del' | 'ins'; text: string };
export type Erratum = { code: string; field: string; printed: unknown; played: unknown; diff?: DiffPart[] };
export type Ruling = { question: string; ruling: string; citation?: string; date?: string };

// Word diff by longest common subsequence; parts keep their spaces, equal neighbours are merged.
export function wordDiff(printed: string, played: string): DiffPart[] {
  const a = printed.match(/\s+|\S+/g) ?? [], b = played.match(/\s+|\S+/g) ?? [];
  const n = a.length, m = b.length;
  const l = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) l[i]![j] = a[i] === b[j] ? l[i + 1]![j + 1]! + 1 : Math.max(l[i + 1]![j]!, l[i]![j + 1]!);
  const out: DiffPart[] = [];
  const add = (op: DiffPart['op'], text: string) => {
    const last = out[out.length - 1];
    if (last?.op === op) last.text += text; else out.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { add('same', a[i]!); i++; j++; }
    else if (i < n && (j === m || l[i + 1]![j]! >= l[i]![j + 1]!)) add('del', a[i++]!);
    else add('ins', b[j++]!);
  }
  return out;
}

// Fields of each card that differ between the source and the patched data (as printed / as played); string fields carry a word diff.
// `fields` limits the fields looked at; an added card (no source) has no erratum.
export function errata(source: readonly Card[], played: readonly Card[], fields?: readonly string[]): Erratum[] {
  const src = new Map(source.map((c) => [c.code, c]));
  const out: Erratum[] = [];
  for (const card of played) {
    const old = src.get(card.code);
    if (!old) continue;
    for (const field of fields ?? new Set([...Object.keys(old), ...Object.keys(card)])) {
      const o = old[field], p = card[field];
      if (field === 'code' || JSON.stringify(o) === JSON.stringify(p)) continue;
      const e: Erratum = { code: card.code, field, printed: o, played: p };
      if (typeof o === 'string' && typeof p === 'string') e.diff = wordDiff(o, p);
      out.push(e);
    }
  }
  return out;
}

// Rulings keyed by card code; newest date first (undated last), otherwise in the given order.
export function rulingsFor(rulings: Readonly<Record<string, readonly Ruling[]>>, code: string): Ruling[] {
  return (rulings[code] ?? []).map((r, i) => ({ r, i })).sort((x, y) => (y.r.date ?? '').localeCompare(x.r.date ?? '') || x.i - y.i).map((x) => x.r);
}
export * from './compare.ts';
