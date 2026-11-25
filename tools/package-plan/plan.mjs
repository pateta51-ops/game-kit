import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { collectPackages, packageDeclarations, PACKAGE_ROLES } from '../../components/scaffold/packages.mjs'

const lockfiles = ['bun.lock', 'bun.lockb', 'npm-shrinkwrap.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']
const ordinaryRoles = PACKAGE_ROLES.slice(0, 2)
const componentName = /^[a-z][a-z0-9-]*$/
const packageName = /^(?:@[a-z0-9~._-]+\/)?[a-z0-9~._-]+$/
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const has = (dir, file) => fs.lstatSync(path.join(dir, file), { throwIfNoEntry: false }) !== undefined
const any = (dir, files) => files.some(file => has(dir, file))

function readObject(text, label) {
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error(label + ' is invalid JSON', { cause: e }) }
  if (!object(data)) throw new Error(label + ' must be an object')
  return data
}

function validateDeclarations(manifest, label) {
  for (const role of PACKAGE_ROLES) {
    if (Object.hasOwn(manifest, role) && (!object(manifest[role]) || Object.values(manifest[role]).some(range => typeof range !== 'string'))) {
      throw new Error(label + ' ' + role + ' must map package names to range strings')
    }
  }
}

function projectOf(dir, manifest) {
  let workspace = 'none-detected'
  if (Object.hasOwn(manifest, 'workspaces') || has(dir, 'pnpm-workspace.yaml')) workspace = 'workspace-markers'
  else {
    for (let p = dir; p !== path.dirname(p) && !has(p, '.git');) {
      p = path.dirname(p)
      if (any(p, ['package.json', 'pnpm-workspace.yaml', ...lockfiles])) {
        workspace = 'possible-ancestor-workspace'
        break
      }
    }
  }
  const overrides = ['overrides', 'resolutions'].filter(field => Object.hasOwn(manifest, field))
  if (object(manifest.pnpm) && Object.hasOwn(manifest.pnpm, 'overrides')) overrides.push('pnpm.overrides')
  return {
    packageManager: typeof manifest.packageManager === 'string' ? manifest.packageManager : null,
    lockfiles: lockfiles.filter(file => has(dir, file)),
    workspace,
    overrides,
    recoveryBackup: has(dir, 'kit.old'),
  }
}

function compare(expected, declared, project) {
  const unresolved = reason => ({ status: 'unresolved', reason })
  if (expected.length !== 1 || !ordinaryRoles.includes(expected[0].role)) return unresolved('kit-package-role')
  if (project.workspace !== 'none-detected') return unresolved('workspace')
  if (project.overrides.length) return unresolved('overrides')
  if (declared.length === 0) return { status: 'missing' }
  if (declared.length !== 1 || !ordinaryRoles.includes(declared[0].role)) return unresolved('consumer-package-role')
  const [{ role, range }] = declared
  const [wanted] = expected
  // Stable semver only. Prerelease opt-in differs across comparator sets.
  if ([range, wanted.range].some(text => /\d-(?=\S)/.test(text.replace(/\+[\w.-]+/g, '')) || !semver.validRange(text) || !semver.minVersion(text))) return unresolved('range')
  const offered = new semver.Range(range)
  const required = new semver.Range(wanted.range)
  const overlaps = offered.set.some(a => required.set.some(b => semver.minVersion([...a, ...b].map(c => c.value).join(' ')) !== null))
  if (!overlaps) return { status: 'conflict' }
  if (role === 'devDependencies' && wanted.role === 'dependencies') return { status: 'wrong-role' }
  return { status: semver.subset(offered, required) ? 'compatible' : 'overlap' }
}

function plan(dir) {
  const lock = readObject(fs.readFileSync(path.join(dir, 'kit/kit.lock.json'), 'utf8'), 'kit.lock.json')
  if (typeof lock.ref !== 'string' || !lock.ref || typeof lock.commit !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(lock.commit) ||
      !object(lock.components) || !Object.keys(lock.components).length) {
    throw new Error('kit.lock.json must name a single pinned kit commit and its installed components')
  }
  const { ref, commit, components } = lock
  const kit = path.resolve(import.meta.dirname, '../..')
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-C', kit, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
  }).trim()
  try {
    if (git('cat-file', '-t', commit) !== 'commit') throw new Error('expected a commit object')
  } catch (e) {
    throw new Error('pinned commit ' + commit + ' is unavailable in this checkout', { cause: e })
  }
  const read = file => {
    let bytes
    try { bytes = git('show', commit + ':' + file) } catch (e) { throw new Error('cannot read pinned ' + file, { cause: e }) }
    return readObject(bytes, 'pinned ' + file)
  }
  const names = Object.keys(components).sort()
  const manifests = names.map(name => {
    if (!componentName.test(name) || !object(components[name])) throw new Error('invalid locked component: ' + name)
    const m = read('components/' + name + '/component.json')
    if (m.name !== name || !Array.isArray(m.needs) || m.needs.some(dep => typeof dep !== 'string' || !componentName.test(dep)) ||
        (Object.hasOwn(m, 'packages') && (!Array.isArray(m.packages) || m.packages.some(pkg => typeof pkg !== 'string' || !packageName.test(pkg))))) {
      throw new Error('invalid pinned component manifest: ' + name)
    }
    for (const need of m.needs) if (!Object.hasOwn(components, need)) throw new Error(name + ' requires unlocked component ' + need)
    return [name, m]
  })
  const pinned = read('package.json')
  const manifest = readObject(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), 'package.json')
  validateDeclarations(pinned, 'pinned package.json')
  validateDeclarations(manifest, 'package.json')
  const project = projectOf(dir, manifest)
  const packages = collectPackages(manifests, pinned).map(({ name, components, declarations: expected }) => {
    const declared = packageDeclarations(manifest, name)
    return { name, components, expected, declared, ...compare(expected, declared, project) }
  })
  return { version: 1, pin: { ref, commit }, project, packages }
}

if (process.argv.length !== 3) {
  console.error('usage: node tools/package-plan/plan.mjs <game-dir>')
  process.exitCode = 2
} else {
  try { console.log(JSON.stringify(plan(fs.realpathSync(process.argv[2])), null, 2)) }
  catch (e) { console.error('package-plan: ' + e.message); process.exitCode = 1 }
}
