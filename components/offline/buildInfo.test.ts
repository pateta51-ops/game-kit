import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildInfoPlugin, gitCommit, writeBuildInfo } from './buildInfo.ts'

describe('build.json writer', () => {
  it('writes id and commit, with a fallback outside git', () => {
    const d = mkdtempSync(join(tmpdir(), 'kit-bi-'))
    expect(writeBuildInfo(d, { commit: () => 'abc1234' })).toEqual({ build: 'abc1234', commit: 'abc1234' })
    expect(JSON.parse(readFileSync(join(d, 'build.json'), 'utf8'))).toEqual({ build: 'abc1234', commit: 'abc1234' })
    expect(writeBuildInfo(d, { id: () => 'x', commit: () => 'unknown' }).build).toBe('x')
    expect(gitCommit(7, d)).toBe('unknown')
    rmSync(d, { recursive: true, force: true })
  })
  it('the plugin writes it at closeBundle', () => {
    const d = mkdtempSync(join(tmpdir(), 'kit-bi-'))
    const p = buildInfoPlugin({ id: () => 'id1', commit: () => 'c1' })
    p.configResolved({ root: d, build: { outDir: 'dist' } })
    p.closeBundle()
    expect(JSON.parse(readFileSync(join(d, 'dist', 'build.json'), 'utf8'))).toEqual({ build: 'id1', commit: 'c1' })
    rmSync(d, { recursive: true, force: true })
  })
})
