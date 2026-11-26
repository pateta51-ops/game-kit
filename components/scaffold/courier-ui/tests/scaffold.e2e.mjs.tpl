import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { layoutFindings } from '../kit/theme-check/layout.ts';
import { coverageFindings } from '../kit/theme-check/coverage.ts';
import { phoneFontFindings } from '../kit/theme-check/fonts.ts';
import { forbiddenText, ruleIdFilter } from '../kit/plain-text/index.ts';

const { assembly } = JSON.parse(fs.readFileSync(new URL('../docs/kit-assembly.json', import.meta.url), 'utf8'));
const port = Number(process.env.E2E_PORT ?? {{e2e}});
assert(Number.isInteger(port) && port > 0 && port <= 65_535, 'expected a valid E2E_PORT');
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
  const page = await browser.newPage();
  const timeout = Number(process.env.E2E_TEST_TIMEOUT_MS) || 10_000;
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  const base = `http://127.0.0.1:${port}/`;
  const presentation = async () => {
    const root = page.locator('[data-courier-root]');
    assert((await root.textContent())?.trim(), 'rendered courier UI must be nonempty');
    const fields = await root.evaluate(element => {
      const nodes = [element, ...element.querySelectorAll('*')];
      return [
        ...nodes.filter(node => !node.children.length || node.matches('p,h1,h2,h3,label,legend,button,a,[title],[alt],[placeholder]'))
          .map(node => [node.textContent ?? '', ...['title', 'alt', 'placeholder'].map(key => node.getAttribute(key) ?? '')].join('\n')),
        ...nodes.flatMap(node => [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent ?? '')),
      ];
    });
    for (const text of fields) assert.doesNotMatch(text, forbiddenText(ruleIdFilter({ long: ['COU'], short: [] }).pattern));
    const layout = await layoutFindings(page, {
      zones: '[data-courier-root]', pieces: '[data-testid="courier-board"],button,input,select,a',
      rows: '[data-testid="position"],[data-testid="allowance"],[data-testid="parcel"],[data-testid="result"]',
    });
    assert(layout.pieces > 0, 'expected rendered controls, not an empty layout');
    assert.deepEqual(layout.problems, []);
    assert(await root.evaluate(el => {
      const viewport = el.ownerDocument.documentElement;
      return viewport.scrollWidth <= viewport.clientWidth;
    }), 'courier screen must fit the viewport');
    if (await page.locator('[data-courier-grid]').count()) {
      const board = await layoutFindings(page, { zones: '[data-courier-grid]', pieces: 'button' });
      assert.equal(board.pieces, assembly.board.rows * assembly.board.cols);
      assert.deepEqual(board.problems, []);
      assert(await page.locator('[data-courier-grid]').evaluate(grid => {
        const region = grid.parentElement;
        if (region.scrollWidth <= region.clientWidth) return true;
        region.scrollLeft = region.scrollWidth;
        const visible = grid.lastElementChild.getBoundingClientRect().right <= region.getBoundingClientRect().right + 1;
        region.scrollLeft = 0;
        return visible;
      }), 'the final board column must be reachable within its scroll region');
    }
    const coverage = await coverageFindings(page, { area: '[data-courier-root]', items: 'h1,h2,p,button,fieldset,[data-field],.kit-sav-section' });
    assert(coverage.items > 0, 'expected rendered content, not empty coverage');
    assert.deepEqual(coverage.problems, []);
  };
  const expected = {
    '#/': '[data-entry="setup"]', '#/setup': '[data-field="allowance"] select', '#/play': '[data-testid="courier-board"]',
    '#/settings': '[data-testid="setting-hints"]', '#/saves': '[data-testid="save-new"]',
  };
  const surface = {
    setViewportSize: size => page.setViewportSize(size),
    evaluate: (fn, arg) => page.evaluate(fn, arg),
    async goto(url) {
      await page.goto(url);
      await page.locator(expected[new URL(url).hash]).waitFor();
      await presentation();
    },
  };
  assert.deepEqual(await phoneFontFindings(surface, Object.keys(expected).map(hash => base + hash)), []);
  await page.goto(base);
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('[data-field="allowance"] select').selectOption(String(assembly.allowances[0]));
  await page.locator('[data-part="setup"] button[type="submit"]').click();
  await page.getByText(`Position: ${assembly.depot}`, { exact: true }).waitFor();
  await presentation();
  assert.equal(await page.getByTestId(`move-${assembly.depot}`).isDisabled(), true);
  await page.getByTestId(`move-${assembly.acceptanceRoute[0]}`).click();
  await page.getByText(`Moves left: ${assembly.allowances[0] - 1}`, { exact: true }).waitFor();
  await page.getByTestId('undo').click();
  await page.getByText(`Position: ${assembly.depot}`, { exact: true }).waitFor();
  await page.getByText(`Moves left: ${assembly.allowances[0]}`, { exact: true }).waitFor();
  for (const to of assembly.acceptanceRoute) {
    await page.getByTestId(`move-${to}`).click();
    await page.getByText(`Position: ${to}`, { exact: true }).waitFor();
  }
  await page.getByText('Delivered', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('parcel').textContent(), 'Parcel collected');
  assert.equal(await page.locator('[data-testid^="move-"]:enabled').count(), 0);
  await presentation();
  await page.locator('[data-courier-root]').evaluate(element => element.replaceChildren());
  await assert.rejects(presentation, /nonempty/);
  console.log('Courier browser acceptance passed: nonempty layout, phone fonts, setup, movement cost, undo, pickup, delivery');
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
