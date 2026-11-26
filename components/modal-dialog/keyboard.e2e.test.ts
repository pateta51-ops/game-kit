// Native keyboard, focus and touch checks for the public UI composition; no HTTP server is needed.
// As in the other browser suites, missing Chromium skips locally and fails on CI.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAVE = existsSync(chromium.executablePath());

describe.skipIf(!HAVE && !process.env['CI'])('modal, board shortcuts and attachments in Chromium', () => {
  let browser: Browser;
  let script = '';
  let css = '';
  beforeAll(async () => {
    const bundle = await build({ entryPoints: [resolve('tests/fixtures/ui-keyboard.tsx')], bundle: true, format: 'esm',
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
    await page.addScriptTag({ type: 'module', content: script });
    await page.getByRole('button', { name: 'Open modal', exact: true }).waitFor();
  };
  const values = async (page: Page) => page.locator('output').allTextContents();
  const focusBody = async (page: Page) => page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  const shadowOpener = async (trigger: Locator) => {
    await trigger.evaluate((button: HTMLButtonElement) => {
      const host = document.createElement('div');
      const shadowButton = document.createElement('button');
      shadowButton.textContent = 'Shadow opener';
      shadowButton.addEventListener('click', () => button.click());
      host.attachShadow({ mode: 'open' }).append(shadowButton);
      button.after(host);
    });
    return trigger.page().getByRole('button', { name: 'Shadow opener' });
  };
  const ownsShadowFocus = (el: Element) => {
    const root = el.getRootNode() as ShadowRoot;
    return root.activeElement === el && document.activeElement === root.host;
  };

  it('contains Tab, isolates keys, closes the top dialog and restores focus before shortcuts resume', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Arm board pick' }).click();
      await page.getByRole('button', { name: 'Open modal', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Board decision', exact: true });
      await modal.waitFor({ state: 'visible' });
      expect(await page.getByRole('textbox', { name: 'Decision note', exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.type('1e');
      await page.keyboard.press('Enter');
      expect(await values(page)).toEqual(['0', '0', '0', '0', 'card', '0', '0']);
      await page.keyboard.press('Shift+Tab');
      expect(await page.getByRole('button', { name: 'Close modal' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('textbox', { name: 'Decision note', exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'Open nested dialog' }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'Legend action', exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('textbox', { name: 'Editable decision note', exact: true }).evaluate((el) => el === document.activeElement)).toBe(true);
      await page.getByRole('button', { name: 'Open nested dialog' }).focus();
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

  it('honors an explicitly focused heading that is outside the Tab sequence', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      expect(await page.getByRole('heading', { name: 'Review introduction' }).evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('focuses the first reachable control when initial Tab order starts with a frame', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const control = page.frameLocator('iframe[title="First focus frame"]').locator('button');
      await control.waitFor({ state: 'attached' });
      await page.getByRole('button', { name: 'Open frame-first modal' }).click();
      expect(await control.evaluate((el) => document.activeElement === el && document.hasFocus())).toBe(true);
    } finally { await page.close(); }
  });

  it.for([false, true])('uses the frame fallback when initial focus has no reachable control (opaque: %s)', async (opaque) => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const frame = page.locator('iframe[title="First focus frame"]');
      await frame.evaluate((el: HTMLIFrameElement, sandboxed) => {
        if (sandboxed) el.setAttribute('sandbox', '');
        el.srcdoc = '<p>No reachable control</p>';
      }, opaque);
      await frame.contentFrame().locator('p').waitFor({ state: 'attached' });
      await page.getByRole('button', { name: 'Open frame-first modal' }).click();
      expect(await frame.evaluate((el) => document.activeElement === el)).toBe(true);
    } finally { await page.close(); }
  });

  it('prefers an explicit heading in an open shadow root over the first ordinary tab stop', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.locator('.kc-modal').filter({ hasText: 'Ordered decision' }).evaluate((el) => {
        el.querySelector('[data-autofocus]')!.removeAttribute('data-autofocus');
        const host = document.createElement('div');
        host.attachShadow({ mode: 'open' }).innerHTML = '<h3 tabindex="-1" data-autofocus>Shadow introduction</h3>';
        el.querySelector('.kc-modal-body')!.append(host);
      });
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      expect(await page.getByRole('heading', { name: 'Shadow introduction' }).evaluate(ownsShadowFocus)).toBe(true);
    } finally { await page.close(); }
  });

  it('restores the open-shadow opener when a nested modal closes', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open modal', exact: true }).click();
      const opener = await shadowOpener(page.getByRole('button', { name: 'Open nested dialog' }));
      await opener.click();
      const nested = page.getByRole('dialog', { name: 'Nested decision' });
      await nested.waitFor();
      await page.keyboard.press('Escape');
      await nested.waitFor({ state: 'hidden' });
      expect(await opener.evaluate(ownsShadowFocus)).toBe(true);
    } finally { await page.close(); }
  });

  it('restores the open-shadow opener when a sheet closes', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const opener = await shadowOpener(page.getByRole('button', { name: 'Open sheet', exact: true }));
      await opener.click();
      const sheet = page.getByRole('dialog', { name: 'Board sheet' });
      await sheet.waitFor();
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached' });
      expect(await opener.evaluate(ownsShadowFocus)).toBe(true);
    } finally { await page.close(); }
  });

  it('contains Tab with positive tabindex values and a background tab stop between them', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      const defaultAction = page.getByRole('button', { name: 'Default action' });
      const first = page.getByRole('button', { name: 'First priority' });
      const third = page.getByRole('button', { name: 'Third priority' });
      await defaultAction.focus();
      await page.keyboard.press('Tab');
      expect(await first.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await third.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await first.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await defaultAction.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('lets the enclosing modal own Escape when a nonmodal dialog is nested inside it', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const opener = page.getByRole('button', { name: 'Open ordered modal' });
      await opener.click();
      await page.getByRole('button', { name: 'First priority' }).focus();
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog', { name: 'Ordered decision' }).isVisible()).toBe(false);
      expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
      expect(await page.getByTestId('clears').textContent()).toBe('0');
    } finally { await page.close(); }
  });

  it('wraps around the checked member of a radio group without leaving the modal', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open radio modal' }).click();
      const checked = page.getByRole('radio', { name: 'First choice' });
      await checked.focus();
      await page.keyboard.press('Tab');
      expect(await checked.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await checked.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('wraps past an unchecked modal radio when its checked group member is on the background board', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open shared radio modal' }).click();
      const local = page.getByRole('button', { name: 'Local action' });
      await local.focus();
      await page.keyboard.press('Tab');
      expect(await local.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('follows native Tab into a final iframe and wraps after its last control', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open frame modal' }).click();
      const before = page.getByRole('button', { name: 'Before frame' });
      const iframe = page.locator('iframe[title="Embedded controls"]');
      const embedded = iframe.contentFrame().getByRole('button', { name: 'Frame action' });
      await embedded.waitFor();
      await before.focus();
      await page.keyboard.press('Tab');
      expect(await embedded.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await before.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('scrolls a manual Tab target into view in a narrow, overflowing modal', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 460 } });
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open scrolling modal' }).click();
      const first = page.getByRole('button', { name: 'First scroll action' });
      const last = page.getByRole('button', { name: 'Last scroll action' });
      const visibleFocus = (el: Element) => {
        const panel = el.closest('[role="dialog"]')!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return document.activeElement === el && box.top >= panel.top && box.bottom <= panel.bottom;
      };
      expect(await first.evaluate(visibleFocus)).toBe(true);
      expect((await last.boundingBox())!.y).toBeGreaterThan(460);
      await page.keyboard.press('Tab');
      expect(await last.evaluate(visibleFocus)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await first.evaluate(visibleFocus)).toBe(true);
    } finally { await page.close(); }
  });

  it('contains Tab after the final control of a positive-tabindex frame', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered frame modal' }).click();
      const frame = page.frameLocator('iframe[title="Ranked controls"]');
      const first = page.getByRole('button', { name: 'First frame action' });
      const last = page.getByRole('button', { name: 'Last frame action' });
      const start = frame.getByRole('button', { name: 'Frame start' });
      const end = frame.getByRole('button', { name: 'Frame end' });
      await start.waitFor();
      await first.focus();
      await page.keyboard.press('Tab');
      expect(await start.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await end.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await last.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await end.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await start.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await first.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('handles Escape in a same-origin iframe after it reloads', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const opener = page.getByRole('button', { name: 'Open frame modal' });
      await opener.click();
      const iframe = page.locator('iframe[title="Embedded controls"]');
      await iframe.contentFrame().getByRole('button', { name: 'Frame action' }).waitFor();
      const retired = await iframe.evaluateHandle((el: HTMLIFrameElement) => el.contentDocument!);
      await iframe.evaluate((el) => { el.setAttribute('srcdoc', '<button>Reloaded action</button>'); });
      await iframe.contentFrame().getByRole('button', { name: 'Reloaded action' }).focus();
      await retired.evaluate((doc) => doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      expect(await page.getByRole('dialog', { name: 'Native controls' }).isVisible()).toBe(true);
      await retired.dispose();
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog', { name: 'Native controls' }).isVisible()).toBe(false);
      expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it.for([4, 0])('moves directly between adjacent frames when the next tabindex is %s', async (rank) => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open adjacent frames' }).click();
      await page.locator('iframe[title="Next ranked controls"]').evaluate((el: HTMLIFrameElement, index) => {
        el.tabIndex = index;
      }, rank);
      const end = page.frameLocator('iframe[title="Ranked controls"]').getByRole('button', { name: 'Frame end' });
      const start = page.frameLocator('iframe[title="Next ranked controls"]').getByRole('button', { name: 'Frame start' });
      await end.focus();
      await page.keyboard.press('Tab');
      const forwards = await start.evaluate((el) => el === document.activeElement);
      await start.focus();
      await page.keyboard.press('Shift+Tab');
      const backwards = await end.evaluate((el) => el === document.activeElement);
      expect({ forwards, backwards }).toEqual({ forwards: true, backwards: true });
    } finally { await page.close(); }
  });

  it('keeps open-shadow controls in their native scope order within a ranked modal', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      await page.getByRole('dialog', { name: 'Ordered decision' }).evaluate((el) => {
        const host = document.createElement('div');
        el.querySelector('.kc-modal-body')!.append(host);
        host.attachShadow({ mode: 'open' }).innerHTML =
          '<button>Shadow default</button><button tabindex="2">Shadow ranked</button>';
      });
      await page.getByRole('button', { name: 'Default action' }).focus();
      for (const [key, name] of [
        ['Tab', 'Shadow ranked'], ['Tab', 'Shadow default'], ['Tab', 'First priority'],
        ['Shift+Tab', 'Shadow default'], ['Shift+Tab', 'Shadow ranked'], ['Shift+Tab', 'Default action'],
      ] as const) {
        await page.keyboard.press(key);
        expect(await page.getByRole('button', { name }).evaluate((el) => {
          const root = el.getRootNode() as Document | ShadowRoot;
          return root.activeElement === el;
        }), name).toBe(true);
      }
    } finally { await page.close(); }
  });

  it('skips hidden slotted controls and visits visible slotted controls in a ranked modal', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      await page.getByRole('dialog', { name: 'Ordered decision' }).evaluate((el) => {
        const host = document.createElement('div');
        host.innerHTML = '<button slot="hidden">Hidden assigned control</button><button slot="visible">Visible assigned control</button>';
        host.attachShadow({ mode: 'open' }).innerHTML =
          '<div style="display:none"><slot name="hidden"></slot></div><slot name="visible"></slot><button>Visible shadow control</button>';
        el.querySelector('.kc-modal-body')!.append(host);
      });
      await page.getByRole('button', { name: 'Default action' }).focus();
      for (const [key, name] of [
        ['Tab', 'Visible assigned control'], ['Tab', 'Visible shadow control'], ['Tab', 'First priority'],
        ['Shift+Tab', 'Visible shadow control'], ['Shift+Tab', 'Visible assigned control'], ['Shift+Tab', 'Default action'],
      ] as const) {
        await page.keyboard.press(key);
        expect(await page.getByRole('button', { name }).evaluate((el) =>
          (el.getRootNode() as Document | ShadowRoot).activeElement === el), name).toBe(true);
      }
    } finally { await page.close(); }
  });

  it('suppresses fallback Tab stops when a slot is assigned text', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      await page.getByRole('dialog', { name: 'Ordered decision' }).evaluate((el) => {
        const host = document.createElement('div');
        host.innerHTML = 'Assigned text<button slot="assigned">Assigned element</button>';
        host.attachShadow({ mode: 'open' }).innerHTML =
          '<slot><button>Suppressed by text</button></slot>' +
          '<slot name="empty"><button>Unassigned fallback</button></slot>' +
          '<slot name="assigned"><button>Suppressed by element</button></slot>';
        el.querySelector('.kc-modal-body')!.append(host);
      });
      await page.getByRole('button', { name: 'Default action' }).focus();
      for (const [key, name] of [
        ['Tab', 'Unassigned fallback'], ['Tab', 'Assigned element'], ['Tab', 'First priority'],
        ['Shift+Tab', 'Assigned element'], ['Shift+Tab', 'Unassigned fallback'], ['Shift+Tab', 'Default action'],
      ] as const) {
        await page.keyboard.press(key);
        expect(await page.getByRole('button', { name }).evaluate((el) =>
          (el.getRootNode() as Document | ShadowRoot).activeElement === el), name).toBe(true);
      }
    } finally { await page.close(); }
  });

  it('includes image-map links only when their image is visible in a ranked modal', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open ordered modal' }).click();
      await page.getByRole('dialog', { name: 'Ordered decision' }).evaluate((el) => {
        const body = el.querySelector('.kc-modal-body')!;
        const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        for (const name of ['visible-map', 'hidden-map']) {
          const map = document.createElement('map');
          map.name = name;
          const area = document.createElement('area');
          area.href = '#' + name;
          area.alt = name;
          area.shape = 'rect';
          area.coords = '0,0,40,40';
          map.append(area);
          const img = document.createElement('img');
          img.src = pixel;
          img.useMap = '#' + name;
          img.width = img.height = 40;
          img.hidden = name === 'hidden-map';
          body.append(img, map);
        }
      });
      await page.locator('img[usemap="#visible-map"]').evaluate((el: HTMLImageElement) => el.decode());
      await page.getByRole('button', { name: 'Default action' }).focus();
      await page.keyboard.press('Tab');
      expect(await page.locator('area[href="#visible-map"]').evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'First priority' }).evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('leaves Escape to a frame whose document is inaccessible to the modal', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open frame modal' }).click();
      const iframe = page.locator('iframe[title="Embedded controls"]');
      await iframe.evaluate((el) => {
        el.setAttribute('sandbox', '');
        el.setAttribute('srcdoc', '<button>Sandboxed action</button>');
      });
      await iframe.contentFrame().getByRole('button', { name: 'Sandboxed action' }).focus();
      expect(await iframe.evaluate((el: HTMLIFrameElement) => el.contentDocument === null)).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog', { name: 'Native controls' }).isVisible()).toBe(true);
    } finally { await page.close(); }
  });

  it('handles Escape in a frame within an open shadow root', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const opener = page.getByRole('button', { name: 'Open frame modal' });
      await opener.click();
      const modal = page.getByRole('dialog', { name: 'Native controls' });
      await modal.evaluate((el) => {
        const host = document.createElement('div');
        host.id = 'shadow-frame-host';
        el.querySelector('.kc-modal-body')!.append(host);
      });
      await page.locator('#shadow-frame-host').evaluate((host) => {
        const frame = document.createElement('iframe');
        frame.title = 'Shadow frame';
        frame.srcdoc = '<button>Shadow frame action</button>';
        host.attachShadow({ mode: 'open' }).append(frame);
      });
      await page.frameLocator('iframe[title="Shadow frame"]').getByRole('button', { name: 'Shadow frame action' }).focus();
      await page.keyboard.press('Escape');
      expect(await modal.isVisible()).toBe(false);
      expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('handles Escape in a nested same-origin frame added after the outer frame loads', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const opener = page.getByRole('button', { name: 'Open frame modal' });
      await opener.click();
      const outer = page.frameLocator('iframe[title="Embedded controls"]');
      await outer.getByRole('button', { name: 'Frame action' }).waitFor();
      await page.locator('iframe[title="Embedded controls"]').evaluate((el: HTMLIFrameElement) => {
        const doc = el.contentDocument!;
        const frame = doc.createElement('iframe');
        frame.title = 'Nested frame';
        frame.srcdoc = '<button>Nested frame action</button>';
        doc.body.append(frame);
      });
      await outer.frameLocator('iframe[title="Nested frame"]').getByRole('button', { name: 'Nested frame action' }).focus();
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog', { name: 'Native controls' }).isVisible()).toBe(false);
      expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('lets the enclosing sheet handle Escape from a nested nonmodal dialog', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open sheet', exact: true }).click();
      await page.getByRole('button', { name: 'Sheet support action' }).focus();
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog', { name: 'Board sheet', exact: true }).isVisible()).toBe(false);
      expect(await page.getByTestId('clears').textContent()).toBe('0');
    } finally { await page.close(); }
  });

  it('keeps focus in a modal when its underlying sheet unmounts', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open sheet', exact: true }).click();
      await page.getByRole('button', { name: 'Modal above sheet' }).click();
      const modal = page.getByRole('dialog', { name: 'Board decision' });
      const close = modal.getByRole('button', { name: 'Close modal' });
      await close.focus();
      await modal.getByRole('button', { name: 'Dismiss underlying sheet' }).evaluate((el: HTMLButtonElement) => el.click());
      await page.getByRole('dialog', { name: 'Board sheet', exact: true }).waitFor({ state: 'detached' });
      expect(await close.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('retains native Enter on a board disclosure when a board pick is armed', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Arm board pick' }).click();
      await page.locator('summary').filter({ hasText: 'Board disclosure' }).focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('details[open]').filter({ hasText: 'Board disclosure' }).count()).toBe(1);
      expect(await page.getByTestId('answers').textContent()).toBe('0');
      expect(await page.getByTestId('armed').textContent()).toBe('card');
    } finally { await page.close(); }
  });

  it('retains native Enter on a linked map area while an unlinked area leaves the board pick in control', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.evaluate(() => {
        document.querySelector('main')!.insertAdjacentHTML('beforeend',
          '<img usemap="#board-map" width="40" height="40" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">' +
          '<map name="board-map"><area href="#map-result" shape="rect" coords="0,0,20,40" alt="Map link">' +
          '<area tabindex="0" shape="rect" coords="20,0,40,40" alt="Unlinked region"></map>');
        const link = document.querySelector<HTMLAreaElement>('area[href="#map-result"]')!;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          link.dataset.activated = 'true';
        });
      });
      await page.locator('img[usemap="#board-map"]').evaluate((el: HTMLImageElement) => el.decode());
      await page.getByRole('button', { name: 'Arm board pick' }).click();
      const linked = page.locator('area[href="#map-result"]');
      await linked.focus();
      await page.keyboard.press('Enter');
      expect(await linked.getAttribute('data-activated')).toBe('true');
      expect(await page.getByTestId('answers').textContent()).toBe('0');
      expect(await page.getByTestId('armed').textContent()).toBe('card');
      const unlinked = page.locator('area[alt="Unlinked region"]');
      await unlinked.focus();
      expect(await unlinked.evaluate((el) => document.activeElement === el)).toBe(true);
      await page.keyboard.press('Enter');
      expect(await page.getByTestId('answers').textContent()).toBe('1');
      expect(await page.getByTestId('armed').textContent()).toBe('none');
    } finally { await page.close(); }
  });

  it('retains native Enter on an open-shadow button while a board pick is armed', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Arm board pick' }).click();
      const button = await shadowOpener(page.getByRole('button', { name: 'Numbered action' }));
      await button.focus();
      await page.keyboard.press('Enter');
      expect(await values(page)).toEqual(['1', '0', '0', '0', 'card', '0', '0']);
    } finally { await page.close(); }
  });

  it('retains native Enter on an open-shadow button when play keys have a confirm target', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Arm board pick' }).evaluate((el) => el.setAttribute('data-confirm', ''));
      const button = await shadowOpener(page.getByRole('button', { name: 'Numbered action' }));
      await button.focus();
      await page.keyboard.press('Enter');
      expect(await values(page)).toEqual(['1', '0', '0', '0', 'none', '0', '0']);
    } finally { await page.close(); }
  });

  it('keeps prompt numbers, play keys and armed-pick Enter out of an open-shadow input', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Arm board pick' }).click();
      await page.evaluate(() => {
        const host = document.createElement('div');
        host.attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Shadow note">';
        document.querySelector('main')!.append(host);
      });
      const input = page.getByRole('textbox', { name: 'Shadow note' });
      await input.focus();
      await page.keyboard.press('1');
      await page.keyboard.press('e');
      await page.keyboard.press('Enter');
      expect(await values(page)).toEqual(['0', '0', '0', '0', 'card', '0', '0']);
      expect(await input.inputValue()).toBe('1e');
    } finally { await page.close(); }
  });

  it('focuses the summary of a closed disclosure and tab-traps its visible controls', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.getByRole('button', { name: 'Open disclosure modal' }).click();
      const summary = page.locator('summary').filter({ hasText: 'Show explanation' });
      expect(await summary.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Tab');
      expect(await summary.evaluate((el) => el === document.activeElement)).toBe(true);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      expect(await page.getByRole('button', { name: 'Hidden action' }).evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('closes the active modal even when a later nonmodal dialog is visible', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      const opener = page.getByRole('button', { name: 'Open ordered modal' });
      await opener.click();
      await page.evaluate(() => {
        const nonmodal = document.createElement('section');
        nonmodal.setAttribute('role', 'dialog');
        nonmodal.setAttribute('aria-modal', 'false');
        nonmodal.textContent = 'External panel';
        document.body.append(nonmodal);
      });
      await page.keyboard.press('Escape');
      expect(await page.getByRole('dialog', { name: 'Ordered decision' }).isVisible()).toBe(false);
      expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally { await page.close(); }
  });

  it('toggles a nested attachment disclosure without reading the attachment', async () => {
    const page = await browser.newPage();
    try {
      await mount(page);
      await page.locator('summary').filter({ hasText: 'Attachment details' }).focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('details[open]').filter({ hasText: 'Attachment details' }).count()).toBe(1);
      expect(await page.getByTestId('reads').textContent()).toBe('0');
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
      await page.getByText('Toggle attachment', { exact: true }).click();
      expect(await page.getByRole('checkbox', { name: 'Toggle attachment' }).isChecked()).toBe(true);
      expect(await page.getByTestId('reads').textContent()).toBe('2');
      expect(await page.getByTestId('child-actions').textContent()).toBe('3');
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
