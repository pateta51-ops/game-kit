// K487: a card test that carries its clause id, the clause's printed text word for word and the ruling id it follows.
// `runInventory` reads these calls from the test files' text (`cardCasesIn`), so keep the three as string literals.
import { it } from 'vitest';
import type { CardCaseInfo } from './inventory.ts';

export { cardCasesIn, type CardCaseInfo } from './inventory.ts';

export const cardCaseLog: CardCaseInfo[] = [];

export function cardCase(c: CardCaseInfo, fn: (c: CardCaseInfo) => unknown): void {
  cardCaseLog.push(c);
  it(c.title === undefined ? c.clause : `${c.clause} ${c.title}`, () => fn(c));
}
