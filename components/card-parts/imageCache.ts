// Lifted from STCC imageCache.ts (B44f): card pictures kept in the Cache Storage, and decoded before a card is drawn.
// The game gives the list of addresses and a cache prefix; no pack, state or store of its own lives here.

export interface ImageBucket {
  list(): Promise<{ url: string; size: number }[]>
  get(url: string): Promise<Blob | null>
  put(url: string, blob: Blob): Promise<void>
}
export interface ImageStore {
  names(): Promise<string[]>
  remove(name: string): Promise<void>
  open(name: string): Promise<ImageBucket>
}

/** The real Cache Storage as an `ImageStore`. */
export function cacheStorageStore(caches: CacheStorage): ImageStore {
  return {
    names: () => caches.keys(),
    remove: async (name) => {
      await caches.delete(name)
    },
    open: async (name) => {
      const cache = await caches.open(name)
      return {
        list: async () => {
          const out: { url: string; size: number }[] = []
          for (const request of await cache.keys()) {
            const saved = await cache.match(request)
            out.push({ url: request.url, size: Number(saved?.headers.get('content-length') ?? 0) })
          }
          return out
        },
        get: async (url) => (await cache.match(url))?.blob() ?? null,
        put: async (url, blob) => {
          await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }))
        },
      }
    },
  }
}

export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { name?: unknown; message?: unknown }
  return e.name === 'QuotaExceededError' || (typeof e.message === 'string' && /quota/i.test(e.message))
}

