// Shared check for the UI machine tests: an illegal event throws an IllegalTransitionError whose message carries what an
// agent needs (machine, state, event, allowed events, the table's file:line, the map and the fix line).
import { expect } from 'vitest';
import { IllegalTransitionError, MACHINES_DOC, type AnyMachine } from './machine.ts';

export function expectIllegal(run: () => unknown, m: AnyMachine, state: string, event: string): IllegalTransitionError {
  let error: unknown;
  try {
    run();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(IllegalTransitionError);
  const e = error as IllegalTransitionError;
  expect([e.machine, e.state, e.event]).toEqual([m.id, state, event]);
  expect(e.message).toContain(`[machine ${m.id}]`);
  expect(e.message).toContain(`"${state}"`);
  expect(e.message).toContain(`Allowed from "${state}":`);
  expect(e.message).toContain(`Table: ${m.describe.source}:${String(m.line)}`);
  expect(m.line).toBeGreaterThan(0);
  expect(e.message).toContain(MACHINES_DOC);
  expect(e.message).toContain(`npm run machines -- ${m.id}`);
  expect(e.message).toContain('Fix: ');
  return e;
}
