// Bug reports: the screenshot of the current screen, taken in the browser at the window's size. html-to-image (1.11.13,
// pinned) draws the page into an SVG image and a canvas; the card faces and marble are same-origin, so they are inlined.
// It loads on first use. Returns the PNG as base64 (no data-URL prefix), or null when the browser cannot.
import { bugConfig, MAX_ATTACHMENT_BASE64 } from './config.ts';
import { type Image } from './github.ts';

/**
 * The elements scrolled away from their origin, with their offsets. The page itself (html, body, #root) is left out: its
 * scroll is the window's, and is drawn through the clone's own transform, never by moving live elements.
 */
export function scrolledElements(root: ParentNode = document): { el: HTMLElement; x: number; y: number }[] {
  const found: { el: HTMLElement; x: number; y: number }[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el === document.documentElement || el === document.body || el.id === 'root') continue;
    if (el.scrollTop > 0 || el.scrollLeft > 0) found.push({ el, x: el.scrollLeft, y: el.scrollTop });
  }
  return found;
}

/**
 * html-to-image redraws a clone of the page, and a clone has no scroll offsets: the screenshot would show the top of every
 * scrolling area. So, for the moment of the capture, the non-fixed children of each scrolled inner element are shifted by its
 * offset (the element itself is reset to the top); the returned function puts everything back. Each step is registered
 * before it is done, so a failure part-way still restores what was changed.
 */
export function freezeScroll(): () => void {
  const undo: (() => void)[] = [];
  const restore = (): void => {
    while (undo.length > 0) undo.pop()?.();
  };
  try {
    for (const { el, x, y } of scrolledElements()) {
      undo.push(() => {
        el.scrollTop = y;
        el.scrollLeft = x;
      });
      for (const k of Array.from(el.children)) {
        if (!(k instanceof HTMLElement) || ['fixed', 'sticky'].includes(getComputedStyle(k).position)) continue;
        const prior = k.style.transform;
        undo.push(() => {
          k.style.transform = prior;
        });
        const own = getComputedStyle(k).transform;
        k.style.transform = `translate(${String(-x)}px, ${String(-y)}px) ${own === 'none' ? '' : own}`;
      }
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

/** One font file to embed in the picture: the family, weight and style it is registered under, and where it is served. */
export interface EmbedFont {
  family: string;
  weight: number;
  style: string;
  url: string;
  format: string;
}

/**
 * html-to-image copies the page's `@font-face` rules into the picture, but a game may register its fonts with the FontFace
 * API, which leaves no rule to copy: the picture, drawn in an isolated SVG image that cannot
 * reach the page's fonts, fell back to Arial Narrow (wider text, "1OUR TURN", lost counters). So the `@font-face` CSS is built
 * here, with each file inlined as a data URL, and handed over as `fontEmbedCSS`. A file that cannot be read is left out.
 */
export async function buildFontEmbedCss(
  fonts: readonly EmbedFont[],
  read: (url: string) => Promise<string | null>,
): Promise<string> {
  const rules = await Promise.all(
    fonts.map(async (f) => {
      const data = await read(f.url);
      if (data === null) return '';
      return `@font-face{font-family:'${f.family}';font-weight:${String(f.weight)};font-style:${f.style};src:url(${data}) format('${f.format}');}`;
    }),
  );
  return rules.filter((r) => r !== '').join('\n');
}

async function readAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let fontCss: Promise<string> | null = null;

export async function captureScreen(): Promise<string | null> {
  let restore: (() => void) | null = null;
  try {
    const { toPng } = await import('html-to-image');
    const sx = window.scrollX;
    const sy = window.scrollY;
    restore = freezeScroll();
    const fonts = bugConfig().fonts?.() ?? [];
    let fontEmbedCSS: string | undefined;
    if (fonts.length > 0) {
      fontCss ??= buildFontEmbedCss(fonts, readAsDataUrl);
      fontEmbedCSS = await fontCss;
      // a font that could not be read (offline, a passing error) is read again on the next capture, not left out for good
      if ((fontEmbedCSS.match(/@font-face/g) ?? []).length < fonts.length) fontCss = null;
    }
    const url = await toPng(document.documentElement, {
      width: window.innerWidth,
      height: window.innerHeight,
      canvasWidth: window.innerWidth,
      canvasHeight: window.innerHeight,
      // the page's own scroll (the window): draw the part that is on screen
      ...(sx > 0 || sy > 0 ? { style: { transform: `translate(${String(-sx)}px, ${String(-sy)}px)` } } : {}),
      pixelRatio: 1,
      cacheBust: false,
      ...(fontEmbedCSS === undefined ? {} : { fontEmbedCSS }),
      // not the dialog or anything marked so
      filter: (node) => !(node instanceof HTMLElement && node.dataset['noCapture'] !== undefined),
    });
    const prefix = 'data:image/png;base64,';
    return url.startsWith(prefix) && url.length > prefix.length + 100 ? url.slice(prefix.length) : null;
  } catch {
    return null;
  } finally {
    restore?.();
  }
}

/**
 * The attachment's screenshot: a JPEG, scaled down (at most 2560 px wide) and re-encoded at falling quality until it fits
 * MAX_ATTACHMENT_BASE64. A 4K PNG of the table is several MB; this is what lets the contents API take it. When the browser
 * cannot draw, the PNG goes as it is (and filing reports it as too big if it is).
 */
export async function compressScreenshot(png: string): Promise<Image> {
  try {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    for (const maxWidth of [2560, 1920, 1280]) {
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (ctx === null) break;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const url = canvas.toDataURL('image/jpeg', quality);
        const prefix = 'data:image/jpeg;base64,';
        if (!url.startsWith(prefix)) break;
        const base64 = url.slice(prefix.length);
        if (base64.length <= MAX_ATTACHMENT_BASE64) return { ext: 'jpg', base64 };
      }
    }
  } catch {
    /* fall through: the PNG as taken */
  }
  return { ext: 'png', base64: png };
}
