import type { CardDef, CardRecord, Level } from './rules.ts';

const DEFS: Record<string, CardDef> = {
  jab: { name: 'Jab', effect: [{ op: 'hit', n: 2 }] },
  blow: { name: 'Blow', effect: [{ op: 'hit', n: 3 }] },
  rally: { name: 'Rally', effect: [{ op: 'boost', n: 2 }] },
  ward: { name: 'Ward', effect: [], stay: true, text: 'If you would take damage, instead discard this.' },
  mend: { name: 'Mend', effect: [], stay: true, when: [{ on: 'damage', if: 'mine', optional: true, then: [{ op: 'heal', n: 1 }] }] },
};
export const CARD_RECORDS: readonly CardRecord[] = Object.entries(DEFS).map(([id, def], i) => ({ id, line: `${id}.1`, copies: [6, 4, 4, 3, 3][i] ?? 0, ...def }));

export const PRINTED_CLAUSES = [
  { id: 'jab.1', card: 'jab', text: 'Deal 2 damage.', rule: 'JAB-01', damage: 2 },
  { id: 'blow.1', card: 'blow', text: 'Deal 3 damage.', rule: 'BLOW-01', damage: 3 },
  { id: 'rally.1', card: 'rally', text: 'Until end of turn, your hits deal 2 more.', rule: 'RALLY-01', family: 'rally' },
  { id: 'ward.1', card: 'ward', text: 'If you would take damage, instead discard this.', rule: 'WARD-01', family: 'ward', conditional: true },
  { id: 'mend.1', card: 'mend', text: 'When you take damage, you may heal 1.', rule: 'MEND-01', family: 'mend', conditional: true },
] as const;

export const CARD_SETUP: { readonly life: readonly [number, number]; readonly rounds: number; readonly level: Level; readonly fixedSeats: boolean } = { life: [10, 10], rounds: 6, level: 'normal', fixedSeats: false };
