// `node kit.mjs new`: the whole start of a game in one step (K214): ports, files, git, private GitHub repo. Safe to re-run.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { scaffold as realScaffold } from './scaffold.js'

const run = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o })

// options: those of scaffold, plus remote (default true; false skips git init, commit, repo create and repo edit), exec(cmd, args, {cwd}) => stdout (throws on failure), scaffold, log
export function newGame(o) {
  const exec = o.exec ?? run
  const log = o.log ?? console.log
  const scaffold = o.scaffold ?? realScaffold
  const kit = o.kit
  const remote = o.remote !== false
  const done = []
  const step = (name, f) => {
    let msg
    try { msg = f() ?? 'done' } catch (e) { throw new Error(`step "${name}" failed: ${e.message}`, { cause: e }) }
    done.push(name + ': ' + msg)
    log(name + ': ' + msg)
  }
  const dir = path.resolve(o.dir)
  const mark = (n) => path.join(dir, '.kit-new-' + n)
  const made = remote && (fs.existsSync(mark('done')) || fs.existsSync(path.join(dir, '.git')))
  const portsFile = o.ports ?? path.join(kit, 'ports.json')
  step('ports', () => {
    if (o.ports || JSON.parse(fs.readFileSync(portsFile, 'utf8')).games?.[o.id]) return 'skipped, entry exists'
    const pkg = path.join(dir, 'package.json')
    const own = !fs.existsSync(pkg)
    if (own) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(pkg, '{}') }
    try { exec('node', [path.join(kit, 'tools/game-server/server.mjs'), 'add', o.id, o.name, dir]) } finally { if (own) fs.rmSync(pkg) }
    return 'port block added to game-kit ports.json and docs/PORTS.md: commit them in game-kit'
  })
  let repo = o.repo
  if (remote && !repo) step('owner', () => { repo = exec('gh', ['api', 'user', '--jq', '.login']).trim() + '/' + o.id; return repo })
  step('files', () => {
    if (made) return 'skipped, ' + dir + ' already has files'
    if (remote && fs.existsSync(mark('partial'))) fs.rmSync(dir, { recursive: true, force: true })
    try { scaffold({ ...o, dir, repo, ...(remote ? { git: false } : {}) }) } catch (e) { if (remote && fs.existsSync(dir)) fs.writeFileSync(mark('partial'), ''); throw e }
    if (remote) fs.writeFileSync(mark('done'), '')
  })
  if (!remote) { log('--no-remote: git commit and GitHub repo skipped'); return done }
  const git = (...a) => exec('git', a, { cwd: dir })
  step('git init', () => {
    if (fs.existsSync(path.join(dir, '.git'))) return 'skipped, already a repo'
    git('init', '-q', '-b', 'main')
  })
  step('first commit', () => {
    try { git('rev-parse', '--verify', 'HEAD'); return 'skipped, already committed' } catch { /* none yet */ }
    git('add', '-A')
    git('commit', '-q', '-m', `Start ${o.name} from game-kit\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`)
  })
  step('repo create', () => {
    try { git('remote', 'get-url', 'origin'); return 'skipped, origin exists' } catch { /* none yet */ }
    exec('gh', ['repo', 'create', repo, '--private', '--source', '.', '--push'], { cwd: dir })
  })
  step('repo edit', () => {
    if (exec('gh', ['repo', 'view', '--json', 'deleteBranchOnMerge', '--jq', '.deleteBranchOnMerge'], { cwd: dir }).trim() === 'true') return 'skipped, already on'
    exec('gh', ['repo', 'edit', '--delete-branch-on-merge'], { cwd: dir })
  })
  return done
}
