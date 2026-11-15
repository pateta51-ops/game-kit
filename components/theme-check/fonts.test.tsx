import { describe, expect, it } from 'vitest';
import { fontSizeFindings, smallText, type FontPage } from './fonts';

const pages: Record<string, string> = {
  '/a': '<p style="font-size:30px">Big</p><span style="font-size:12px">Tiny</span><i hidden style="font-size:5px">Gone</i><b style="display:none;font-size:5px">No</b>',
  '/b': '<p style="font-size:40px">Fine</p>',
};
const fake: FontPage = {
  goto: (u) => {
    document.body.innerHTML = pages[u] ?? '';
    return Promise.resolve();
  },
  evaluate: (fn, arg) => Promise.resolve(fn(arg)),
};

describe('fontSizeFindings', () => {
  it('lists visible text under the minimum, per route', async () => {
    expect(await fontSizeFindings(fake, ['/a', '/b'], 26)).toEqual(['/a: "Tiny" (12px)']);
    expect(smallText(10)).toEqual([]);
  });
});
