import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createThemeStore, disclaimer } from './index.ts';
import { Footer, ScreenFrame, ThemeToggle } from './ui.ts';

const words = {
  light: { label: 'Day', ariaLabel: 'Switch to day' },
  dark: { label: 'Night' },
  system: { label: 'Automatic' },
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute('data-theme-resolved');
  document.documentElement.removeAttribute('data-x');
  document.documentElement.removeAttribute('data-x-resolved');
});

it('renders the frame slots and invokes the back action', () => {
  const back = vi.fn();
  render(
    <ScreenFrame title="Preferences" back={<button onClick={back}>Return</button>} footer={<footer>Build 12</footer>}>
      <p>Game preferences</p>
    </ScreenFrame>,
  );
  expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveTextContent('Game preferences');
  expect(screen.getByRole('contentinfo')).toHaveTextContent('Build 12');
  fireEvent.click(screen.getByRole('button', { name: 'Return' }));
  expect(back).toHaveBeenCalledOnce();
});

it('renders the supplied footer words and optional link', () => {
  const { rerender } = render(<Footer gameName="Example" stamp="Build 12" disclaimer={{ text: 'Fan project' }} />);
  expect(screen.getByRole('contentinfo')).toHaveTextContent('Example Build 12');
  expect(screen.getByText('Fan project')).toBeInTheDocument();
  rerender(<Footer gameName="Example" stamp="Build 12" disclaimer={{ text: 'Fan project', href: '#/about' }} />);
  expect(screen.getByRole('link', { name: 'Fan project' })).toHaveAttribute('href', '#/about');
});

it('generates disclaimer text using the supplied names', () => {
  expect(disclaimer('Example', 'Example Press')).toBe(
    'Unofficial fan project based on Example. This project is unaffiliated with Example Press.',
  );
});

it('cycles through the themes and restores the saved choice', () => {
  const store = createThemeStore('example.theme');
  render(<ThemeToggle store={store} words={words} />);
  expect(document.documentElement.dataset.theme).toBe('system');
  const day = screen.getByRole('button', { name: 'Switch to day' });
  expect(day).toHaveTextContent('Day');
  fireEvent.click(day);
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'Night' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(createThemeStore('example.theme').getTheme()).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Automatic' }));
  expect(document.documentElement.dataset.theme).toBe('system');
  expect(localStorage.getItem('example.theme')).toBe('system');
});

it('changes the theme when access to localStorage throws', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('Storage unavailable');
  });
  const store = createThemeStore('example.theme', 'light');
  render(<ThemeToggle store={store} words={words} />);
  fireEvent.click(screen.getByRole('button', { name: 'Night' }));
  expect(store.getTheme()).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.getByRole('button', { name: 'Automatic' })).toBeInTheDocument();
});

it('falls back to system for an invalid saved value', () => {
  localStorage.setItem('example.theme', 'purple');
  expect(createThemeStore('example.theme').getTheme()).toBe('system');
});

it('updates the toggle when the store changes elsewhere', () => {
  const store = createThemeStore('example.theme');
  render(<ThemeToggle store={store} words={words} />);
  act(() => store.setTheme('dark'));
  expect(screen.getByRole('button', { name: 'Automatic' })).toBeInTheDocument();
});

it('resolves system mode, follows OS changes and uses a custom attribute', () => {
  let handler: () => void = () => {};
  const mq = { matches: false, addEventListener: vi.fn((_: string, h: () => void) => (handler = h)), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => mq);
  const store = createThemeStore('example.theme', 'system', 'data-x');
  const root = document.documentElement;
  expect(root.getAttribute('data-x')).toBe('system');
  expect(root.getAttribute('data-x-resolved')).toBe('light');
  mq.matches = true;
  handler();
  expect(root.getAttribute('data-x-resolved')).toBe('dark');
  store.setTheme('light');
  expect(root.getAttribute('data-x-resolved')).toBe('light');
  store.destroy();
  expect(mq.removeEventListener).toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('passes extra props to the disclaimer and renders it without a link', () => {
  render(<Footer gameName="Example" stamp="B" disclaimer={{ text: 'Fan project' }} data-testid="disc" />);
  expect(screen.getByTestId('disc')).toHaveTextContent('Fan project');
  expect(screen.queryByRole('link')).toBeNull();
});
