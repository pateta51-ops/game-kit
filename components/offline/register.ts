// Registers the offline service worker (the build's sw.js, written by precache.ts) and follows its updates: when a newer
// version is stored, the update machine is `ready` and the page can show its update line; Reload (applyUpdate) lets it
// take over. Production builds on HTTPS only, never in dev or an e2e build; a `local` build also allows http://localhost.
import { create } from 'zustand';
import { defineMachine, transition } from '../state-machines/machine';

export type UpdateState = 'idle' | 'off' | 'current' | 'ready' | 'reloading';
export type UpdateEvent = 'unsupported' | 'registered' | 'failed' | 'found' | 'reload';

export const UPDATE_MACHINE = defineMachine<UpdateState, UpdateEvent>({
  id: 'kit.offline.update',
  initial: 'idle',
  states: {
    idle: { on: { unsupported: 'off', registered: 'current', failed: 'off' } },
    off: { on: {} },
    current: { on: { found: 'ready' } },
    ready: { on: { found: 'ready', reload: 'reloading' } },
    reloading: { on: {} },
  },
  describe: {
    purpose:
      'The offline service worker as the page sees it: off (none registered), current (the stored version runs), ready (a newer version is stored and waits), reloading (Reload pressed: the new version takes over and the page reloads).',
    source: 'components/offline/register.ts',
    stateLivesIn: 'useUpdate.state in components/offline/register.ts',
    notes: [
      'unsupported: not a production HTTPS build (shouldRegister); failed: the registration was refused.',
      'found: a newer sw.js finished installing while an older one controls the page (a first install offers nothing).',
      'reload: applyUpdate posts skipWaiting to the waiting worker; controllerchange then reloads the page.',
    ],
  },
});

export interface SwEnv {
  /** A production build. */
  readonly prod: boolean;
  /** The game's e2e build (its tests run without the worker). */
  readonly e2e: boolean;
  /** An offline test build: http://localhost and 127.0.0.1 count as HTTPS. */
  readonly local: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Whether this page registers the service worker. */
export function shouldRegister(
  env: SwEnv,
  where: { readonly protocol: string; readonly hostname: string; readonly framed?: boolean },
  supported: boolean,
): boolean {
  if (!env.prod || env.e2e || !supported || where.framed === true) return false;
  return where.protocol === 'https:' || (env.local && LOCAL_HOSTS.has(where.hostname));
}

export interface PageHost {
  readonly protocol: string;
  readonly hostname: string;
  /** Inside a frame: the page that holds the frame owns the service worker. */
  readonly framed: boolean;
  readonly supported: boolean;
}

/** The real page as a PageHost. A parent of another origin that refuses the look is a frame all the same. */
export function pageHost(win: Window = window): PageHost {
  let framed: boolean;
  try {
    framed = win.self !== win.top;
  } catch {
    framed = true;
  }
  return { protocol: win.location.protocol, hostname: win.location.hostname, framed, supported: 'serviceWorker' in win.navigator };
}

interface UpdateStore {
  state: UpdateState;
  /** The newer version waiting to take over (state ready). */
  waiting: ServiceWorker | null;
  send: (event: UpdateEvent, waiting?: ServiceWorker | null) => void;
}

export const useUpdate = create<UpdateStore>((set, get) => ({
  state: UPDATE_MACHINE.initial,
  waiting: null,
  send: (event, waiting) => {
    set({ state: transition(UPDATE_MACHINE, get().state, event), ...(waiting === undefined ? {} : { waiting }) });
  },
}));

/** How long Reload waits for the new version to take control before it reloads anyway. */
export const RELOAD_FALLBACK_MS = 4000;

/** Reload: the waiting version takes over; the page reloads when it controls the page, or after RELOAD_FALLBACK_MS. */
export function applyUpdate(reload: () => void = () => window.location.reload()): void {
  const { state, waiting, send } = useUpdate.getState();
  if (state !== 'ready' || waiting === null) return;
  send('reload');
  waiting.postMessage({ type: 'skipWaiting' });
  setTimeout(reload, RELOAD_FALLBACK_MS);
}

/** Registers `url` (the build's sw.js, e.g. `${import.meta.env.BASE_URL}sw.js`) when shouldRegister allows it (never inside a frame). Once per page. */
export function registerServiceWorker(env: SwEnv, url: string, host: PageHost = pageHost()): void {
  const { state, send } = useUpdate.getState();
  if (state !== 'idle') return;
  if (!shouldRegister(env, host, host.supported)) {
    send('unsupported');
    return;
  }
  const sw = navigator.serviceWorker;
  // a page that ran a stored version reloads when another one takes control; the first install's claim changes nothing
  const controlled = sw.controller !== null;
  sw.addEventListener('controllerchange', () => {
    if (controlled || useUpdate.getState().state === 'reloading') window.location.reload();
  });
  const offer = (w: ServiceWorker | null): void => {
    const { state } = useUpdate.getState();
    if (w !== null && sw.controller !== null && (state === 'current' || state === 'ready')) useUpdate.getState().send('found', w);
  };
  sw.register(url).then(
    (reg) => {
      send('registered');
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w === null) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed') offer(w);
        });
      });
      // a home-screen app stays open for days: look for a newer build whenever it comes back to the front
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
      });
    },
    () => {
      send('failed');
    },
  );
}
