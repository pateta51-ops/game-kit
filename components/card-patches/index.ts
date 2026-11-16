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
