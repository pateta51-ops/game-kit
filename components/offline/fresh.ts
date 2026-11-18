// New-build check: the page asks the deployed `build.json` which build is live; a different id means a newer deploy.
// Reload once when the game says it is safe; a reload that does not land on the new id is not repeated (no loop).
export interface BuildStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface FreshOptions {
  /** the id of the build running now (a commit, a hash) */
  build: string
  /** where the deployed id is read from, as `{ "build": "<id>" }` */
  url?: string
  /** the game's idle test: false while input is half-entered */
  safe: () => boolean
  /** awaited before reloading (pending save) */
  flush?: () => Promise<unknown>
  fetch?: (url: string, init?: { cache: 'no-store' }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
  reload?: () => void
  /** remembers the id a reload went for (sessionStorage by default) */
  store?: BuildStore
}
export interface FreshBuild { check: () => Promise<boolean>; stop: () => void }
export const FRESH_KEY = 'kit.offline.reloadedFor'
export const BUILD_FILE = 'build.json'

/** The running build's id for display: the game's define (a commit) cut to `short` characters, else `unknown`. */
export const buildStamp = (define?: string, short = 7): string => (typeof define === 'string' && define !== '' ? define.slice(0, short) : 'unknown')

export async function deployedBuild(url: string, f: NonNullable<FreshOptions['fetch']>): Promise<string | undefined> {
  try {
    const r = await f(url, { cache: 'no-store' })
    const j = r.ok ? ((await r.json()) as { build?: unknown }) : undefined
    return typeof j?.build === 'string' && j.build !== '' ? j.build : undefined
  } catch { return undefined }
}

/** Looks now, back online, on `pageshow` and when the page returns to the front; `check()` again when what `safe` reads changes. */
export function watchBuild(o: FreshOptions): FreshBuild {
  const f = o.fetch ?? ((u, i) => fetch(u, i))
  const store = o.store ?? sessionStorage
  const reload = o.reload ?? (() => { location.reload() })
  const url = o.url ?? BUILD_FILE
  let q: Promise<boolean> = Promise.resolve(false)
  let stopped = false
  const run = async (): Promise<boolean> => {
    try {
      const live = await deployedBuild(url, f)
      if (stopped || live === undefined || live === o.build || store.getItem(FRESH_KEY) === live || !o.safe()) return false
      await o.flush?.()
      if (stopped || !o.safe()) return false
      store.setItem(FRESH_KEY, live)
      reload()
      return true
    } catch { return false }
  }
  const check = (): Promise<boolean> => (q = q.then(run))
  const go = () => { void check() }
  const show = () => { if (document.visibilityState === 'visible') go() }
  window.addEventListener('online', go)
  window.addEventListener('pageshow', go)
  document.addEventListener('visibilitychange', show)
  go()
  return { check, stop: () => { stopped = true; window.removeEventListener('online', go); window.removeEventListener('pageshow', go); document.removeEventListener('visibilitychange', show) } }
}
