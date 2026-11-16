// Browser step for a game's e2e run: visit each route, fail every visible text element under `minPx` computed font size.
// `page` is a Playwright Page (goto, evaluate). Returns "route: text (Npx)" lines; empty is clean.
export interface FontPage {
  goto(url: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}
export interface SmallText {
  text: string;
  px: number;
}

export function smallText(minPx: number): SmallText[] {
  const out: SmallText[] = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const text = (n.textContent ?? '').trim();
    const el = n.parentElement;
    if (!text || !el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    const px = parseFloat(cs.fontSize);
    if (px < minPx) out.push({ text: text.slice(0, 40), px });
  }
  return out;
}

export async function fontSizeFindings(page: FontPage, routes: readonly string[], minPx: number): Promise<string[]> {
  const out: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    for (const f of await page.evaluate(smallText, minPx)) out.push(`${route}: ${JSON.stringify(f.text)} (${String(f.px)}px)`);
  }
  return out;
}

export interface PhonePage extends FontPage {
  setViewportSize(size: { width: number; height: number }): Promise<unknown>;
}
export async function phoneFontFindings(page: PhonePage, routes: readonly string[], minPx = 26, size = { width: 390, height: 844 }): Promise<string[]> {
  await page.setViewportSize(size);
  return fontSizeFindings(page, routes, minPx);
}
