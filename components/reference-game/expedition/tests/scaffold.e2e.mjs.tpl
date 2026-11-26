import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const port = Number(process.env.E2E_PORT ?? {{e2e}});
assert(Number.isInteger(port) && port > 0 && port <= 65535);
const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/`);
  for (const [index, points] of [[0, 8], [1, 12]]) {
    await page.getByLabel('Route', { exact: true }).selectOption(String(index));
    for (let spent = 0; spent < points; spent++) {
      await page.getByTestId('expedition-status').filter({ hasText: `${points - spent} action points remain.` }).waitFor();
      const attack = page.getByRole('button', { name: 'Attack guard', exact: true });
      const explore = page.getByRole('button', { name: 'Explore the frontier', exact: true });
      if (await attack.count()) await attack.click();
      else if (await explore.count()) await explore.click();
      else {
        const moves = await page.getByRole('button', { name: /^Move to c\d+$/ }).allTextContents();
        const next = moves.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))[0];
        assert(next, 'a nonterminal expedition must offer an action');
        await page.getByRole('button', { name: next, exact: true }).click();
      }
    }
    await page.getByText('You reached the exit.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Expedition board' }).getByRole('button', { name: 'Attack guard' }).count(), 0);
  }
  console.log('Expedition browser acceptance passed: both routes, attacks, growth and last-point exits');
} finally { try { await browser?.close(); } finally { await server.close(); } }
