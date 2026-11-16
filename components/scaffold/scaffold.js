// A new, empty, working game repo: `node kit.mjs new <dir> <id> "<Name>"` (see README.md).
import { execFileSync as x } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const here = import.meta.dirname
const RENAME = { ignorefile: '.gitignore', nvmrc: '.nvmrc' }
export const BASE = ['engine-core', 'sim-pool', 'state-machines', 'app-frame', 'settings', 'saves', 'lint-preset', 'ci-templates', 'check-runner']
export const TEMPLATE = path.join(here, 'template')
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))

const target = (o, t, f) => { const rel = path.relative(t, f).replace(/.tpl$/, ''); return path.join(o.dir, path.dirname(rel), RENAME[path.basename(rel)] ?? path.basename(rel)) }
// --existing: throws, writing nothing, when a file would be overwritten (template files, kit/, rendered workflows)
export function existingCheck(o) {
  const ts = [TEMPLATE, ...(o.overlay ?? [])]
  const all = ts.flatMap((t) => walk(t).map((f) => target(o, t, f))).concat(path.join(o.dir, 'kit'), ...(o.link ? [path.join(o.dir, 'node_modules')] : []), ...['ci.yml', 'full-gate.yml'].map((w) => path.join(o.dir, '.github/workflows', w)))
  const clash = [...new Set(all.filter((f) => fs.existsSync(f)))]
  if (clash.length) throw new Error('--existing: these files already exist and would be overwritten; nothing was written: ' + clash.map((f) => path.relative(o.dir, f)).join(', '))
}

// options: dir, id, name, kit (game-kit checkout), ref (tag or commit; default the latest tag), ports (ports.json; default kit's),
// repo ("owner/name"), runner (runner label), link (a node_modules folder to link), overlay (more template folders, applied after
// the base one: the hook for a reference game), components (more components to pull), render (default true), install (default true:
// existing: scaffold into a folder that already has files; refuses, writing nothing, when a file would be overwritten
// `npm install` at the end, which writes package-lock.json; false for tests and offline work; also skipped with link)
export function scaffold(o) {
  const kit = o.kit
  const ports = JSON.parse(fs.readFileSync(o.ports ?? path.join(kit, 'ports.json'), 'utf8'))
  const g = ports.games?.[o.id]
  if (!g) throw new Error(`no ports.json entry "${o.id}": run \`node tools/game-server/server.mjs add ${o.id} "${o.name}" <repo path>\` in game-kit first, and commit ports.json`)
  if (!g.serve?.local) throw new Error(`ports.json entry "${o.id}" has no serve.local (phone slot): run \`node tools/game-server/server.mjs add ${o.id} "${o.name}" <repo path>\` in game-kit`)
  if (!o.existing && fs.existsSync(o.dir) && fs.readdirSync(o.dir).length) throw new Error(`${o.dir} is not empty`)
  const ref = o.ref ?? x('git', ['-C', kit, 'describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).trim()
  const vars = { id: o.id, name: o.name, dev: g.block, preview: g.block + 1, phone: g.serve.local, repo: o.repo ?? `OWNER/${o.id}`, runner: o.runner ?? o.id }
  if (o.existing) existingCheck(o)
  fs.mkdirSync(o.dir, { recursive: true })
  for (const t of [TEMPLATE, ...(o.overlay ?? [])])
    for (const f of walk(t)) {
      const to = target(o, t, f)
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.writeFileSync(to, fs.readFileSync(f, 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw new Error(`unknown {{${k}}} in ${f}`); return String(vars[k]) }))
    }
  const node = (...a) => x('node', a, { cwd: o.dir, stdio: 'inherit' })
  node(path.join(kit, 'kit.mjs'), 'pull', kit, ref, ...BASE, ...(o.components ?? []))
  if (o.render !== false) node('kit/ci-templates/render.mjs')
  if (o.link) fs.symlinkSync(path.resolve(o.link), path.join(o.dir, 'node_modules'), 'junction')
  if (o.install !== false && !o.link) x('npm', ['install'], { cwd: o.dir, stdio: 'inherit', shell: process.platform === 'win32' })
  if (o.git !== false && !o.existing) try { x('git', ['init', '-q'], { cwd: o.dir }) } catch { /* no git: the folder is still complete */ }
  return { dir: o.dir, ref, ports: vars }
}
