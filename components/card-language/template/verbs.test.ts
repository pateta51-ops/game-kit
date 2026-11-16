// Copy beside verbs.ts. One example step per verb: it validates, prints words with no rule id, and the verb has a handler
// and a text generator. Once cards exist, add card-harness `describeCheck` (generated words equal the printed ones).
import { describe, it } from 'vitest';
import { expectVerbs } from '../index.ts';
import { VERBS, type Step } from './verbs.ts';

const EXAMPLES: Step[] = [{ op: 'todo', note: 'Replace me.' }];

describe('card language', () => {
  it('every verb has a handler, a text generator and a valid example', () => {
    expectVerbs(VERBS, EXAMPLES);
  });
});
