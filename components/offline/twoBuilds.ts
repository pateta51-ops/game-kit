// Test helper (node): serves build A, then build B on the same origin, to test the update line. B is a copy of A with
// its index changed, so its precache version and sw.js differ as after a real rebuild. GET /__build/a or /__build/b
// switches the build every later request gets.
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { writeServiceWorker, type PrecacheOptions } from './precache.ts'

const TYPES: Readonly<Record<string, string>> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain', '.woff2': 'font/woff2' }

export interface TwoBuilds { url: string; a: string; b: string; close: () => Promise<void> }
/** `dir` holds build A (with its sw.js). `precache` rewrites B's sw.js; `mark` is put before `</head>` of B's index.html. */
export async function serveTwoBuilds(dir: string, o: { port?: number; mark?: string; precache?: PrecacheOptions } = {}): Promise<TwoBuilds> {
  const A = resolve(dir)
  const B = `${A}-b`
  rmSync(B, { recursive: true, force: true })
  cpSync(A, B, { recursive: true })
  const idx = join(B, 'index.html')
  writeFileSync(idx, readFileSync(idx, 'utf8').replace('</head>', `${o.mark ?? '<meta name="build" content="b">'}</head>`))
  if (o.precache) writeServiceWorker(B, o.precache)
  let root = A
  const server: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost')
    if (u.pathname === '/__build/a' || u.pathname === '/__build/b') {
      root = u.pathname.endsWith('a') ? A : B
      res.writeHead(200, { 'content-type': 'text/plain' }).end(root === A ? 'a' : 'b')
      return
    }
    let rel: string
    try { rel = normalize(decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)).replace(/^[/\\]+/, '') } catch { res.writeHead(400).end(); return }
    const file = join(root, rel)
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(file))
  })
  await new Promise<void>((r) => server.listen(o.port ?? 0, '127.0.0.1', r))
  return { url: `http://localhost:${String((server.address() as AddressInfo).port)}`, a: A, b: B, close: async () => { await new Promise((r) => server.close(r)); rmSync(B, { recursive: true, force: true }) } }
}
