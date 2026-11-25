import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'

const kit = path.resolve(import.meta.dirname, '../..')
const plan = path.join(import.meta.dirname, 'plan.mjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-package-plan-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
const git = (...args) => execFileSync('git', ['-C', kit, ...args], { encoding: 'utf8' }).trim()
const pin = git('rev-parse', 'v0.272.0^{commit}')
const components = { 'llm-playtester': {}, saves: {}, 'engine-core': {}, 'small-helpers': {} }
const fixture = (manifest, lock = { ref: 'v0.272.0', commit: pin, components }, parent = tmp) => {
  const dir = fs.mkdtempSync(path.join(parent, 'consumer-'))
  fs.mkdirSync(path.join(dir, 'kit'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, 'kit/kit.lock.json'), JSON.stringify(lock))
  return dir
}
const run = (...args) => spawnSync(process.execPath, [plan, ...args], { encoding: 'utf8', cwd: kit })
const compare = dir => {
  const result = run(dir)
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}
const sdk = '@anthropic-ai/sdk'

it('reports pinned package roles and reasons for the locked assembly and never writes files', () => {
  const dir = fixture({
    packageManager: 'pnpm@10.0.0',
    dependencies: { [sdk]: '0.0.1', react: '^19.3.1', keep: '2.3.4' },
  }, { ref: 'historical-label', commit: pin, components })
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'fixture-lockfile\n')
  fs.mkdirSync(path.join(dir, 'kit.old'))
  const before = ['package.json', 'pnpm-lock.yaml', 'kit/kit.lock.json'].map(f => fs.readFileSync(path.join(dir, f)))
  const output = compare(dir)
  expect(output.pin).toEqual({ ref: 'historical-label', commit: pin })
  expect(output.project).toMatchObject({ packageManager: 'pnpm@10.0.0', lockfiles: ['pnpm-lock.yaml'], recoveryBackup: true })
  expect(output.packages).toEqual([
    { name: sdk, components: ['llm-playtester'], expected: [{ role: 'dependencies', range: '^1.8.0' }], declared: [{ role: 'dependencies', range: '0.0.1' }], status: 'conflict' },
    { name: 'idb-keyval', components: ['saves'], expected: [{ role: 'dependencies', range: '^6.3.0' }], declared: [], status: 'missing' },
    { name: 'react', components: ['saves'], expected: [{ role: 'dependencies', range: '^19.3.1' }], declared: [{ role: 'dependencies', range: '^19.3.1' }], status: 'compatible' },
  ])
  expect(compare(dir)).toEqual(output)
  expect(['package.json', 'pnpm-lock.yaml', 'kit/kit.lock.json'].map(f => fs.readFileSync(path.join(dir, f)))).toEqual(before)
  expect(fs.readdirSync(dir).sort()).toEqual(['kit', 'kit.old', 'package.json', 'pnpm-lock.yaml'])
})

it.each([
  [{ devDependencies: { [sdk]: '^1.8.0' } }, 'wrong-role'],
  [{ dependencies: { [sdk]: '>=1.0.0 <2.0.0' } }, 'overlap'],
  [{ dependencies: { [sdk]: 'latest' } }, 'unresolved'],
  [{ dependencies: { [sdk]: 'workspace:*' } }, 'unresolved'],
  [{ dependencies: { [sdk]: '1.8.0--pre' } }, 'unresolved'],
  [{ dependencies: { [sdk]: '1.8.0+build1-hotfix' } }, 'compatible'],
  [{ dependencies: { [sdk]: '>1.8.0 <1.8.1' } }, 'unresolved'],
  [{ dependencies: { [sdk]: '^1.8.0' }, overrides: { [sdk]: '2.0.0' } }, 'unresolved'],
  [{ dependencies: { [sdk]: '<1.8.0 || >=2.0.0' } }, 'conflict'],
  [{ optionalDependencies: { [sdk]: '^1.8.0' } }, 'unresolved'],
  [{ peerDependencies: { [sdk]: '^1.8.0' } }, 'unresolved'],
  [{ dependencies: { [sdk]: '^1.8.0' }, devDependencies: { [sdk]: '^1.8.0' } }, 'unresolved'],
  [{ workspaces: ['games/*'], dependencies: { [sdk]: '^1.8.0' } }, 'unresolved'],
])('classifies %j as %s', (manifest, status) => {
  expect(compare(fixture(manifest)).packages.find(p => p.name === sdk).status).toBe(status)
})

