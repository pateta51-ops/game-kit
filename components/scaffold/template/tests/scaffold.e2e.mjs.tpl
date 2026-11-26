import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

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
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('[data-part="setup"] button[type="submit"]').click();
  await page.getByText('Steps: 0', { exact: true }).waitFor();
  await page.getByTestId('step').click();
  await page.getByText('Steps: 1', { exact: true }).waitFor();
  const undo = page.getByTestId('undo');
  await undo.click();
  await page.getByText('Steps: 0', { exact: true }).waitFor();
  assert.equal(await undo.isDisabled(), true);
  console.log('Scaffold browser smoke passed: menu, setup, step, undo');
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
