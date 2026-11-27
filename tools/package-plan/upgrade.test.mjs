import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, expect, it } from 'vitest'

const kit = path.resolve(import.meta.dirname, '../..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-upgrade-'))
const target = 'v0.289.0'
const commit = '18d67aee7e56805ff5d54f10a5e3e20a45784412'
const run = (file, ...args) => spawnSync(process.execPath, [path.join(kit, file), ...args], { encoding: 'utf8', cwd: dir })
const report = (...args) => run('tools/package-plan/upgrade.mjs', dir, target, ...args)
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

it('previews the exact tagged upgrade, distinguishes static references and checks before changing files', () => {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest', golden: 'node replay', random: 'ignored' } }))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.mkdirSync(path.join(dir, 'tests'))
  fs.writeFileSync(path.join(dir, 'src/turn.ts'), "import { compile } from '../kit/dice-patterns/index.ts'")
  fs.writeFileSync(path.join(dir, 'tests/turn.test.ts'), "import type { Pattern } from '../kit/dice-patterns/index.ts'")
  const pull = run('kit.mjs', 'pull', kit, 'v0.274.0', 'dice-patterns', 'modal-dialog', 'small-helpers')
  expect(pull.status, pull.stderr).toBe(0)
  const file = path.join(dir, 'kit/kit.lock.json')
  const original = fs.readFileSync(file, 'utf8')

  const result = report(commit)
  expect(result.status, result.stderr).toBe(0)
  const evidence = JSON.parse(result.stdout)
  expect(evidence).toMatchObject({
    base: { ref: 'v0.274.0', supportCoverage: 'recorded-files-only' },
    target: { ref: target, commit },
    execution: 'unknown',
    checks: ['test', 'golden'],
  })
  expect(evidence.components).toMatchObject([
    { name: 'dice-patterns', change: 'changed', application: 'static-runtime', tests: 'static-type-only' },
    { name: 'modal-dialog', change: 'changed', beforeNeeds: [], targetNeeds: ['ui-helpers'] },
    { name: 'ui-helpers', change: 'added-dependency', beforeTree: null, application: 'unknown', tests: 'unknown' },
  ])
  expect(evidence.breakingSubjects).toEqual(expect.arrayContaining([expect.stringContaining('K622')]))
  expect(evidence.components[0].breakingReadme).toEqual(expect.arrayContaining([expect.stringContaining('Remove unsupported fields')]))
  expect(evidence.packageChanges).toMatchObject([
    { name: 'zustand', before: null, target: { status: 'missing', components: ['ui-helpers'] } },
  ])
  expect(fs.readFileSync(file, 'utf8')).toBe(original)
  expect(fs.existsSync(path.join(dir, 'kit.old'))).toBe(false)

  const wrong = report('0'.repeat(40))
  expect(wrong.status).toBe(1)
  expect(wrong.stderr).toMatch(/target tag.*does not match/)
  expect(wrong.stdout).toBe('')

  const absent = run('tools/package-plan/upgrade.mjs', dir, 'v0.999999.0', commit)
  expect(absent.status).toBe(1)
  expect(absent.stderr).toMatch(/target release tag is unavailable/)

  const pattern = path.join(dir, 'kit/dice-patterns/index.ts')
  const originalPattern = fs.readFileSync(pattern)
  fs.appendFileSync(pattern, '\n// stale')
  const stale = report(commit)
  expect(stale.status).toBe(1)
  expect(stale.stderr).toMatch(/base kit verification failed/)
  expect(stale.stdout).toBe('')
  fs.writeFileSync(pattern, originalPattern)

  const upgraded = run('kit.mjs', 'pull', kit, target)
  expect(upgraded.status, upgraded.stderr).toBe(0)
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'))
  expect(lock.commit).toBe(commit)
  expect(Object.keys(lock.components).sort()).toEqual(['dice-patterns', 'modal-dialog', 'small-helpers', 'ui-helpers'])
})
