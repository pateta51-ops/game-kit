import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chip, Token } from './Pieces3d.tsx';
import { startTokenLayer } from './tokenGl.ts';

describe('pieces-3d: Chip tilt', () => {
  it('tilt sets --piece-tilt on the chip; without it nothing is set', () => {
    const a = render(<Chip tilt="20deg" src="a.png" alt="a" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(a.style.getPropertyValue('--piece-tilt')).toBe('20deg');
    const b = render(<Chip src="b.png" alt="b" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(b.getAttribute('style')).toBeNull();
  });
});

describe('pieces-3d: Chip dieCut', () => {
  it('dieCut marks the chip and its css turns the rectangle layers off', () => {
    const a = render(<Chip dieCut src="a.webp" alt="a" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(a.classList.contains('p3-diecut')).toBe(true);
    expect(a.hasAttribute('data-p3-diecut')).toBe(true);
    const b = render(<Chip src="b.png" alt="b" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(b.classList.contains('p3-diecut')).toBe(false);
    expect(b.hasAttribute('data-p3-diecut')).toBe(false);
    const css = readFileSync(join(__dirname, 'pieces3d.css'), 'utf8');
    expect(css).toMatch(/\.p3-chip\.p3-diecut::before,\.p3-chip\.p3-diecut::after\{display:none\}/);
    expect(css).toMatch(/\.p3-chip\.p3-diecut>img\{transform:none;filter:drop-shadow/);
  });
});

// A stub WebGL context that records calls, a 2D context whose pixels are a disc, an Image that loads at once and a laid-out
// element size: enough for the token layer to trace, build and really draw in jsdom.
function stubGl() {
  const lose = vi.fn(), calls: string[] = [], log: unknown[][] = [];
  const gl = new Proxy({}, { get: (_, k: string) => (/^[A-Z_0-9]+$/.test(k) ? 1 : k === 'getExtension' ? (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: lose } : null) : k === 'getProgramParameter' ? () => true : k === 'getAttribLocation' ? () => 0 : (...a: unknown[]) => { calls.push(k); log.push([k, ...a]); return a.length ? {} : {}; }) });
  const disc = (w: number, h: number) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) < Math.min(w, h) / 2 - 2) d.set([200, 100, 50, 255], (y * w + x) * 4); return d; };
  const g2 = { drawImage: () => {}, clearRect: () => {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: disc(w, h) }) };
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (k: string) { return k === 'webgl' ? gl : k === '2d' ? g2 : null; } as unknown as typeof orig;
  vi.stubGlobal('Image', class { naturalWidth = 80; naturalHeight = 80; onload: (() => void) | null = null; onerror: (() => void) | null = null; s = ''; get src() { return this.s; } set src(v: string) { this.s = v; setTimeout(() => this.onload?.(), 0); } });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  const ow = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(75), oh = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(60);
  return { lose, calls, log, restore: () => { HTMLCanvasElement.prototype.getContext = orig; vi.unstubAllGlobals(); ow.mockRestore(); oh.mockRestore(); } };
}

describe('pieces-3d: Token (K718)', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const orig = HTMLCanvasElement.prototype.getContext;
  afterEach(() => { HTMLCanvasElement.prototype.getContext = orig; });
  const token = (src: string) => render(<Token src={src} mm={{ w: 25, h: 20, thickness: 2 }} pxPerMm={3} tilt={0.3} turn={Math.PI} />).container.querySelector('[data-p3-token]') as HTMLElement;

  it('K718 without WebGL the token is its <Chip dieCut> at mm x pxPerMm, and the layer does not start', () => {
    const t = token('t.png');
    expect([t.style.width, t.style.height, t.getAttribute('data-size'), t.style.getPropertyValue('--chip-thickness')]).toEqual(['75px', '60px', '75,60,6', '6px']);
    expect(t.getAttribute('data-rot')).toBe(`0.3,${String(Math.PI)},0`);
    const chip = t.querySelector('.p3-chip.p3-diecut') as HTMLElement, img = chip.querySelector('img') as HTMLImageElement;
    expect([img.getAttribute('src'), img.style.width, img.style.height]).toEqual(['t.png', '75px', '60px']);
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    expect(startTokenLayer()).toBeNull();
    expect(t.hasAttribute('data-p3-drawn')).toBe(false);
    expect(t.querySelector('canvas')).toBeNull();
    const css = readFileSync(join(__dirname, 'pieces3d.css'), 'utf8');
    expect(css).toMatch(/\[data-p3-token\]\[data-p3-drawn\]>:not\(\.p3-token-gl\)\{visibility:hidden\}/);
  });

  it('K718 with WebGL the solid is drawn over the chip (data-p3-drawn, a .p3-token-gl canvas); stop() frees the context, removes the canvas and shows the chip again', async () => {
    const s = stubGl();
    try {
      const t = token('drawn.png'), layer = startTokenLayer();
      expect(layer).not.toBeNull();
      await vi.waitFor(() => { expect(t.hasAttribute('data-p3-drawn')).toBe(true); });
      expect(t.querySelectorAll('canvas.p3-token-gl')).toHaveLength(1);
      expect(s.calls).toContain('drawElements');
      expect(layer?.frames()).toBeGreaterThan(0);
      layer?.stop();
      expect(s.lose).toHaveBeenCalledTimes(1);
      expect(t.querySelector('canvas.p3-token-gl')).toBeNull();
      expect(t.hasAttribute('data-p3-drawn')).toBe(false);
      expect(t.querySelector('.p3-chip img')).not.toBeNull();
    } finally { s.restore(); }
  });

  it('K720 recess in mm goes to data-recess in px; the layer draws the token with its hollow and stop() still cleans up; no recess sets nothing', async () => {
    const s = stubGl();
    try {
      const mk = (recess?: { d: number; depth: number; floor?: number; segs?: number }) => render(<Token src="recess.png" mm={{ w: 24.8, h: 24.8, thickness: 2 }} pxPerMm={3} recess={recess} />).container.querySelector('[data-p3-token]') as HTMLElement;
      expect(mk({ d: 19, depth: 1 }).getAttribute('data-recess')).toBe(`${String(19 * 3)},3,0,0,0.8,64`);
      document.body.innerHTML = '';
      const plain = mk(), layer = startTokenLayer(), count = () => s.log.filter((c) => c[0] === 'drawElements').map((c) => c[2] as number);
      await vi.waitFor(() => { expect(plain.hasAttribute('data-p3-drawn')).toBe(true); });
      expect(plain.hasAttribute('data-recess')).toBe(false);
      const base = count().at(-1) ?? 0;
      // the recessed token's mesh: m more front triangles (n + m against n - 2 is m + 2), a wall of 2m, a floor of m - 2: 4m triangles more, m = segs
      const t = mk({ d: 19, depth: 1, floor: 0.6, segs: 40 });
      await vi.waitFor(() => { expect(t.hasAttribute('data-p3-drawn')).toBe(true); });
      expect(t.getAttribute('data-recess')).toBe(`${String(19 * 3)},3,0,0,0.6,40`);
      expect((count().at(-1) ?? 0) - base).toBe(3 * 4 * 40);
      expect(s.log.some((c) => c[0] === 'uniform1f' && c[2] === 0.6)).toBe(true);
      layer?.stop();
      expect(s.lose).toHaveBeenCalledTimes(1);
      expect(t.querySelector('canvas.p3-token-gl')).toBeNull();
      expect(t.hasAttribute('data-p3-drawn')).toBe(false);
    } finally { s.restore(); }
  });
});
