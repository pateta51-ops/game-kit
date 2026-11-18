import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeServiceWorker } from './precache.ts'
import { serveTwoBuilds } from './twoBuilds.ts'

describe('serveTwoBuilds', () => {
  it('serves A then B', async () => {
    const d = mkdtempSync(join(tmpdir(), 'kit-two-')); const A = join(d, 'a'); mkdirSync(A)
    writeFileSync(join(A, 'index.html'), '<html><head></head><body>x</body></html>')
    writeServiceWorker(A, { prefix: 't-' })
    const s = await serveTwoBuilds(A, { precache: { prefix: 't-' } })
    expect(await (await fetch(`${s.url}/`)).text()).not.toContain('content="b"')
    await fetch(`${s.url}/__build/b`)
    expect(await (await fetch(`${s.url}/`)).text()).toContain('content="b"')
    expect((await fetch(`${s.url}/..%2f..%2fetc`)).status).toBe(404)
    await s.close(); rmSync(d, { recursive: true, force: true })
  })
})
