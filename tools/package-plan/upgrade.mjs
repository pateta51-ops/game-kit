import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { packagePlan } from './plan.mjs'
import { measureGame } from '../reuse-metrics/report.mjs'

const kit = path.resolve(import.meta.dirname, '../..')
const version = /^v\d+\.\d+\.\d+$/
const sha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const component = /^[a-z][a-z0-9-]*$/
const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' }
const git = (...args) => execFileSync('git', ['-C', kit, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }).trim()
const read = (dir, file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
const gitLines = (...args) => git(...args).split('\n').filter(Boolean)

function pin(ref, commit, side) {
  if (typeof ref !== 'string' || !version.test(ref) || typeof commit !== 'string' || !sha.test(commit)) {
    throw new Error(side + ' needs a release tag and full commit')
  }
  const tag = 'refs/tags/' + ref
  const refs = gitLines('for-each-ref', '--format=%(refname)', tag, 'refs/' + ref, 'refs/heads/' + ref, 'refs/remotes/' + ref)
  if (!refs.includes(tag)) throw new Error(side + ' release tag is unavailable: ' + ref)
  if (refs.some(r => ['refs/' + ref, 'refs/heads/' + ref, 'refs/remotes/' + ref, 'refs/remotes/' + ref + '/HEAD'].includes(r))) {
    throw new Error(side + ' release tag is shadowed by another ref: ' + ref)
  }
  if (git('rev-parse', tag + '^{commit}') !== commit) throw new Error(side + ' tag ' + ref + ' does not match the expected commit')
  return { ref, commit, tree: git('rev-parse', commit + '^{tree}') }
}

function manifest(commit, name) {
  const data = JSON.parse(git('show', commit + ':components/' + name + '/component.json'))
  if (data.name !== name || !Array.isArray(data.needs) || data.needs.some(n => !component.test(n))) {
    throw new Error('invalid component manifest: ' + name)
  }
  return data
}

function migrationNotes(base, target, file, wasInstalled) {
  const sections = revision => git('show', revision + ':' + file).split(/(?=^#{1,6} )/m)
    .filter(section => /^#{1,6} .*\b(breaking|migration)\b/i.test(section)).map(section => section.trim())
  const prior = new Set(wasInstalled ? sections(base) : [])
  const lines = gitLines('diff', '--no-ext-diff', '--no-textconv', '-U0', base, target, '--', file)
    .filter(line => /^\+[^+]/.test(line) && /\bbreaking\b/i.test(line)).map(line => line.slice(1).trim())
  return [...new Set([...sections(target).filter(section => !prior.has(section)), ...lines])]
}

function upgrade(dir, ref, commit) {
  const target = pin(ref, commit, 'target')
  const lock = read(dir, 'kit/kit.lock.json')
  const base = pin(lock.ref, lock.commit, 'base')
  try { git('merge-base', '--is-ancestor', base.commit, target.commit) }
  catch { throw new Error('base commit is not a verified ancestor of the target') }
  const checked = spawnSync(process.execPath, [path.join(kit, 'kit.mjs'), 'check', '--source', kit], {
    cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (checked.status !== 0) throw new Error('base kit verification failed: ' + (checked.stderr?.trim() || checked.error?.message || checked.signal))
  if (checked.stderr) process.stderr.write(checked.stderr)
  const currentPackages = packagePlan(dir).packages
  const locked = Object.keys(lock.components).sort()
  const wanted = new Set(locked)
  const targetNeeds = new Map()
  for (const name of wanted) {
    const { needs } = manifest(commit, name)
    targetNeeds.set(name, needs)
    for (const need of needs) wanted.add(need)
  }
  const targetPackages = packagePlan(dir, { ref, commit, components: Object.fromEntries([...wanted].map(n => [n, {}])) }).packages
  const prior = new Map(currentPackages.map(p => [p.name, p]))
  const after = new Map(targetPackages.map(p => [p.name, p]))
  const packageChanges = [...new Set([...prior.keys(), ...after.keys()])].sort().flatMap(name => {
    const before = prior.get(name) ?? null
    const target = after.get(name) ?? null
    return isDeepStrictEqual(before, target) ? [] : [{ name, before, target }]
  })
  const usage = measureGame(dir)
  const classify = (name, all, runtime) => runtime.includes(name) ? 'static-runtime' : all.includes(name) ? 'static-type-only' : 'unknown'
  const components = [...wanted].sort().flatMap(name => {
    const where = ':components/' + name
    const before = Object.hasOwn(lock.components, name) ? git('rev-parse', base.commit + where) : null
    const target = git('rev-parse', commit + where)
    if (before === target) return []
    const readme = 'components/' + name + '/README.md'
    return [{
      name, change: before ? 'changed' : 'added-dependency', beforeTree: before, targetTree: target,
      beforeNeeds: before ? manifest(base.commit, name).needs : [], targetNeeds: targetNeeds.get(name),
      application: classify(name, usage.productionReferenced, usage.productionRuntimeReferenced),
      tests: classify(name, usage.testReferenced, usage.testRuntimeReferenced),
      breakingReadme: migrationNotes(base.commit, commit, readme, before !== null),
    }]
  })
  const range = base.commit + '..' + commit
  const scripts = read(dir, 'package.json').scripts ?? {}
  return {
    version: 1, base: { ...base, supportCoverage: lock.support ? 'versioned' : 'recorded-files-only' },
    target, components, packageChanges,
    breakingSubjects: [...new Set(gitLines('log', '--format=%s', range).filter(title => /breaking/i.test(title)))],
    execution: 'unknown',
    checks: ['typecheck', 'lint', 'test', 'content:check', 'kit:check', 'ci:check', 'golden', 'sim:smoke', 'sim:fuzz', 'e2e', 'e2e:phone', 'art:check', 'build', 'size']
      .filter(name => typeof scripts[name] === 'string'),
  }
}

const args = process.argv.slice(2)
if (args.length !== 3) {
  console.error('usage: node tools/package-plan/upgrade.mjs <game-dir> <target-tag> <target-commit>')
  process.exitCode = 2
} else {
  try { console.log(JSON.stringify(upgrade(fs.realpathSync(args[0]), args[1], args[2]), null, 2)) }
  catch (e) { console.error('upgrade-impact: ' + (e.stderr?.trim() || e.message)); process.exitCode = 1 }
}
