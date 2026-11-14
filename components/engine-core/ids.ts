// Deterministic ids: the instance id of a copy of a definition (definition id, a hash and the copy number: C-nn#1), and the
// sequence counters. No clocks and no randomness.
import { EngineBugError } from './errors';

/** The instance id of copy `copy` (from 1) of the card `defId`: C-nn#1. */
export function cardInstanceId(defId: string, copy: number): string {
  if (defId === '' || defId.includes('#'))
    throw new EngineBugError(`cardInstanceId: bad definition id "${defId}"`);
  if (!Number.isInteger(copy) || copy < 1)
    throw new EngineBugError(`cardInstanceId: copy must be a positive integer, got ${String(copy)}`);
  return `${defId}#${String(copy)}`;
}

/** The definition id and copy number of an id made by `cardInstanceId`, or null for anything else. */
export function parseCardInstanceId(id: string): { defId: string; copy: number } | null {
  const match = /^([^#]+)#(\d+)$/.exec(id);
  if (match === null) return null;
  const copy = Number(match[2]);
  return copy >= 1 ? { defId: match[1] as string, copy } : null;
}

/** The next value of a sequence counter (the event `seq` of §6.7), advancing it in place. */
export function takeSeq(s: { seq: number }): number {
  const n = s.seq;
  s.seq = n + 1;
  return n;
}

/** The next prompt id (the `promptSeq` counter of §6.5), advancing it in place. */
export function takePromptSeq(s: { promptSeq: number }): number {
  const n = s.promptSeq;
  s.promptSeq = n + 1;
  return n;
}
