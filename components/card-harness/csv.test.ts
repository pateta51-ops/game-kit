import { expect, it } from 'vitest';
import { conforms, parseCsv, type Is } from './index';

it('parseCsv reads quotes, doubled quotes, CRLF and short rows', () => {
  expect(parseCsv('id,text\r\na,"x, ""y"""\nb\n\n')).toEqual([{ id: 'a', text: 'x, "y"' }, { id: 'b', text: '' }]);
  expect(parseCsv('')).toEqual([]);
  expect(parseCsv('﻿id\na')).toEqual([{ id: 'a' }]);
});
it('Is equates a mutable inferred type with a readonly game type', () => {
  conforms<Is<{ a: string[]; b?: { c: number } }, { readonly a: readonly string[]; readonly b?: { readonly c: number } }>>();
  expect(true).toBe(true);
});
