// Start-up: run the game's setup, mount the app in StrictMode on the root element, and put the game's test hook on
// window when it passes one (the game decides when: dev or end-to-end builds).
import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface StartOptions {
  /** The element or its id. Default 'root'. */
  root?: string | HTMLElement;
  /** Runs before the first render (bind the theme, resume a save). */
  before?: (root: HTMLElement) => void;
  hook?: { name: string; api: unknown };
}

export function startApp(app: ReactNode, opts: StartOptions = {}): Root {
  const id = typeof opts.root === 'string' ? opts.root : 'root';
  const el = typeof opts.root === 'object' ? opts.root : document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} element`);
  if (opts.hook) (window as unknown as Record<string, unknown>)[opts.hook.name] = opts.hook.api;
  opts.before?.(el);
  const root = createRoot(el);
  root.render(<StrictMode>{app}</StrictMode>);
  return root;
}
