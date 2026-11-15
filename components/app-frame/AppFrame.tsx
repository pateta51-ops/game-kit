// The screen of the address bar. Each route draws inside its own error boundary (a new one per route, so coming back
// to a screen that failed draws it afresh) and a Suspense for lazy screens. useRouteFromState, the game's hook, names
// the route its state wants (or null to stay); the frame then replaces the hash. The tab title follows the route and
// a new route starts scrolled to the top.
import { lazy, Suspense, useEffect, useState, type ComponentType, type ErrorInfo, type LazyExoticComponent, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { replaceRoute, routeHref, type Route } from './routes';
import { FRAME_WORDS, useRoute, type FrameWords } from './useRoute';
import './frame.css';

type Screen<N extends string> = ComponentType<{ route: Route<N> }>;

export interface RouteDef<N extends string> {
  /** A component, or a React.lazy one (a failed load of that stays failed: React keeps the rejected import). */
  screen?: Screen<N> | LazyExoticComponent<Screen<N>>;
  /** Loads the screen on demand; after a failed load, retry loads it again. Define it once, outside render. */
  load?: () => Promise<{ default: Screen<N> }>;
  title?: string;
}

export interface AppFrameProps<N extends string> {
  routes: Readonly<Record<N, RouteDef<N>>>;
  home: N;
  useRouteFromState?: (route: Route<N>) => N | null;
  fallback?: (error: Error, retry: () => void, route: Route<N>) => ReactNode;
  loading?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  words?: Partial<FrameWords>;
}

const stay = (): null => null;
const Empty = (): null => null;
const loaded = new WeakMap<object, unknown>();
function lazyFor<N extends string>(load: () => Promise<{ default: Screen<N> }>): LazyExoticComponent<Screen<N>> {
  let l = loaded.get(load) as LazyExoticComponent<Screen<N>> | undefined;
  if (l === undefined) {
    l = lazy(load);
    loaded.set(load, l);
  }
  return l;
}

export function AppFrame<N extends string>({ routes, home, useRouteFromState = stay, fallback, loading, onError, words }: AppFrameProps<N>) {
  const w = { ...FRAME_WORDS, ...words };
  const route = useRoute(Object.keys(routes) as N[], home);
  const want = useRouteFromState(route);
  const def = routes[route.name];
  useEffect(() => {
    if (want !== null && want !== route.name) replaceRoute(routeHref(want, home));
  }, [want, route.name, home]);
  useEffect(() => {
    if (def.title !== undefined) document.title = def.title;
  }, [def.title]);
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [route.name]);
  const [, setAttempt] = useState(0);
  // lazyFor returns the same component per load until a retry forgets it
  const Shown = def.load === undefined ? (def.screen ?? Empty) : lazyFor(def.load);
  // A failed load is forgotten, so the retry imports again; the frame redraws to pick up the new lazy screen.
  const again = (retry: () => void) => () => {
    if (def.load !== undefined) loaded.delete(def.load);
    setAttempt((a) => a + 1);
    retry();
  };
  const crash =
    fallback === undefined
      ? (error: Error, retry: () => void) => (
          <div className="kit-af-crash" role="alert" data-testid="crash">
            <p>{w.failed}</p>
            <p className="kit-af-error">{error.message}</p>
            <button type="button" className="kit-af-btn" onClick={again(retry)}>
              {w.retry}
            </button>
            <a className="kit-af-btn" href={routeHref(home, home)}>
              {w.home}
            </a>
          </div>
        )
      : (error: Error, retry: () => void) => fallback(error, again(retry), route);
  return (
    <ErrorBoundary key={route.name} fallback={crash} onError={onError}>
      <Suspense
        fallback={
          loading ?? (
            <p className="kit-af-loading" role="status">
              {w.loading}
            </p>
          )
        }
      >
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Shown route={route} />
      </Suspense>
    </ErrorBoundary>
  );
}
