// Native keyboard, focus and touch checks for the public UI composition; no HTTP server is needed.
// As in the other browser suites, missing Chromium skips locally and fails on CI.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAVE = existsSync(chromium.executablePath());

describe.skipIf(!HAVE && !process.env['CI'])('modal, board shortcuts and attachments in Chromium', () => {
  let browser: Browser;
  let script = '';
  let css = '';
  beforeAll(async () => {
    const bundle = await build({ entryPoints: [resolve('tests/fixtures/ui-keyboard.tsx')], bundle: true, format: 'iife',
      outfile: 'ui-keyboard.js', write: false, logLevel: 'silent' });
    script = bundle.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
    css = bundle.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
    expect(script).not.toBe('');
    browser = await chromium.launch();
  });
  afterAll(async () => { await browser?.close(); });

  const mount = async (page: Page) => {
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
    await page.addStyleTag({ content: css + '\nbody{font:16px system-ui;margin:16px}button,input{font:inherit;min-height:44px}main{display:grid;gap:12px}output{display:block}' });
    await page.addScriptTag({ content: script });
    await page.getByRole('button', { name: 'Open modal', exact: true }).waitFor();
  };
  const values = async (page: Page) => page.locator('output').allTextContents();
  const focusBody = async (page: Page) => page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });

  it('contains Tab, isolates keys, closes the top dialog and restores focus before shortcuts resume', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Arm board pick' }).click();
      await page.getByRole('button', { name: 'Open modal', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Board decision', exact: true });
      await modal.waitFor({ state: 'visible' });
      expect(await page.getByRole('textbox', { name: 'Decision note' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.type('1e');
      await page.keyboard.press('Enter');
      expect(await values(page)).toEqual(['0', '0', '0', '0', 'card', '0', '0']);
      await page.keyboard.press('Shift+Tab');
      expect(await page.getByRole('button', { name: 'Close modal' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('textbox', { name: 'Decision note' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'Open nested dialog' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Enter');
      await page.getByRole('dialog', { name: 'Nested decision', exact: true }).waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Nested decision', exact: true }).waitFor({ state: 'hidden' });
      expect(await modal.isVisible()).toBe(true);
      expect(await page.getByRole('button', { name: 'Open nested dialog' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('1');
      await page.keyboard.press('e');
      expect(await values(page)).toEqual(['0', '0', '0', '0', 'card', '0', '0']);
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden' });
      expect(await page.getByRole('button', { name: 'Open modal', exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
      await focusBody(page);
      await page.keyboard.press('1');
      await page.keyboard.press('e');
      await page.keyboard.press('Enter');
      expect(await values(page)).toEqual(['1', '1', '0', '1', 'none', '0', '0']);
      await page.getByRole('textbox', { name: 'Board note' }).focus();
      await page.keyboard.type('1e');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      expect(await values(page)).toEqual(['1', '1', '0', '1', 'none', '0', '0']);
    } finally { await page.close(); }
  });

  it('reads attachments once per key and leaves native nested button activation alone', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const attachment = page.locator('[data-part="attachment"]').first();
      await attachment.focus();
      await page.keyboard.press('Enter');
      expect(await page.getByTestId('reads').textContent()).toBe('1');
      const scroll = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Space');
      expect(await page.getByTestId('reads').textContent()).toBe('2');
      expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
      await page.getByRole('button', { name: 'Attachment action', exact: true }).last().focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      expect(await page.getByTestId('reads').textContent()).toBe('2');
      expect(await page.getByTestId('child-actions').textContent()).toBe('2');
    } finally { await page.close(); }
  });

  it('detects the original missing-role fault when it is deliberately reintroduced', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open modal', exact: true }).click();
      await page.getByRole('button', { name: 'Open nested dialog' }).focus();
      await page.getByRole('dialog', { name: 'Board decision', exact: true }).evaluate((el) => el.removeAttribute('role'));
      await page.keyboard.press('e');
      expect(await page.getByTestId('phases').textContent()).toBe('1');
    } finally { await page.close(); }
  });

  it('keeps a narrow touch modal within the viewport and leaves the underlying sheet open', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open sheet', exact: true }).tap();
      const sheet = page.getByRole('dialog', { name: 'Board sheet', exact: true });
      await sheet.waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Modal above sheet' }).tap();
      const modal = page.getByRole('dialog', { name: 'Board decision', exact: true });
      await modal.waitFor({ state: 'visible' });
      const box = await modal.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.y + box!.height).toBeLessThanOrEqual(844);
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden' });
      expect(await sheet.isVisible()).toBe(true);
      expect(await page.getByRole('button', { name: 'Modal above sheet' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.getByRole('button', { name: 'Close', exact: true }).tap();
      await sheet.waitFor({ state: 'hidden' });
      expect(await page.getByRole('button', { name: 'Open sheet', exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
      expect(await page.getByTestId('clears').textContent()).toBe('0');
    } finally { await page.close(); }
  });
});
