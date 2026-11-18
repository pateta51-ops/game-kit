// Node (the game's vite.config.ts): writes `build.json` ({ build, commit }) into the build for `watchBuild`.
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BUILD_FILE } from './fresh.ts'

/** The git short sha, or `unknown` outside a git checkout. */
export function gitCommit(short = 7, cwd?: string): string {
  try { return execSync(`git rev-parse --short=${String(short)} HEAD`, { stdio: ['ignore', 'pipe', 'ignore'], cwd }).toString().trim() || 'unknown' } catch { return 'unknown' }
}
export interface BuildInfoOptions { id?: () => string; commit?: () => string }
export function writeBuildInfo(outDir: string, o: BuildInfoOptions = {}): { build: string; commit: string } {
  const commit = (o.commit ?? gitCommit)()
  const info = { build: o.id?.() ?? commit, commit }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, BUILD_FILE), JSON.stringify(info))
  return info
}
/** `plugins: [buildInfoPlugin()]`; the game passes the same id to the page (`define`, e.g. `__BUILD__: JSON.stringify(gitCommit())`). */
export function buildInfoPlugin(o: BuildInfoOptions = {}) {
  let out = ''
  return {
    name: 'kit-build-info',
    apply: 'build' as const,
    configResolved(c: { root: string; build: { outDir: string } }) { out = resolve(c.root, c.build.outDir) },
    closeBundle() { if (out !== '') writeBuildInfo(out, o) },
  }
}