it('preserves ancestor workspace ambiguity without reading ancestor declarations', () => {
  const parent = fs.mkdtempSync(path.join(tmp, 'parent-'))
  fs.writeFileSync(path.join(parent, 'pnpm-workspace.yaml'), 'packages:\n  - consumers/*\n')
  const dir = fixture({ dependencies: { [sdk]: '^1.8.0' } }, undefined, parent)
  expect(compare(dir)).toMatchObject({
    project: { workspace: 'possible-ancestor-workspace' },
    packages: [{ name: sdk, status: 'unresolved' }, { name: 'idb-keyval', status: 'unresolved' }, { name: 'react', status: 'unresolved' }],
  })
})

it.each([
  [{ ref: 'v0.272.0', components }, /single pinned kit commit/],
  [{ ref: 'v0.272.0', commit: '0'.repeat(40), components }, /pinned commit.*unavailable/],
  [{ ref: 'v0.272.0', commit: pin, components: { saves: {} } }, /saves requires unlocked component/],
])('refuses an unresolvable lock with exit 1', (lock, diagnostic) => {
  const r = run(fixture({}, lock))
  expect(r.status).toBe(1)
  expect(r.stderr).toMatch(diagnostic)
  expect(r.stdout).toBe('')
})

it('groups repeated requirements and distinguishes kit development dependencies', () => {
  const dir = fixture({
    dependencies: { typescript: '6.0.3' },
    devDependencies: { vitest: '^5.0.3' },
  }, { ref: 'v0.272.0', commit: pin, components: { 'sim-pool': {}, 'card-harness': {}, 'engine-core': {}, 'plain-text': {} } })
  expect(compare(dir).packages).toEqual([
    { name: 'typescript', components: ['card-harness'], expected: [{ role: 'devDependencies', range: '~6.0.3' }], declared: [{ role: 'dependencies', range: '6.0.3' }], status: 'compatible' },
    { name: 'vitest', components: ['card-harness', 'sim-pool'], expected: [{ role: 'devDependencies', range: '^5.0.3' }], declared: [{ role: 'devDependencies', range: '^5.0.3' }], status: 'compatible' },
  ])
})

it('compares a real pull pin while the existing integrity check retains its warning contract', () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'pull-'))
  const invoke = (...args) => spawnSync(process.execPath, [path.join(kit, 'kit.mjs'), ...args], { encoding: 'utf8', cwd: dir })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { [sdk]: '0.0.1' } }))
  const pulled = invoke('pull', kit, 'v0.272.0', 'llm-playtester')
  expect(pulled.status, pulled.stderr).toBe(0)
  expect(compare(dir).packages[0]).toMatchObject({ name: sdk, status: 'conflict' })
  const checked = invoke('check', '--source', kit)
  expect(checked.status, checked.stderr).toBe(0)
  expect(checked.stderr).not.toContain(sdk)
})

it('leaves missing blobs unfetched in a partial kit checkout', () => {
  const sandbox = fs.mkdtempSync(path.join(tmp, 'partial-'))
  const remote = path.join(sandbox, 'source')
  const clone = path.join(sandbox, 'clone')
  const command = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  fs.mkdirSync(path.join(remote, 'components', 'probe'), { recursive: true })
  command(remote, 'init', '-q')
  command(remote, 'config', 'uploadpack.allowFilter', 'true')
  fs.writeFileSync(path.join(remote, 'components', 'probe', 'component.json'), JSON.stringify({ name: 'probe', needs: [], packages: ['react'] }))
  fs.writeFileSync(path.join(remote, 'package.json'), JSON.stringify({ dependencies: { react: '^19.3.1' } }))
  command(remote, 'add', '.')
  command(remote, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Pin')
  const commit = command(remote, 'rev-parse', 'HEAD')
  command(sandbox, 'clone', '--quiet', '--no-checkout', '--filter=blob:none', pathToFileURL(remote).href, clone)
  for (const file of ['tools/package-plan/plan.mjs', 'components/scaffold/packages.mjs']) {
    fs.mkdirSync(path.dirname(path.join(clone, file)), { recursive: true })
    fs.copyFileSync(path.join(kit, file), path.join(clone, file))
  }
  fs.symlinkSync(path.join(kit, 'node_modules'), path.join(clone, 'node_modules'), 'junction')
  const dir = fixture({}, { ref: 'partial', commit, components: { probe: {} } })
  const packs = path.join(clone, '.git', 'objects', 'pack')
  const before = fs.readdirSync(packs).sort()
  const result = spawnSync(process.execPath, [path.join(clone, 'tools/package-plan/plan.mjs'), dir], { encoding: 'utf8', cwd: clone })
  expect(fs.readdirSync(packs).sort()).toEqual(before)
  expect(result.status, result.stderr).toBe(1)
  expect(result.stderr).toContain('cannot read pinned components/probe/component.json')
})
