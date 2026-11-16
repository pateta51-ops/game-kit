import { act, fireEvent, render, screen } from '@testing-library/react';
import { lazy } from 'react';
import { create } from 'zustand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from './index.ts';
import { AppFrame, startApp, type RouteDef } from './ui.ts';

type N = 'home' | 'play' | 'later' | 'broken' | 'flaky';

let loads = 0;
const flaky = () => (++loads === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ default: () => <p>flaky loaded</p> }));

let fail = true;
function Broken(): never | null {
  if (fail) throw new Error('boom');
  return null;
}
const Later = lazy(() => Promise.resolve({ default: ({ route }: { route: Route<N> }) => <p>later {route.parts.join(',')}</p> }));

const ROUTES: Record<N, RouteDef<N>> = {
  home: { screen: () => <p>home screen</p>, title: 'Home title' },
  play: { screen: ({ route }: { route: Route<N> }) => <p>play {route.query.get('x')}</p>, title: 'Play title' },
  later: { screen: Later },
  broken: { screen: Broken },
  flaky: { load: flaky },
};

const go = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
  });
};

afterEach(() => {
  window.location.hash = '';
});

describe('AppFrame', () => {
  it('draws the route of the hash, sets the title, loads lazy screens', async () => {
    render(<AppFrame routes={ROUTES} home="home" />);
    expect(screen.getByText('home screen')).toBeTruthy();
    expect(document.title).toBe('Home title');
    await go('#/play?x=7');
    expect(screen.getByText('play 7')).toBeTruthy();
    expect(document.title).toBe('Play title');
    await go('#/later/a');
    expect(await screen.findByText('later a')).toBeTruthy();
  });

  it('a screen that throws shows the fallback; retry draws it again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    fail = true;
    render(<AppFrame routes={ROUTES} home="home" onError={onError} words={{ retry: 'Again' }} />);
    await go('#/broken');
    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(onError).toHaveBeenCalled();
    fail = false;
    fireEvent.click(screen.getByText('Again'));
    expect(screen.queryByRole('alert')).toBeNull();
    await go('#/');
    expect(screen.getByText('home screen')).toBeTruthy();
  });

  it('retry after a failed load imports the screen again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AppFrame routes={ROUTES} home="home" />);
    await go('#/flaky');
    expect((await screen.findByRole('alert')).textContent).toContain('offline');
    await act(async () => {
      fireEvent.click(screen.getByText('Try again'));
      await Promise.resolve();
    });
    expect(await screen.findByText('flaky loaded')).toBeTruthy();
    expect(loads).toBe(2);
  });

  it('follows the route the game state wants', async () => {
    const want = create<{ w: N | null }>()(() => ({ w: null }));
    const useWant = (): N | null => want((s) => s.w);
    render(<AppFrame routes={ROUTES} home="home" useRouteFromState={useWant} />);
    await act(async () => {
      want.setState({ w: 'play' });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(window.location.hash).toBe('#/play');
    expect(screen.getByText(/^play/)).toBeTruthy();
  });
});

describe('startApp', () => {
  it('mounts on the root element after the setup and sets the test hook', async () => {
    const el = document.createElement('div');
    el.id = 'root';
    document.body.append(el);
    const before = vi.fn();
    let root: ReturnType<typeof startApp> | undefined;
    await act(async () => {
      root = startApp(<p>app</p>, { before, hook: { name: 'kitTest', api: { ok: 1 } } });
      await Promise.resolve();
    });
    expect(before).toHaveBeenCalledWith(el);
    expect(el.textContent).toBe('app');
    expect((window as unknown as { kitTest: unknown }).kitTest).toEqual({ ok: 1 });
    act(() => root?.unmount());
    expect(() => startApp(null, { root: 'missing' })).toThrow('Missing #missing');
  });
});