/** A short stable hash (FNV-1a) of the sorted addresses, after `prefix`: the name of this picture set's cache. */
export function cacheNameFor(urls: readonly string[], prefix: string): string {
  let h = 0x811c9dc5
  for (const ch of [...urls].sort().join('\n')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${prefix}${h.toString(16).padStart(8, '0')}`
}

export interface FillProgress { have: number; total: number; bytes: number; quotaHit: boolean }
export interface FillOptions {
  store: ImageStore
  /** The game's cache prefix ('mygame-cards-'); its service worker looks for it too. */
  prefix: string
  /** The pictures wanted, in the order to fetch them (absolute addresses). */
  urls: readonly string[]
  fetchImage: (url: string) => Promise<Blob | null>
  concurrency?: number
  onProgress?: (progress: FillProgress) => void
}

const MAX_PUT_FAILURES = 5

/** Fills the cache with the pictures it lacks; once complete, deletes the other caches of the prefix. Never throws on a refusal. */
export async function fillImageCache(options: FillOptions): Promise<FillProgress> {
  const { store, urls, fetchImage, prefix } = options
  const name = cacheNameFor(urls, prefix)
  const bucket = await store.open(name)
  const wanted = new Set(urls)
  const saved = new Map<string, number>()
  for (const { url, size } of await bucket.list()) if (wanted.has(url)) saved.set(url, size)
  const progress: FillProgress = { have: saved.size, total: urls.length, bytes: [...saved.values()].reduce((a, b) => a + b, 0), quotaHit: false }
  options.onProgress?.({ ...progress })
  const missing = urls.filter((u) => !saved.has(u))
  let next = 0
  let putFailures = 0
  const worker = async (): Promise<void> => {
    while (!progress.quotaHit && putFailures < MAX_PUT_FAILURES) {
      const url = missing[next]
      next += 1
      if (url === undefined) return
      try {
        const blob = await fetchImage(url)
        if (blob === null) continue
        try {
          await bucket.put(url, blob)
        } catch (error) {
          if (isQuotaError(error)) progress.quotaHit = true
          else putFailures += 1
          continue
        }
        progress.have += 1
        progress.bytes += blob.size
      } catch {
        continue
      }
      options.onProgress?.({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker))
  if (progress.have >= progress.total)
    for (const other of await store.names()) if (other.startsWith(prefix) && other !== name) await store.remove(other)
  options.onProgress?.({ ...progress })
  return progress
}

const absolute = (url: string): string => (typeof document === 'undefined' ? url : new URL(url, document.baseURI).href)

const objectUrls = new Map<string, string>()
const undecoded = new Set<string>()
let kept: HTMLImageElement[] = []
const done = new Set<string>()
let generation = 0

/** The address to draw: null while its decode is running (draw the stand-in), else the cached copy or itself. */
export function displayUrl(url: string): string | null {
  if (undecoded.has(url)) return null
  return objectUrls.get(url) ?? url
}

/** Marks pictures about to be drawn as not decoded yet (call while rendering, before the first card). */
export function markUndecoded(urls: readonly string[]): void {
  for (const url of urls) if (!done.has(url)) undecoded.add(url)
}

export interface PrepareOptions {
  /** The pictures to decode, most visible first. */
  urls: readonly string[]
  /** Reads a picture from the device's cache; omitted when a service worker serves them. */
  fromCache?: (url: string) => Promise<Blob | null>
  concurrency?: number
  /** Called a few times (batched), when some pictures finished. */
  onChange: () => void
  decode?: (src: string) => Promise<HTMLImageElement | null>
  /** A picture still undecoded after this long counts as failed (default 8000 ms). */
  decodeTimeoutMs?: number
}

async function decodeImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image()
  img.src = src
  try {
    await img.decode()
    return img
  } catch {
    return null
  }
}

/** Decodes the pictures of a game that is starting; resolves when all are done (or a newer call replaced this one). */
export async function prepareImages(options: PrepareOptions): Promise<void> {
  generation += 1
  const mine = generation
  undecoded.clear()
  markUndecoded(options.urls)
  let timer: ReturnType<typeof setTimeout> | undefined
  const changed = (): void => {
    timer ??= setTimeout(() => {
      timer = undefined
      options.onChange()
    }, 60)
  }
  let next = 0
  const decodeOne = options.decode ?? decodeImage
  const decode = (src: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null)
      }, options.decodeTimeoutMs ?? 8000)
      decodeOne(src).then(
        (img) => {
          clearTimeout(timeout)
          resolve(img)
        },
        () => {
          clearTimeout(timeout)
          resolve(null)
        },
      )
    })
  const worker = async (): Promise<void> => {
    while (mine === generation) {
      const url = options.urls[next]
      next += 1
      if (url === undefined) return
      if (done.has(url)) continue
      let src = url
      try {
        const blob = (await options.fromCache?.(absolute(url))) ?? null
        if (blob !== null) {
          src = objectUrls.get(url) ?? URL.createObjectURL(blob)
          objectUrls.set(url, src)
        }
      } catch {
        /* the network copy is used */
      }
      const img = await decode(src)
      if (mine !== generation) return
      if (img !== null) kept.push(img)
      done.add(url)
      undecoded.delete(url)
      changed()
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 6) }, worker))
  if (mine !== generation) return
  if (timer !== undefined) clearTimeout(timer)
  options.onChange()
}

/** Forget the decode state (the game ended, or a test is done). */
export function releaseImages(): void {
  generation += 1
  undecoded.clear()
  done.clear()
  for (const stale of kept) stale.src = ''
  kept = []
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
}

let holders = 0

/** One drawer of decoded pictures (an ArtProvider); the decode state is released when the last one lets go. */
export function retainImages(): () => void {
  holders += 1
  let held = true
  return () => {
    if (!held) return
    held = false
    holders -= 1
    if (holders === 0) releaseImages()
  }
}

/** A service worker controls this page and so answers the pictures from the cache itself. */
export function serviceWorkerServes(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller != null
}

/** Reads a picture from the set's cache, then any older cache of the prefix; undefined when a service worker serves or no Cache Storage. */
export function cachedBlobReader(
  urls: readonly string[],
  prefix: string,
  store: ImageStore | null = typeof caches === 'undefined' ? null : cacheStorageStore(caches),
): ((url: string) => Promise<Blob | null>) | undefined {
  if (store === null || serviceWorkerServes()) return undefined
  const name = cacheNameFor(urls, prefix)
  let buckets: Promise<ImageBucket[]> | undefined
  const open = async (): Promise<ImageBucket[]> => {
    const others = (await store.names()).filter((n) => n.startsWith(prefix) && n !== name).sort()
    return Promise.all([name, ...others].map((n) => store.open(n)))
  }
  return async (url) => {
    buckets ??= open()
    for (const bucket of await buckets) {
      const found = await bucket.get(url)
      if (found !== null) return found
    }
    return null
  }
}

/** Fetches a picture; null unless the answer is an image. */
export async function fetchImageBlob(url: string): Promise<Blob | null> {
  const response = await fetch(url)
  if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) return null
  return response.blob()
}
