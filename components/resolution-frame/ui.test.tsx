import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolutionSetting, type SettingsSchema } from '../settings/schema.ts';
import { createSettingsStore } from '../settings/store.ts';
import { fitBox, frameHost, shouldFrame, storedResolution } from './index.ts';
import { ResolutionFrame } from './ui.ts';

const schema = {
  storageKey: 'test.res.settings',
  sections: [{ id: 'a', title: 'A', settings: [resolutionSetting('res', 'Resolution', 'Window')] }],
} as const satisfies SettingsSchema;
const PC = { top: true, webdriver: false, phone: false };
const store = (res: string): void => {
  localStorage.setItem(schema.storageKey, JSON.stringify({ state: { values: { res } }, version: 1 }));
};
const frame = (): HTMLIFrameElement => screen.getByTitle<HTMLIFrameElement>('Fake Game');
const resize = (innerWidth: number, innerHeight: number): void => {
  Object.assign(window, { innerWidth, innerHeight });
};

beforeEach(() => {
  localStorage.clear();
  resize(1920, 1080);
});

describe('resolution frame', () => {
  it('fits the chosen size to the window, centred', () => {
    expect(fitBox({ w: 3840, h: 2160 }, { w: 1920, h: 1080 })).toEqual({ scale: 0.5, left: 0, top: 0 });
    expect(fitBox({ w: 1920, h: 1080 }, { w: 3440, h: 1080 })).toEqual({ scale: 1, left: 760, top: 0 });
    expect(fitBox({ w: 1920, h: 1080 }, { w: 1920, h: 1280 })).toEqual({ scale: 1, left: 0, top: 100 });
    const part = fitBox({ w: 1920, h: 1080 }, { w: 1280, h: 800 });
    expect(part.scale).toBeCloseTo(2 / 3);
    expect(part.left).toBeCloseTo(0);
    expect(part.top).toBeCloseTo(40);
    const tiny = fitBox({ w: 3840, h: 2160 }, { w: 1, h: 1 });
    expect(tiny.scale).toBeCloseTo(1 / 3840);
    expect(tiny.scale).toBeGreaterThan(0);
    expect(tiny.top).toBeCloseTo((1 - 2160 / 3840) / 2);
    for (const [size, win] of [
      [{ w: 1920, h: 1080 }, { w: 0, h: 0 }],
      [{ w: 1920, h: 1080 }, { w: 800, h: 0 }],
      [{ w: 0, h: 0 }, { w: 800, h: 600 }],
      [{ w: 0, h: 1080 }, { w: 800, h: 600 }],
      [{ w: Number.NaN, h: 1080 }, { w: 800, h: 600 }],
    ] as const) {
      expect(fitBox(size, win)).toEqual({ scale: 1, left: 0, top: 0 });
    }
  });

  it('frames on the top page of a PC only: not inside a frame, under webdriver, on a phone or for the window choice', () => {
    expect(shouldFrame('1920x1080', PC)).toBe(true);
    expect(shouldFrame('window', PC)).toBe(false);
    expect(shouldFrame('', PC)).toBe(false);
    expect(shouldFrame('1920x1080', { ...PC, top: false })).toBe(false);
    expect(shouldFrame('1920x1080', { ...PC, webdriver: true })).toBe(false);
    expect(shouldFrame('1920x1080', { ...PC, phone: true })).toBe(false);
  });

  it('reads the real page: a refused look at the parent is not the top page', () => {
    const navigator = { webdriver: false };
    const page = { navigator, matchMedia: (q: string) => ({ matches: q === 'small' }) };
    const top: Record<string, unknown> = { ...page };
    top.self = top;
    top.top = top;
    expect(frameHost('small', top as unknown as Window)).toEqual({ top: true, webdriver: false, phone: true });
    expect(frameHost('other', top as unknown as Window)).toEqual(PC);
    const inner = { ...page, navigator: { webdriver: true }, self: {}, top: {} } as unknown as Window;
    expect(frameHost('other', inner)).toEqual({ top: false, webdriver: true, phone: false });
    const refused = {
      navigator,
      self: {},
      get top(): Window {
        throw new Error('cross-origin');
      },
    } as unknown as Window;
    expect(frameHost('other', refused)).toEqual({ top: false, webdriver: false, phone: false });
  });

  it('reads the value the settings store wrote; anything else is the default', () => {
    expect(storedResolution(schema, 'res')).toBe('3840x2160');
    createSettingsStore(schema).getState().set('res', '1920x1080');
    expect(storedResolution(schema, 'res')).toBe('1920x1080');
    store('800x600');
    expect(storedResolution(schema, 'res')).toBe('3840x2160');
    localStorage.setItem(schema.storageKey, '{broken');
    expect(storedResolution(schema, 'res')).toBe('3840x2160');
    expect(storedResolution(schema, 'none')).toBe('window');
  });

  it('draws the game at the chosen size, scaled; the setting and the window resize it at once', () => {
    render(<ResolutionFrame schema={schema} settingKey="res" title="Fake Game" />);
    expect(screen.getByTestId('resolution-frame').dataset.resolution).toBe('3840x2160');
    expect(frame().style.width).toBe('3840px');
    expect(frame().style.height).toBe('2160px');
    expect(frame().style.transform).toBe('translate(0px, 0px) scale(0.5)');
    store('1280x720');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'someone.else' }));
    });
    expect(frame().style.width).toBe('3840px');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: schema.storageKey }));
    });
    expect(frame().style.width).toBe('1280px');
    expect(frame().style.transform).toBe('translate(0px, 0px) scale(1.5)');
    resize(1280, 920);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(frame().style.transform).toBe('translate(0px, 100px) scale(1)');
    store('window');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(frame().style.width).toBe('100%');
    expect(frame().style.transform).toBe('none');
  });

  it('draws its children on the top page beside the game; without children, nothing more', () => {
    const { unmount } = render(<ResolutionFrame schema={schema} settingKey="res" title="Fake Game" />);
    expect(screen.getByTestId('resolution-frame').children).toHaveLength(1);
    unmount();
    render(
      <ResolutionFrame schema={schema} settingKey="res" title="Fake Game">
        <button>Reload</button>
      </ResolutionFrame>,
    );
    const over = screen.getByRole('button', { name: 'Reload' }).parentElement;
    expect(over?.className).toBe('kit-res-over');
    expect(over?.parentElement).toBe(screen.getByTestId('resolution-frame'));
    expect(frame().contains(over)).toBe(false);
  });

  it('the page inside the frame does not frame itself again, and unmounting removes every listener', () => {
    const types = ['resize', 'storage', 'hashchange', 'focus', 'pointerdown'];
    const count = (spy: { mock: { calls: unknown[][] } }): string[] => spy.mock.calls.map((c) => String(c[0])).filter((t) => types.includes(t)).sort();
    const spies = [window, document].map((t) => [vi.spyOn(t, 'addEventListener'), vi.spyOn(t, 'removeEventListener')] as const);
    const { unmount } = render(<ResolutionFrame schema={schema} settingKey="res" title="Fake Game" />);
    const inner = frame().contentWindow;
    if (inner === null) throw new Error('no inner window');
    expect(frameHost(undefined, inner).top).toBe(false);
    expect(shouldFrame('1920x1080', frameHost(undefined, inner))).toBe(false);
    const innerOff = vi.spyOn(inner, 'removeEventListener');
    fireEvent.load(frame());
    unmount();
    expect(count(spies[0]![0])).toEqual(['focus', 'hashchange', 'resize', 'storage']);
    expect(count(spies[1]![0])).toEqual(['pointerdown']);
    for (const [on, off] of spies) expect(count(off)).toEqual(count(on));
    expect(count(innerOff)).toEqual(['hashchange']);
    vi.restoreAllMocks();
  });

  it('the route and the title follow the game', async () => {
    render(<ResolutionFrame schema={schema} settingKey="res" title="Fake Game" />);
    const inner = frame().contentWindow;
    if (inner === null) throw new Error('no inner window');
    const doc = inner.document;
    const title = doc.createElement('title');
    title.textContent = 'Fake Game - Table';
    (doc.querySelector('head') ?? doc.querySelector('html') ?? doc).appendChild(title);
    inner.location.hash = '#/table';
    fireEvent.load(frame());
    expect(window.location.hash).toBe('#/table');
    expect(document.title).toBe('Fake Game - Table');
    window.history.replaceState(null, '', '#/home');
    act(() => {
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(inner.location.hash).toBe('#/home');
    title.textContent = 'Fake Game - Score';
    await act(() => Promise.resolve());
    expect(document.title).toBe('Fake Game - Score');
  });
});
