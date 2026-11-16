// The bug report's screenshot embeds the game's fonts (the FontFace API leaves no @font-face rule for the capture to copy).
import { describe, expect, it, vi } from 'vitest';

const toPng = vi.fn((..._a: unknown[]) => Promise.resolve('data:image/png;base64,' + 'A'.repeat(200)));
vi.mock('html-to-image', () => ({ toPng: (...a: unknown[]) => toPng(...a) }));

import { buildFontEmbedCss, captureScreen } from './capture.ts';
import { bugConfig, configureBugReporter } from './config.ts';
import './test-utils.ts';

describe('capture fonts', () => {
  it('writes one @font-face per readable file and skips the unreadable', async () => {
    const css = await buildFontEmbedCss(
      [
        { family: 'A', weight: 700, style: 'normal', url: 'a', format: 'woff2' },
        { family: 'B', weight: 400, style: 'italic', url: 'missing', format: 'woff2' },
      ],
      (url) => Promise.resolve(url === 'a' ? 'data:font/woff2;base64,AAAA' : null),
    );
    expect(css).toBe(
      "@font-face{font-family:'A';font-weight:700;font-style:normal;src:url(data:font/woff2;base64,AAAA) format('woff2');}",
    );
  });

  it('hands the fonts the game lists to the capture as fontEmbedCSS, and none when it lists none', async () => {
    expect(await captureScreen()).not.toBeNull();
    expect((toPng.mock.calls[0]?.[1] as Record<string, unknown>)['fontEmbedCSS']).toBeUndefined();
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) }));
    configureBugReporter({
      ...bugConfig(),
      fonts: () => [{ family: 'Game', weight: 400, style: 'normal', url: '/f.woff2', format: 'woff2' }],
    });
    await captureScreen();
    expect(String((toPng.mock.calls[1]?.[1] as Record<string, unknown>)['fontEmbedCSS'])).toContain(
      "font-family:'Game'",
    );
    vi.unstubAllGlobals();
  });
});
