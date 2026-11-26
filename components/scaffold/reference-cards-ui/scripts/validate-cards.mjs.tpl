import assert from 'node:assert/strict';
import { acceptance } from '../tests/acceptance.ts';
const result = acceptance();
assert.deepEqual(result.problems, [], 'configured cards contradict independent expectations or the declared hidden-world contract');
assert(result.hidden, 'configured hidden-world checks must execute');
console.log('Card configuration and bounded rule evidence validated; bootstrap and browser acceptance remain separate execution states');
