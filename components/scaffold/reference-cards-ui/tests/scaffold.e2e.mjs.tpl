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
  await page.getByRole('button', { name: 'New game' }).click();
  assert.equal(await page.locator('[data-seat]').count(), 0, 'the declared composition has fixed human/automa seats');
  await page.locator('[data-part="setup"] button[type="submit"]').click();
  assert(await page.getByTestId('undo').isDisabled());
  await page.locator('[data-kind="may"] [data-option="no"]').click();
  const first = page.locator('[data-kind="pick"] [data-option]:enabled').first();
  await first.waitFor();
  await first.click();
  await page.getByTestId('undo').click();
  await page.locator('[data-kind="pick"]').waitFor();
  let clicks = 0;
  while (!await page.getByTestId('result').count() && clicks++ < 100) {
    const choice = page.locator('[data-kind="may"] [data-option="yes"]:enabled, [data-kind="pick"] [data-option]:enabled').first();
    await choice.waitFor();
    await choice.click();
  }
  await page.getByTestId('result').waitFor();
  const content = await page.locator('main').innerText();
  assert(content.includes('Seat 0 plays') && content.includes('Seat 1 plays'), 'both human play and automated response must execute');
  assert(!/[A-Z]+-\d{2}/.test(content), 'rule identifiers must not be rendered');
  console.log('Card browser acceptance passed: configured setup, draw/play, undo, automated response and terminal game');
} finally { try { await browser?.close(); } finally { await server.close(); } }
