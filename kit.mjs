#!/usr/bin/env node
// kit-support-lock: 1
// Run from a game's repo root.
//   node <kit>/kit.mjs pull <path to game-kit checkout> <tag or commit> [component...]   moves the whole kit to one tag (named components are added); atomic
//   node kit/kit.mjs list | search <word>                                              the catalogue of every component (pulled or not), from kit/CATALOG.md; search prints the mechanics map line first (kit/recipes/mechanics.md); the log ~/.game-kit/search-misses.log (never with KIT_NO_MISS_LOG=1, which finish and claims set on their own re-runs, K698) gets a line when no part has every word (the 3 parts printed above "not in the kit by that name" are only the nearest guesses) or the only hit is a "not in the kit" mechanics line (a candidate counts as demand), never from the kit's own repository (components/ beside kit.mjs; K685); a component whose catalogue Hook line holds every word is a hit scored as if each word were in its title (first unless a part matches as well by its own words), with that line printed under it as "  hook: ..."; `search --misses [n]` prints the newest
//   node kit.mjs worker-rules --adopt <game>   K714: prints the game's AGENTS.md sections or bullets that look like worker rules outside the kit:worker-rules markers (pull stamps the block from docs/worker-rules.md between them; check warns)
//   node kit.mjs state                                                                  (game-kit checkout) prints what is open (PLAN rows not done, waiting, watch)
//   node kit.mjs next-id [n] [--from <docs/plan dir or file>...]                                (game-kit checkout) the next free K number(s): origin/main and every open PR's docs/plan/ file names
//   node kit.mjs next-id [n] --reserve                                                 also reserves the ids on origin (refs/kit-reserved/K<n>) so no other session gets them
//   node kit.mjs worktree --branch <b> | worktree --here | finish [--comment] [--body <PR body file>] | teardown --worktree <dir>   worker commands, plain node (scripts/agent.mjs, pulled as kit/agent.mjs); finish prints PASS|FAIL <sha> (with --check: check passed|failed <sha> (check: <command>), never PASS); without --check it first fails unless each file added under src/ is a line of the PR body's "Built new" section: - <file or folder> | search: <words>; <other words> | nearest: <kit part or none> | why: <reason> (K684; ignore globs: package.json kit.builtNew.ignore; renames are not new; a folder covers files only two levels below src/, e.g. src/ui/motion/)
//   node kit.mjs claims <file> [--repo <game repo>] [--before <old file>]   K698: the claim lines of one file (as on disk, any path; --before: only new or changed lines) checked with finish's claim rules; exit 1 on claim problems, 2 on usage or a missing file, 0 clean
//   node kit/kit.mjs outdated [<game-kit checkout>]                                    the game's tag vs the latest, the PLAN rows and breaking notes between them
//   node <trusted checkout>/kit.mjs check [--source <game-kit checkout>]                checks installed files and managed worker rules against the lock; --source also checks the pin and reconstructs its installed docs; legacy locks have partial coverage (upgrade-kit recipe). The installed CLI can check ordinary drift. K675 also checks component bypass patterns in src/. K786: three guards that need a game setting (cardIdLiteral in repo-gate.config.json once an engine file imports kit/card-language; a lane running plancheck.py once plan-checker is pulled and docs/BUILD_PLAN*.md exists; a lane running traceability once it is pulled) fail with package.json kit.rules >= 2 (written by `new`), and are warning: lines without it; engine test files count only with engineTests: true; a repo-gate.config.json that does not parse is reported the same way; kit.rules is the higher of the working tree's and the one at the git merge base with origin/main (else main), and a lowered one fails as `kit.rules lowered from <n>: restore it in package.json`.
import { execFileSync as x, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const [cmd, ...a] = process.argv.slice(2)
const LOCK = 'kit/kit.lock.json'
const digest = (b) => createHash('sha256').update(b).digest('hex')
const text = (b) => b.toString('utf8').replace(/\r\n/g, '\n')
const fileDigest = (b) => digest(b.includes(0) ? b : text(b))
const sha = (f) => fileDigest(fs.readFileSync(f))
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name])).sort()
const readLock = () => (fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : { components: {} })
const gitAt = (src) => (...args) => x('git', ['-C', src, ...args], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] })
const treeNames = (git, commit, ...paths) => git('ls-tree', '-r', '--name-only', '-z', commit, '--', ...paths).toString().split('\0').filter(Boolean)
const WR_START = '<!-- kit:worker-rules start -->', WR_END = '<!-- kit:worker-rules end -->'
const WR_SOURCE = 'docs/worker-rules.md'
const supportPaths = {
  'kit.mjs': 'kit/kit.mjs',
  'scripts/agent.mjs': 'kit/agent.mjs',
  'docs/CATALOG.md': 'kit/CATALOG.md',
}
const supportVersion = 1
const renderer = 'installed-markdown-v1'
const supportMarker = (bytes) => /^\/\/ kit-support-lock: 1$/m.test(text(bytes))
const installedPath = (source) => Object.hasOwn(supportPaths, source) ? supportPaths[source]
  : source.replace(/^docs\/recipes(?=\/|$)/, 'kit/recipes').replace(/^components\//, 'kit/')
const renderMarkdown = (bytes, source, file, installed, directories, commit) => {
  if (!source.endsWith('.md')) return bytes
  let fence, comment = false
  return Buffer.from(text(bytes).split('\n').map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined
      return line
    }
    if (marker) { fence = marker[1]; return line }
    if (/^(?: {4}|\t)/.test(line)) return line
    let start = 0
    if (comment) {
      const end = line.indexOf('-->')
      if (end < 0) return line
      start = end + 3
      comment = false
    }
    return line.slice(0, start) + line.slice(start).replace(/(`+).*?\1(?!`)|<!--.*?(?:-->|$)|(\]\([ \t]*|^ {0,3}\[[^\]]+\]:[ \t]*)(<?)([^<>()\s]+)(>?)/g,
      (match, code, prefix, open, href, close) => {
        if (match.startsWith('<!--') && !match.endsWith('-->')) comment = true
        if (code || !prefix || /^(?:[\w+.-]+:|[/?#])/.test(href)) return match
        const [, name, suffix] = /^([^?#]+)(.*)$/.exec(href)
        const target = posix.join(posix.dirname(source), name)
        if (target === '..' || target.startsWith('../')) return match
        const local = installedPath(target).replace(/\/$/, '')
        const hrefPath = installed.has(local) || directories.has(local)
          ? (posix.relative(posix.dirname(file), local) || '.') + (name.endsWith('/') ? '/' : '')
          : 'https://github.com/pateta51-ops/game-kit/' + (name.endsWith('/') ? 'tree' : 'blob') + '/' + commit + '/' + target
        return prefix + open + hrefPath + suffix + close
      })
  }).join('\n'))
}
const readSupport = (git, commit) => {
  const files = new Map()
  let rules
  for (const source of treeNames(git, commit, ...Object.keys(supportPaths), 'docs/recipes', WR_SOURCE)) {
    const bytes = git('show', commit + ':' + source)
    if (source === WR_SOURCE) rules = bytes
    else files.set(installedPath(source), { source, bytes })
  }
  return { files, rules, versioned: files.has('kit/kit.mjs') && supportMarker(files.get('kit/kit.mjs').bytes) }
}
const supportEntry = (source, bytes, rendered) => ({ source, sourceHash: digest(bytes), hash: fileDigest(rendered) })
const renderSupport = (support, commit, components) => {
  const installed = new Set([...components, ...support.files.keys()])
  const directories = new Set()
  for (const file of installed) {
    for (let dir = posix.dirname(file); dir !== '.' && !directories.has(dir); dir = posix.dirname(dir)) directories.add(dir)
  }
  const render = support.versioned
    ? (bytes, source, file) => renderMarkdown(bytes, source, file, installed, directories, commit)
    : (bytes) => bytes
  const files = Object.fromEntries([...support.files].map(([file, { source, bytes }]) => {
    const rendered = render(bytes, source, file)
    return [file, { entry: supportEntry(source, bytes, rendered), rendered }]
  }))
  const rules = support.rules && wrapRules(render(support.rules, WR_SOURCE, 'AGENTS.md'))
  return { files, rules, render }
}
const compareFiles = (have, files, bad) => {
  for (const f of have) {
    const known = Object.hasOwn(files, f)
    if (!known || !fs.lstatSync(f).isFile() || files[f] !== sha(f)) bad.push((known ? 'changed ' : 'added   ') + f)
  }
  const found = new Set(have)
  for (const f of Object.keys(files)) if (!found.has(f)) bad.push('missing ' + f)
}
const sameSupport = (left, right) => left?.source === right?.source && left?.sourceHash === right?.sourceHash && left?.hash === right?.hash
const wrapRules = (b) => WR_START + '\n' + text(b).trim() + '\n' + WR_END
const extractRules = (file) => {
  if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile()) return
  const body = text(fs.readFileSync(file))
  const i = body.indexOf(WR_START), j = body.indexOf(WR_END)
  if (i >= 0 && j > i) return body.slice(i, j + WR_END.length)
}
const stampRules = (file, body) => {
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const nl = have.includes('\r\n') ? '\r\n' : '\n'
  const i = have.indexOf(WR_START), j = have.indexOf(WR_END)
  let out
  if (i >= 0 && j > i) out = have.slice(0, i) + body.replace(/\n/g, nl) + have.slice(j + WR_END.length)
  else out = have + (have && !have.endsWith('\n') ? nl : '') + (have ? nl : '') + ('## Worker rules (from the kit)\n\n' + body + '\n').replace(/\n/g, nl)
  if (out === have) return null
  fs.writeFileSync(file + '.kit-tmp', out)
  return file + '.kit-tmp'
}
// sections (heading + body) or bullets outside the markers that look like worker rules
const looseRules = (file) => {
  if (!fs.existsSync(file)) return []
  let t = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const i = t.indexOf(WR_START), j = t.indexOf(WR_END)
  if (i >= 0 && j > i) t = t.slice(0, i) + t.slice(j + WR_END.length)
  const re = /worker|\breports?\b|\bcaps?\b|\bfinish\b|kit gap/i
  const found = []
  for (const sec of t.split(/^(?=#{1,6} )/m)) {
    const head = sec.split('\n')[0]
    if (/^#{1,6} /.test(head) && /from the kit/i.test(head)) continue
    if (/^#{1,6} /.test(head) && re.test(head)) found.push(sec.trim())
    else for (const l of sec.split('\n')) if (/^\s*[-*] /.test(l) && re.test(l)) found.push(l.trim())
  }
  return found
}
if (cmd === 'pull') {
  // one tag per game: the whole kit moves to <ref>; component names add to it. Built in kit.new, verified, then swapped in: a failed pull leaves kit/ as it was.
  const [src, ref, ...names] = a
  const old = readLock()
  const converted = Object.values(old.components).some((c) => c.ref) && !old.ref
  const NEW = 'kit.new', OLD = 'kit.old'
  let stamp = null
  const clean = (file) => {
    try { fs.rmSync(file, { recursive: true, force: true }) }
    catch (e) { console.warn('could not remove ' + file + ': ' + e.message) }
  }
  const fail = (message, status = 'kit/ is unchanged') => {
    clean(NEW)
    if (stamp) clean(stamp)
    console.error('pull failed, ' + status + ': ' + message)
    process.exit(1)
  }
  if (fs.lstatSync(OLD, { throwIfNoEntry: false })) {
    console.error('pull stopped: recovery backup kit.old already exists; inspect it before retrying')
    process.exit(1)
  }
  fs.rmSync(NEW, { recursive: true, force: true })
  const gs = gitAt(src)
  let commit
  try { commit = gs('rev-parse', ref + '^{commit}').toString().trim() } catch { fail('no tag or commit ' + ref + ' in ' + src) }
  const lock = { ref, commit, components: {} }
  const todo = [...new Set([...Object.keys(old.components), ...names])]
  fs.mkdirSync(NEW, { recursive: true })
  for (let i = 0; i < todo.length; i++) {
    const n = todo[i]
    fs.mkdirSync(NEW + '/' + n, { recursive: true })
    try {
      const tar = x('git', ['-C', src, 'archive', commit, 'components/' + n], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] })
      x('tar', ['-xf', '-', '--strip-components=2', '-C', NEW + '/' + n], { input: tar, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch { fail('component ' + n + ' is not in ' + ref) }
    if (!fs.readdirSync(NEW + '/' + n).length) fail('component ' + n + ' is empty in ' + ref)
    const cj = NEW + '/' + n + '/component.json'
    if (fs.existsSync(cj)) for (const m of JSON.parse(fs.readFileSync(cj, 'utf8')).needs ?? []) if (!todo.includes(m)) todo.push(m)
    lock.components[n] = { files: Object.fromEntries(walk(NEW + '/' + n).map((f) => [f.replace(NEW + '/', 'kit/'), sha(f)])) }
  }
  let support
  try { support = readSupport(gs, commit) } catch (e) { fail('support files did not copy: ' + String(e.stderr ?? e.message).trim().split('\n')[0]) }
  if (!support.files.has('kit/kit.mjs')) fail('no kit.mjs in ' + ref)
  const staged = (file) => NEW + file.slice('kit'.length)
  let rendering
  try {
    const installed = Object.values(lock.components).flatMap((c) => Object.keys(c.files))
    rendering = renderSupport(support, commit, installed)
    const files = {}
    for (const [file, { entry, rendered }] of Object.entries(rendering.files)) {
      fs.mkdirSync(dirname(staged(file)), { recursive: true })
      fs.writeFileSync(staged(file), rendered)
      files[file] = entry
    }
    if (support.versioned) {
      for (const file of installed.filter((f) => f.endsWith('.md'))) {
        const source = file.replace(/^kit\//, 'components/')
        const dest = staged(file)
        if (!fs.lstatSync(dest).isFile()) fail('expected a regular Markdown file at ' + file)
        const bytes = rendering.render(fs.readFileSync(dest), source, file)
        fs.writeFileSync(dest, bytes)
        lock.components[file.split('/')[1]].files[file] = fileDigest(bytes)
      }
      lock.support = { version: supportVersion, renderer, files }
      if (rendering.rules !== undefined) lock.support.workerRules = supportEntry(WR_SOURCE, support.rules, Buffer.from(rendering.rules))
    } else {
      const recipes = Object.fromEntries(Object.entries(files).filter(([f]) => f.startsWith('kit/recipes/')).map(([f, e]) => [f, e.hash]))
      if (Object.keys(recipes).length) lock.recipes = { files: recipes }
      if (files['kit/agent.mjs']) lock.agent = files['kit/agent.mjs'].hash
    }
  } catch (e) { fail('support files did not copy: ' + String(e.stderr ?? e.message).trim().split('\n')[0]) }

  const entries = Object.values(lock.components).flatMap((c) => Object.entries(c.files))
  if (process.env.KIT_TEST_FAULT === 'verify' && entries.length) fs.appendFileSync(staged(entries[0][0]), 'x')
  if (process.env.KIT_TEST_FAULT === 'verify-support') fs.appendFileSync(staged('kit/kit.mjs'), 'x')
  const expected = Object.entries(rendering.files).map(([file, { entry }]) => [file, entry.hash])
  for (const [file, hash] of [...entries, ...expected]) if (!fs.existsSync(staged(file)) || sha(staged(file)) !== hash) fail('file ' + file + ' did not verify')
  fs.writeFileSync(NEW + '/kit.lock.json', JSON.stringify(lock, null, 1) + '\n')
  try {
    if (rendering.rules !== undefined) stamp = stampRules('AGENTS.md', rendering.rules)
  } catch (e) { fs.rmSync('AGENTS.md.kit-tmp', { force: true }); fail('worker rules were not stamped into AGENTS.md: ' + String(e.stderr ?? e.message).trim().split('\n')[0]) }
  const had = fs.existsSync('kit')
  const F = process.env.KIT_TEST_FAULT ?? ''
  const BUSY = ['EPERM', 'EACCES', 'EBUSY']
  const rn = (a, b) => {
    for (let i = 0; ; i++) {
      try { if (F.includes('rename-eperm') || (F.includes('rename2') && a !== 'kit')) throw Object.assign(new Error('EPERM forced'), { code: 'EPERM' }); return fs.renameSync(a, b) } catch (e) { if (!BUSY.includes(e.code) || F || i >= 9) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100) }
    }
  }
  const fill = (from, to) => {
    fs.mkdirSync(to, { recursive: true })
    const entries = new Map(fs.readdirSync(from, { withFileTypes: true }).map((e) => [e.name, e]))
    for (const existing of fs.readdirSync(to, { withFileTypes: true })) {
      const want = entries.get(existing.name)
      if (!want || want.isDirectory() !== existing.isDirectory() || want.isSymbolicLink() || existing.isSymbolicLink()) {
        fs.rmSync(to + '/' + existing.name, { recursive: true, force: true })
      }
    }
    for (const [name, entry] of entries) {
      const src = from + '/' + name, dest = to + '/' + name
      if (entry.isDirectory()) fill(src, dest)
      else if (entry.isSymbolicLink()) fs.cpSync(src, dest, { verbatimSymlinks: true })
      else fs.copyFileSync(src, dest)
    }
  }
  let backedUp = false, copyReason
  let operation = 'swap'
  try {
    try {
      if (had) { rn('kit', OLD); backedUp = true }
      if (F === 'swap') throw new Error('forced')
      rn(NEW, 'kit')
    } catch (e) {
      if (!BUSY.includes(e.code)) throw e
      if (had && !backedUp) {
        try { fs.cpSync('kit', OLD, { recursive: true, verbatimSymlinks: true }) }
        catch (cause) { clean(OLD); throw cause }
        backedUp = true
      }
      if (F.includes('fallback')) throw new Error('forced', { cause: e })
      fill(NEW, 'kit')
      copyReason = e.code
    }
    operation = 'worker rules were not installed'
    if (stamp) fs.renameSync(stamp, 'AGENTS.md')
  } catch (error) {
    const message = operation + ': ' + error.message
    try {
      if (backedUp) {
        if (!fs.existsSync('kit')) {
          try { rn(OLD, 'kit') } catch (cause) { if (!BUSY.includes(cause.code)) throw cause }
        }
        if (fs.existsSync(OLD)) { fill(OLD, 'kit'); clean(OLD) }
      } else if (!had) fs.rmSync('kit', { recursive: true, force: true })
    } catch (rollback) {
      fail(message + '\nrollback failed: ' + rollback.message, backedUp ? 'recovery copy kept in kit.old' : 'kit/ may be incomplete')
    }
    fail(message)
  }
  clean(NEW)
  clean(OLD)
  if (copyReason) console.log('kit/ replaced by copy (' + copyReason + ')')
  if (converted) console.log('converted the per-component locks to one tag: ' + ref)
  console.log('pulled ' + ref + ': ' + Object.keys(lock.components).join(', '))
} else if (cmd === 'worker-rules') {
  const g = a[a.indexOf('--adopt') + 1]
  if (a.indexOf('--adopt') < 0 || !g) { console.error('usage: kit.mjs worker-rules --adopt <game folder>'); process.exit(2) }
  const f = resolve(g, 'AGENTS.md'), l = looseRules(f)
  console.log(l.length ? 'Hand-written worker rules outside the kit markers in ' + f + ' (remove them; the block replaces them):\n\n' + l.join('\n\n') : 'none outside the markers')
} else if (cmd === 'state') {
  x('node', [dirname(fileURLToPath(import.meta.url)) + '/scripts/state.mjs'], { stdio: 'inherit' })
} else if (cmd === 'worktree' || cmd === 'finish' || cmd === 'teardown' || cmd === 'claims') {
  process.exit(spawnSync('node', [[dirname(fileURLToPath(import.meta.url)) + '/agent.mjs', dirname(fileURLToPath(import.meta.url)) + '/scripts/agent.mjs'].find((p) => fs.existsSync(p)), cmd, ...a], { stdio: 'inherit' }).status ?? 2)
} else if (cmd === 'next-id') {
  const ff = a.indexOf('--from')
  const cnt = Number(a.find((v, i) => /^\d+$/.test(v) && (ff < 0 || i < ff)) ?? 1)
  let texts
  if (ff >= 0) texts = a.slice(ff + 1).map((f) => fs.statSync(f).isDirectory() ? fs.readdirSync(f).map((n) => n.replace(/^(K\d+).*/, '| $1 |')).join('\n') : fs.readFileSync(f, 'utf8'))
  else {
    const sh = (...v) => { try { return x('git', v, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }
    const plan = (r) => { const t = sh('show', r + ':docs/PLAN.md') + sh('ls-tree', '--name-only', r, 'docs/plan/').replace(/^docs\/plan\/(K\d+)\S*$/gm, '| $1 |'); if (!t) throw new Error('no plan'); return t }
    try { x('git', ['fetch', '-q', 'origin']) } catch { console.error('warning: fetch failed, using the local origin/main') }
    texts = [plan('origin/main')]
    try {
      for (const { number } of JSON.parse(x('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number'], { encoding: 'utf8' }))) {
        try { x('git', ['fetch', '-q', 'origin', 'pull/' + number + '/head:refs/kit-next-id/' + number, '--force']); texts.push(plan('refs/kit-next-id/' + number)) } catch { /* PR without docs/PLAN.md */ }
      }
    } catch { console.error('warning: gh missing or offline, only origin/main was read: an open PR may already use the number') }
  }
  const top = Math.max(0, ...texts.flatMap((t) => [...t.matchAll(/^\|\s*K(\d+)\s*\|/gm)].map((m) => Number(m[1]))))
  let ids = Array.from({ length: cnt }, (_, i) => top + 1 + i)
  let res = 0
  try { res = Math.max(0, ...x('git', ['ls-remote', 'origin', 'refs/kit-reserved/*'], { encoding: 'utf8' }).split(/\r?\n/).map((l) => Number(l.match(/refs\/kit-reserved\/K(\d+)$/)?.[1] ?? 0))) } catch { /* no origin */ }
  if (res >= ids[0]) ids = ids.map((n) => n + res + 1 - ids[0])
  if (a.includes('--reserve')) {
    // a reservation is a ref refs/kit-reserved/K<n> on origin, pushed only if absent (empty lease): the second session's push fails, it takes the next number
    const out = []
    for (let n = ids[0]; out.length < cnt; n++) {
      try { x('git', ['push', '-q', '--force-with-lease=refs/kit-reserved/K' + n + ':', 'origin', 'origin/main:refs/kit-reserved/K' + n], { stdio: 'pipe' }); out.push(n) } catch (e) {
        if (!/stale info|already exists|rejected/i.test(String(e.stderr))) { console.error('reserve failed: ' + String(e.stderr).trim()); process.exit(1) }
      }
    }
    ids = out
  }
  console.log(ids.map((n) => 'K' + n).join(' '))
} else if (cmd === 'check') {
  if (!fs.existsSync(LOCK)) { console.error('missing ' + LOCK); process.exit(1) }
  const lock = readLock()
  const bad = []
  for (const [n, c] of Object.entries(lock.components)) {
    const have = fs.existsSync('kit/' + n) ? walk('kit/' + n) : []
    for (const f of have) if (c.files[f] !== sha(f)) bad.push((f in c.files ? 'changed ' : 'added   ') + f)
    for (const f of Object.keys(c.files)) if (!have.includes(f)) bad.push('missing ' + f)
    const cj = 'kit/' + n + '/component.json'
    if (fs.existsSync(cj)) for (const m of JSON.parse(fs.readFileSync(cj, 'utf8')).needs ?? []) if (!lock.components[m]) bad.push(n + ' needs ' + m + ' (not pulled)')
  }
  const rootFiles = Object.values(supportPaths)
  let recipes = !!lock.recipes
  if (lock.support) {
    const { version, renderer: rendering, files, workerRules } = lock.support
    if (version !== supportVersion || rendering !== renderer || !files || !Object.hasOwn(files, 'kit/kit.mjs')) {
      bad.push('unsupported or incomplete support manifest in ' + LOCK)
    } else {
      recipes = Object.keys(files).some((file) => file.startsWith('kit/recipes/'))
      const have = rootFiles.filter((file) => fs.lstatSync(file, { throwIfNoEntry: false }))
      if (recipes) {
        const dir = fs.lstatSync('kit/recipes', { throwIfNoEntry: false })
        if (dir?.isDirectory()) have.push(...walk('kit/recipes'))
        else if (dir) bad.push('changed kit/recipes')
      }
      compareFiles(have, Object.fromEntries(Object.entries(files).map(([file, entry]) => [file, entry?.hash])), bad)
      if (workerRules) {
        const rules = extractRules('AGENTS.md')
        if (rules === undefined || digest(rules) !== workerRules.hash) bad.push((rules === undefined ? 'missing ' : 'changed ') + 'AGENTS.md worker rules')
      }
    }
  } else {
    if (recipes) {
      const dir = fs.lstatSync('kit/recipes', { throwIfNoEntry: false })
      if (dir && !dir.isDirectory()) bad.push('changed kit/recipes')
      compareFiles(dir?.isDirectory() ? walk('kit/recipes') : [], lock.recipes.files, bad)
    }
    if (lock.agent && (!fs.existsSync('kit/agent.mjs') || sha('kit/agent.mjs') !== lock.agent)) bad.push('changed kit/agent.mjs')
    if (fs.existsSync(LOCK)) {
      if (fs.lstatSync('kit/kit.mjs', { throwIfNoEntry: false })?.isFile() && supportMarker(fs.readFileSync('kit/kit.mjs'))) {
        bad.push('support manifest missing for this pin; re-pull the same ref with the kit checkout CLI')
      } else console.warn('warning: legacy lock checks only recorded files; kit.mjs and CATALOG.md are outside its coverage. See the upgrade-kit recipe.')
    }
  }
  const knownRoots = ['kit.lock.json', ...rootFiles.filter((file) => !lock.support || Object.hasOwn(lock.support.files ?? {}, file)).map((file) => file.slice(4))]
  if (recipes) knownRoots.push('recipes')
  if (fs.existsSync('kit')) for (const e of fs.readdirSync('kit')) if (!lock.components[e] && !knownRoots.includes(e)) bad.push('stray   kit/' + e + ' (not in the lock)')
  if (bad.length) {
    console.error('kit/ differs from kit/kit.lock.json. Change the code in the game-kit repo and pull a new version; never edit this copy.\n' + bad.join('\n'))
    process.exit(1)
  }
  const lr = looseRules('AGENTS.md')
  if (lr.length) console.warn('warning: AGENTS.md has ' + lr.length + ' worker-rule section(s) outside the kit markers; list them with: node kit/kit.mjs worker-rules --adopt .')
  const si = a.indexOf('--source')
  if (si >= 0) {
    const src = a[si + 1], drift = []
    if (!src || !lock.ref || !lock.commit) { console.error('check --source needs a game-kit checkout and a lock with ref and commit'); process.exit(1) }
    const gs = gitAt(src)
    let now
    try { now = gs('rev-parse', lock.ref + '^{commit}').toString().trim() } catch { drift.push('tag ' + lock.ref + ' not found in ' + src + ' (run git fetch --tags in ' + src + ')') }
    if (now && now !== lock.commit) drift.push('tag ' + lock.ref + ' moved: the lock has ' + lock.commit + ', ' + src + ' has ' + now)
    if (!drift.length) {
      try {
        const support = readSupport(gs, lock.commit)
        const components = Object.entries(lock.components).map(([n, c]) => ({
          files: c.files, sources: treeNames(gs, lock.commit, 'components/' + n),
        }))
        let render = (b) => b
        if (support.versioned) {
          if (!lock.support) drift.push('support manifest missing for this pin; re-pull the same ref with the kit checkout CLI')
          else {
            const expected = renderSupport(support, lock.commit, components.flatMap((c) => c.sources.map(installedPath)))
            render = expected.render
            for (const [file, { entry }] of Object.entries(expected.files)) {
              if (!sameSupport(lock.support.files[file], entry)) drift.push('support differs from the pinned source or its installed rendering: ' + file)
            }
            for (const file of Object.keys(lock.support.files)) if (!Object.hasOwn(expected.files, file)) drift.push('support file not in the pinned source: ' + file)
            const rules = expected.rules === undefined ? undefined : supportEntry(WR_SOURCE, support.rules, Buffer.from(expected.rules))
            if (!sameSupport(lock.support.workerRules, rules)) drift.push('support differs from the pinned source or its installed rendering: AGENTS.md worker rules')
          }
        } else if (lock.support) drift.push('pinned source predates this support manifest')
        else {
          const recorded = { ...lock.recipes?.files, ...(lock.agent ? { 'kit/agent.mjs': lock.agent } : {}) }
          for (const [file, hash] of Object.entries(recorded)) {
            if (!support.files.has(file) || fileDigest(support.files.get(file).bytes) !== hash) drift.push('content differs from the tagged commit: ' + file)
          }
          if (lock.recipes) for (const file of support.files.keys()) {
            if (file.startsWith('kit/recipes/') && !Object.hasOwn(recorded, file)) drift.push('in the tagged commit, not in the lock: ' + file)
          }
        }
        for (const { files, sources } of components) {
          const want = new Set(sources.map(installedPath))
          for (const file of Object.keys(files)) if (!want.has(file)) drift.push('not in the tagged commit: ' + file)
          for (const source of sources) {
            const file = installedPath(source)
            if (!Object.hasOwn(files, file)) { drift.push('in the tagged commit, not in the lock: ' + file); continue }
            const bytes = gs('show', lock.commit + ':' + source)
            if (fileDigest(render(bytes, source, file)) !== files[file]) drift.push('content differs from the tagged commit: ' + file)
          }
        }
      } catch (e) { drift.push('could not read the pinned source: ' + String(e.stderr ?? e.message).trim().split('\n')[0]) }
    }
    if (drift.length) { console.error('kit/ does not match ' + lock.ref + ' in ' + src + '\n' + drift.join('\n')); process.exit(1) }
  }
  if (fs.existsSync('package.json')) {
    const pj = JSON.parse(fs.readFileSync('package.json', 'utf8')), have = { ...pj.dependencies, ...pj.devDependencies }
    for (const n of Object.keys(lock.components)) {
      const cj = 'kit/' + n + '/component.json'
      const miss = fs.existsSync(cj) ? (JSON.parse(fs.readFileSync(cj, 'utf8')).packages ?? []).filter((m) => !(m in have)) : []
      if (miss.length) console.warn('warning: ' + n + ' needs package(s) this game lacks: ' + miss.join(', '))
    }
  }
  // K675: each pulled component's component.json `bypass` patterns, run over the game's src/ (not kit/, not tests)
  const pats = Object.keys(lock.components).flatMap((n) => { const cj = 'kit/' + n + '/component.json'; return fs.existsSync(cj) ? (JSON.parse(fs.readFileSync(cj, 'utf8')).bypass ?? []).map((p) => ({ ...p, from: n })) : [] })
  if (pats.length && fs.existsSync('src')) {
    const hits = []
    const files = walk('src').filter((f) => /\.(m?[jt]sx?|cjs|vue|svelte)$/.test(f) && !/(^|\/)(node_modules|kit|tests?|__tests__)\//.test(f.slice(4)) && !/\.(test|spec)\.[^/]+$/.test(f))
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8'), lines = t.split(/\r?\n/)
      for (const p of pats) {
        if (!(p.imports ?? [p.from]).some((m) => new RegExp('(from|import|require)\\s*\\(?\\s*[\'"]([^\'"\\n]*/)?' + m + '(/[^\'"\\n]*)?[\'"]').test(t))) continue
        for (const m of t.matchAll(new RegExp(p.match, 'g' + (p.flags ?? '')))) {
          const ln = t.slice(0, m.index).split('\n').length
          const al = [lines[ln - 1], lines[ln - 2] ?? ''].map((l) => l.match(new RegExp('kit-allow\\s+' + p.id + '(?![\\w-])(:\\s*(\\S.*))?'))).find(Boolean)
          if (al && al[2]) continue
          hits.push(f + ':' + ln + ' ' + p.id + ' (' + p.from + '): ' + (al ? 'kit-allow ' + p.id + ' needs a reason (// kit-allow ' + p.id + ': <reason>); ' : '') + p.hook)
        }
      }
    }
    if (hits.length) { console.error('src/ goes around a kit part. Use the hook named, or put // kit-allow <id>: <reason> on the line.\n' + hits.join('\n')); process.exit(1) }
  }
  // K786: guards that need a game setting. package.json kit.rules >= 2 (written by `new`): each unset one fails; below 2: a warning
  const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return {} } }
  const pj = J('package.json'), sc = pj.scripts ?? {}, CR = 'scripts/check-runner.config.json', unset = [], sl = (s) => String(s).replace(/\\/g, '/')
  let rg = {}
  try { if (fs.existsSync('repo-gate.config.json')) rg = JSON.parse(fs.readFileSync('repo-gate.config.json', 'utf8')) } catch (e) { rg = null; unset.push('repo-gate.config.json could not be read (' + e.message.split('\n')[0] + '): fix it, kit check reads engineFolders and cardIdLiteral from it') }
  const eng = rg && (rg.engineFolders ?? ['src/engine/']).map((d) => sl(d).replace(/^\.\//, '').replace(/\/$/, '')).filter((d) => fs.existsSync(d)).flatMap(walk).find((f) => /\.(m?[jt]sx?|cjs)$/.test(f) && (rg.engineTests === true || !/\.test\.[^/]+$|(^|\/)__tests__\//.test(f)) && /['"][^'"\n]*kit\/card-language[/'"]/.test(fs.readFileSync(f, 'utf8')))
  if (eng && !rg.cardIdLiteral) unset.push(eng + ' imports kit/card-language: set "cardIdLiteral" (the regexp of a quoted card id) in repo-gate.config.json, so repo-gate fails card ids written in engine code (CONTENT_ID)')
  // the scripts the check runs: those named in the check-runner config (all of package.json without one), and the scripts they run with npm
  const ran = new Set()
  const reach = (s) => { if (!Object.hasOwn(sc, s) || ran.has(s)) return; ran.add(s); for (const m of String(sc[s]).matchAll(/npm(?: run(?:-script)?)?((?: -\S+)*) ([\w:.-]+)/g)) reach(m[2]) }
  for (const s of fs.existsSync(CR) ? [...JSON.stringify(J(CR)).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]) : Object.keys(sc)) reach(s)
  const runs = (re) => [...ran].some((s) => re.test(sl(sc[s])) || sl(sc[s]).split(/\s+/).some((w) => /\.(m?[jt]s|cjs|py|sh)$/.test(w) && !w.startsWith('kit/') && fs.existsSync(w) && re.test(fs.readFileSync(w, 'utf8'))))
  const wire = ' to package.json and to a lane of ' + CR
  const plan = lock.components['plan-checker'] && fs.existsSync('docs') && fs.readdirSync('docs').find((f) => /^BUILD_PLAN.*\.md$/.test(f))
  if (plan && !runs(/plancheck\.(py|ts)/)) unset.push('kit/plan-checker is pulled and docs/' + plan + ' exists: add a script that runs kit/plan-checker/plancheck.py on it' + wire)
  if (lock.components.traceability && !runs(/kit\/traceability\//)) unset.push('kit/traceability is pulled: add a script that runs kit/traceability/check-traceability.ts' + wire)
  // kit.rules cannot be lowered on a branch: the value at the merge base with origin/main (else main) counts when it is higher
  let was = 0
  const gt = (...v) => { try { return x('git', v, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  const mb = gt('merge-base', 'HEAD', 'origin/main') || gt('merge-base', 'HEAD', 'main')
  try { if (mb) was = Number(JSON.parse(gt('show', mb + ':./package.json')).kit?.rules) || 0 } catch { /* no package.json there */ }
  const now = Number(pj.kit?.rules ?? 1) || 0
  const fails = Math.max(now, was) >= 2 ? [...unset] : []
  if (now < was && was > 1) fails.unshift('kit.rules lowered from ' + was + ': restore it in package.json')
  if (fails.length) { console.error('kit check: a game setting is wrong or unset (package.json kit.rules ' + Math.max(now, was) + ': these fail).\n' + fails.join('\n')); process.exit(1) }
  for (const u of unset) console.warn('warning: ' + u)
  const names = Object.keys(lock.components).join(', ') || 'no components'
  console.log(lock.ref ? 'kit ok at ' + lock.ref + ': ' + names : 'kit ok: ' + (Object.entries(lock.components).map(([n, c]) => n + '@' + c.ref).join(', ') || names) + (Object.keys(lock.components).length ? ' (per-component locks: the next pull converts them to one tag)' : ''))
} else if (cmd === 'outdated') {
  // node kit/kit.mjs outdated [<game-kit checkout>]: the game's tag against the latest, and the rows and breaking notes between them
  const src = a[0] ?? '../game-kit'
  const lock = readLock()
  const g = (...v) => x('git', ['-C', src, ...v], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    const num = (r) => (r.match(/\d+/g) ?? []).map(Number)
    const refs = lock.ref ? [lock.ref] : Object.values(lock.components).map((c) => c.ref)
    const mine = refs.sort((p, q) => { const u = num(p), v = num(q); return (u[0] - v[0]) || (u[1] - v[1]) || (u[2] - v[2]) || 0 })[0]
    const latest = g('tag', '--sort=-v:refname').split(/\r?\n/).find((t) => /^v\d/.test(t))
    console.log('game kit: ' + (mine ?? 'none') + (lock.ref ? '' : ' (oldest of per-component locks)') + '; latest: ' + latest)
    if (!mine || mine === latest) { console.log('up to date'); process.exit(0) }
    const nm = num(mine), nl = num(latest)
    if (((nm[0] - nl[0]) || (nm[1] - nl[1]) || (nm[2] - nl[2]) || 0) > 0) { console.log(mine + ' is newer than the latest tag ' + latest + ' in ' + src + ' (nothing to pull; is that checkout current?)'); process.exit(0) }
    const titles = g('log', '--format=%s', mine + '..' + latest).split(/\r?\n/).filter(Boolean)
    const rows = titles.filter((t) => /^K\d+/.test(t))
    console.log('PLAN rows since ' + mine + ': ' + (rows.length || 'none'))
    for (const t of rows) console.log('  ' + t + (/breaking/i.test(t) ? '   <- BREAKING' : ''))
    for (const t of titles) if (/breaking/i.test(t) && !rows.includes(t)) console.log('  breaking: ' + t)
    for (const n of Object.keys(lock.components)) {
      let d = ''
      try { d = g('diff', '-U0', mine, latest, '--', 'components/' + n + '/README.md') } catch { /* no such ref or file */ }
      for (const l of d.split(/\r?\n/)) if (l.startsWith('+') && !l.startsWith('+++') && /breaking/i.test(l)) console.log('  README ' + n + ': ' + l.slice(1).trim())
    }
  } catch (e) { console.error('outdated failed: ' + String(e.stderr ?? e.message).trim()); process.exit(1) }
} else if (cmd === 'list' || cmd === 'search' || cmd === 'effects') {
  const d = dirname(fileURLToPath(import.meta.url))
  const f = [d + '/CATALOG.md', d + '/docs/CATALOG.md'].find((p) => fs.existsSync(p))
  const logFile = resolve(os.homedir(), '.game-kit/search-misses.log')
  if (cmd === 'search' && a[0] === '--misses') {
    const n = Number(a[1]) || 10
    console.log(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n).reverse().join('\n') : 'no misses logged')
    process.exit(0)
  }
  if (cmd === 'search' && a[0] === '--check') {
    // K673: every case of docs/search-cases.json: `first` (a part, `<part>/<sub>`, an effect id or K<n>) names the first line, or "none": no hit and no candidate
    const cf = [d + '/docs/search-cases.json', d + '/search-cases.json'].find((p) => fs.existsSync(p))
    if (!cf) { console.error('no docs/search-cases.json beside kit.mjs'); process.exit(2) }
    const home = fs.mkdtempSync(resolve(os.tmpdir(), 'kit-search-'))
    const bad = []
    const cases = JSON.parse(fs.readFileSync(cf, 'utf8'))
    for (const { q, first } of cases) {
      const o = spawnSync('node', [fileURLToPath(import.meta.url), 'search', ...q.split(' ')], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } }).stdout ?? ''
      const L = o.split(/\r?\n/).filter(Boolean), l0 = L[0] ?? ''
      const miss = o.includes('not in the kit by that name') || L.every((l) => / -> not in the kit/.test(l))
      const part = (n) => n === first || n?.startsWith(first + '/')
      const names = /^K\d+$/.test(first) ? (l0.match(/candidate (K\d+)/) ?? [])[1] === first : l0.startsWith('mechanic: ') ? part((l0.split(' -> ')[1]?.match(/`([^`]+)`/) ?? [])[1]) : part((l0.match(/\(`([^`]+)`\)/) ?? [])[1]) || l0.startsWith(first + ':') || l0.startsWith(first + ' (')
      const ok = first === 'none' ? miss && !/candidate K\d+/.test(o) : !o.includes('not in the kit by that name') && names
      if (!ok) bad.push('search "' + q + '": want ' + (first === 'none' ? 'nothing (not in the kit, no candidate)' : first + ' on the first line, and a hit') + '; got: ' + (first === 'none' && miss ? L.find((l) => /candidate K\d+/.test(l)) ?? l0 : l0).slice(0, 160) + (o.includes('not in the kit by that name') ? ' ... not in the kit by that name' : ''))
    }
    fs.rmSync(home, { recursive: true, force: true })
    if (bad.length) { console.error(bad.join('\n')); console.error(bad.length + ' of ' + cases.length + ' search cases failed'); process.exit(1) }
    console.log('search cases ok: ' + cases.length)
    process.exit(0)
  }
  if (!f || (cmd === 'search' && !a.length)) { console.error(f ? 'usage: kit.mjs search <word>' : 'no CATALOG.md beside kit.mjs: pull again'); process.exit(2) }
  const secs = fs.readFileSync(f, 'utf8').split(/^## /m).slice(1).map((t) => t.split(/^### /m).map((p) => p.split(/\r?\n/)))
  const exportsOf = (n) => {
    const out = new Set()
    const seen = new Set()
    const scan = (file) => {
      if (seen.has(file)) return
      seen.add(file)
      const src = fs.readFileSync(file, 'utf8')
      for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+(\w+)/gm)) out.add(m[1])
      for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/gm)) {
        for (const e of m[1].split(',')) { const w = e.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop(); if (w) out.add(w) }
        if (m[2]) next(file, m[2])
      }
      for (const m of src.matchAll(/^export\s+\*(?:\s+as\s+(\w+))?\s*from\s*['"]([^'"]+)['"]/gm)) { if (m[1]) out.add(m[1]); else next(file, m[2]) }
    }
    const next = (from, rel) => {
      if (!rel.startsWith('.')) return
      const b = resolve(dirname(from), rel)
      const f = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'].map((e) => b + e).find((q) => fs.existsSync(q) && fs.statSync(q).isFile())
      if (f) scan(f)
    }
    for (const c of [d + '/components/' + n, d + '/' + n]) {
      const f = ['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((e) => c + '/' + e).find((q) => fs.existsSync(q))
      if (f) { scan(f); break }
    }
    return [...out]
  }
  const stem = (w) => { if (w.length > 3) w = w.replace(/s$/, ''); if (w.length > 4) w = w.replace(/(ed|ing)$/, ''); if (w.length > 3) w = w.replace(/e$/, ''); return w }
  const camel = (t) => String(t ?? '').replace(/([a-z])([A-Z])/g, '$1 $2')
  const toks = (t) => camel(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem)
  const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'it', 'is', 'and', 'or', 'for', 'at', 'my', 'with'])
  const words = a.flatMap(toks).filter((w) => !stop.has(w))
  const hasTok = (t, w) => t.some((x) => x === w || (w.length > 3 && x.startsWith(w)))
  const bullet = (t, k) => (t.find((l) => l.startsWith('- **' + k + ':**')) ?? '').replace(/^- \*\*[^*]*\*\*\s*/, '')
  const ents = []
  for (const [t, ...subs] of secs) {
    const [n, , purpose, , use] = t
    const title = bullet(t, 'Also called'), u = bullet(t, 'Use it when') || (use ?? '').replace('- **Use it when:** ', '')
    const pur = (purpose ?? '').split(/(?<=\.)\s/)[0].slice(0, 200)
    const exl = cmd === 'search' ? exportsOf(n) : []
    const sfx = (hit) => hit.length ? ' [export: ' + hit.slice(0, 8).join(', ') + ']' : ''
    // K685: each "- **Hook:** name + name: what it does" line of the catalogue; a hook holding every query word ranks its component first and prints under it
    const hk = t.filter((l) => l.startsWith('- **Hook:** ')).map((l) => l.slice(12).trim()).map((h) => ({ h, t: toks(h).concat(toks(h.toLowerCase())) }))
    ents.push({ id: toks(n), title: toks(n + ' ' + title + ' ' + bullet(t, 'Words')), use: toks(pur + ' ' + u + ' ' + bullet(t, 'Looks like')), ex: exl.map((e) => toks(e).concat(toks(e.toLowerCase()))), exl, eff: false, hk,
      line: (hit) => title ? title + ' (`' + n + '`): Use: ' + u + sfx(hit) : n + ': ' + pur + ' ' + (u ? '(use when: ' + u.replace(/\.$/, '') + '.)' : '') + sfx(hit),
      listLine: title ? n + ': ' + title + '. Use: ' + u : n + ': ' + (use ?? '').replace('- **Use it when:** ', '(use when: ') + (use ? ')' : '') })
    // K524: a part inside a big part is its own entry, naming the guide to read
    for (const sl of subs) {
      const sn = sl[0].trim(), st = bullet(sl, 'Also called'), su = bullet(sl, 'Use it when'), g = bullet(sl, 'Guide').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      ents.push({ id: toks(sn), title: toks(sn + ' ' + st + ' ' + bullet(sl, 'Words')), use: toks(su), ex: [], exl: [], eff: false, line: () => st + ' (`' + sn + '`): Use: ' + su + ' Guide: ' + n + '/' + g })
    }
  }
  const ef = [d + '/components/effect-library/catalog.json', d + '/effect-library/catalog.json'].find((p) => fs.existsSync(p))
  if (cmd === 'effects' && a[0] === '--used') {
    // K506: counts each effect id and old id in the specs (json) and code (ts, tsx, js) of the given folders
    const dirs = a.slice(1)
    if (!ef || !dirs.length || dirs.some((g) => !fs.existsSync(g))) { console.error(ef ? 'usage: kit.mjs effects --used <folder>...' : 'no effect catalog beside kit.mjs'); process.exit(2) }
    const files = (g) => fs.statSync(g).isDirectory() ? fs.readdirSync(g).filter((n) => !n.startsWith('.') && !['node_modules', 'kit', 'dist', 'build', 'test-results'].includes(n)).flatMap((n) => files(g + '/' + n)) : /\.(json|[mc]?js|jsx|tsx?)$/.test(g) ? [g] : []
    const text = dirs.flatMap(files).map((g) => fs.readFileSync(g, 'utf8')).join('\n')
    const n = (re) => (text.match(new RegExp(re, 'g')) ?? []).length
    const count = (id) => { const r = n(`\\bregister\\w*\\(\\s*(?:[\\w.]+\\s*,\\s*)?(['"\`])${id}\\1`); return (n(`(['"\`])${id}\\1` + (/[A-Z]/.test(id) ? `|\\b${id}\\(` : '')) - r) + ' uses, ' + r + ' registrations' }
    const seen = new Set()
    for (const e of JSON.parse(fs.readFileSync(ef, 'utf8'))) {
      if (!seen.has(e.id)) { seen.add(e.id); console.log(e.id + ': ' + count(e.id)) }
      for (const o of e.was ?? []) if (!seen.has(o)) { seen.add(o); console.log(o + ': ' + count(o) + ' (old id of ' + e.id + ')') }
    }
    process.exit(0)
  }
  if (ef && cmd !== 'list') for (const e of JSON.parse(fs.readFileSync(ef, 'utf8'))) {
    ents.push({ id: toks(e.id + ' ' + (e.was ?? []).join(' ')), title: toks(e.id + ' ' + (e.was ?? []).join(' ') + ' ' + e.title + ' ' + (e.tags ?? []).join(' ')), use: toks((e.use ?? '') + ' ' + (e.looks ?? '') + ' ' + (e.group ?? '')), ex: [], exl: [], eff: true,
      line: () => e.id + (e.was?.length ? ' (was ' + e.was.join(', ') + ')' : '') + ': ' + e.title + '. Use: ' + e.use + ' Words: ' + (e.tags ?? []).join(', ') })
  }
  const cf = cmd === 'search' ? [d + '/docs/recipes/candidates.md', d + '/recipes/candidates.md'].find((p) => fs.existsSync(p)) : undefined
  if (cf) for (const l of fs.readFileSync(cf, 'utf8').split(/\r?\n/)) {
    const c = l.split(/(?<!\\)\|/).slice(1, -1).map((x) => x.trim().replace(/\\\|/g, '|'))
    if (c.length < 4 || !/^K\d+$/.test(c[0])) continue
    const sh = c[1].length > 110 ? c[1].slice(0, 107).replace(/\s+\S*$/, '') + '...' : c[1]
    ents.push({ id: [], title: toks(c[1] + ' ' + c[3]), use: [], ex: [], exl: [], eff: false, cand: true, line: () => 'candidate ' + c[0] + ', wanted by ' + c[2] + ': ' + sh })
  }
  if (cmd === 'list') { for (const e of ents) if (e.listLine) console.log(e.listLine); process.exit(0) }
  // K524: the mechanics map (docs/recipes/mechanics.md): a hit is a line one of whose comma-separated phrases holds every query word
  const mf = cmd === 'search' ? [d + '/docs/recipes/mechanics.md', d + '/recipes/mechanics.md'].find((p) => fs.existsSync(p)) : undefined
  const mechanicPage = mf ? fs.readFileSync(mf, 'utf8') : ''
  const queryMap = JSON.parse(/^<!-- search queries: (.*) -->$/m.exec(mechanicPage)?.[1] ?? '{}')
  const mech = []
  const queryWords = (value) => toks(value).filter((w) => !stop.has(w))
  for (const l of mechanicPage.split(/\r?\n/)) {
    if (!l.trimStart().startsWith('|')) continue
    const c = l.split(/(?<!\\)\|/).slice(1, -1).map((x) => x.trim().replace(/\\\|/g, '|'))
    if (c.length !== 2 || c[0] === 'Mechanic' || /^-+$/.test(c[0])) continue
    const exactQueries = Object.hasOwn(queryMap, c[0]) ? queryMap[c[0]].map((q) => queryWords(q).join(' ')) : []
    mech.push({ words: c[0], ans: c[1], alts: c[0].split(',').map(queryWords), exactQueries })
  }
  const query = words.join(' ')
  const mhit = words.length ? mech.map((m, i) => ({ m, i, s: m.exactQueries.includes(query) ? 3 : Math.max(0, ...m.alts.map((t) => words.every((w) => hasTok(t, w)) ? (t.length === words.length ? 2 : 1) : 0)) })).filter((x) => x.s).sort((x, y) => y.s - x.s || x.i - y.i) : []
  for (const { m } of mhit.slice(0, 3)) console.log('mechanic: ' + m.words + ' -> ' + m.ans)
  const w3 = (e, w) => hasTok(e.title, w) ? 3 : hasTok(e.use, w) ? 2 : e.ex.some((x) => hasTok(x, w)) ? 1 : 0
  const pool = cmd === 'effects' ? ents.filter((e) => e.eff) : ents.filter((e) => !e.cand || cf)
  if (cmd === 'effects' && !words.length) { for (const e of pool) console.log(e.line([])); process.exit(0) }
  const scored = pool.map((e, i) => { const hh = (e.hk ?? []).filter((h) => words.length && words.every((w) => hasTok(h.t, w))); return { e, i, hh, all: hh.length > 0 || words.every((w) => w3(e, w)), s: words.reduce((t, w) => t + w3(e, w) + (e.id.includes(w) ? 1 : 0), 0), hs: words.reduce((t, w) => t + (hh.length ? Math.max(3, w3(e, w)) : w3(e, w)) + (e.id.includes(w) ? 1 : 0), 0) } })
  // K685: a matching hook counts each query word as a title word; at equal score the part whose own words match comes first
  const hits = scored.filter((x) => x.all).sort((x, y) => y.hs - x.hs || y.s - x.s || !!x.e.cand - !!y.e.cand || y.e.eff - x.e.eff || x.i - y.i)
  for (const { e, hh } of hits) { console.log(e.line(e.exl.filter((x) => words.some((w) => !hasTok(e.title, w) && !hasTok(e.use, w) && hasTok(toks(x).concat(toks(x.toLowerCase())), w))))); for (const { h } of hh) console.log('  hook: ' + h) }
  if (hits.length && hits.every((x) => x.e.cand)) console.log('not built yet')
  if (!hits.length && !mhit.length) {
    for (const { e } of scored.filter((x) => !x.e.cand).sort((x, y) => y.s - x.s || y.e.eff - x.e.eff || x.i - y.i).slice(0, 3)) console.log(e.line([]))
    if (mech.length) {
      const lev = (p, q) => { let r = [...Array(q.length + 1).keys()]; for (let i = 1; i <= p.length; i++) { const n = [i]; for (let j = 1; j <= q.length; j++) n[j] = Math.min(r[j] + 1, n[j - 1] + 1, r[j - 1] + (p[i - 1] === q[j - 1] ? 0 : 1)); r = n } return r[q.length] }
      const near = mech.map((m, i) => { const t = m.alts.flat(); return { m, i, s: words.filter((w) => hasTok(t, w)).length, d: Math.min(99, ...words.flatMap((w) => t.map((x) => lev(w, x)).filter((n) => n <= 2 && n * 2 < w.length))) } }).filter((x) => words.length < 2 || x.s > 1 || !(x.m.ans.startsWith('not in the kit') || /candidate K\d+/.test(x.m.ans))).sort((x, y) => y.s - x.s || x.d - y.d || x.i - y.i)[0]
      // K673: for a query of two or more words, a "not in the kit" line or one naming a candidate is offered as nearest only when two query words match it, never on one common word
      if (near && (near.s || near.d < 99)) console.log('nearest mechanic: ' + near.m.words + ' -> ' + near.m.ans)
    }
    console.log('not in the kit by that name')
  }
  if (!hits.length && mhit.every((x) => x.m.ans.startsWith('not in the kit'))) {
    // K685: a search inside the game-kit repository itself (components/ beside kit.mjs) is the kit's own, not a planner's miss
    if (cmd === 'search' && !fs.existsSync(d + '/components') && !process.env.KIT_NO_MISS_LOG) try { fs.mkdirSync(dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, new Date().toISOString().slice(0, 10) + ' ' + a.join(' ') + '\n') } catch { /* read-only */ }
  }
} else if (cmd === 'spec') {
  const d = dirname(fileURLToPath(import.meta.url))
  if (!fs.existsSync(d + '/components/scaffold/spec.mjs')) { console.error('spec runs from the game-kit checkout'); process.exit(2) }
  const { specMain } = await import(pathToFileURL(d + '/components/scaffold/spec.mjs').href)
  try { process.exitCode = specMain(d, a) } catch (e) { console.error(e.message); process.exitCode = 1 }
} else if (cmd === 'new') {
  // node <kit>/kit.mjs new <dir> <id> "<Name>" [--ref r] [--repo owner/name] [--runner label] [--link <node_modules>] [--no-install] [--no-remote] [--ports file] [--existing]
  const flags = {}
  const pos = []
  for (let i = 0; i < a.length; i++) if (a[i] === '--no-install') flags.install = false; else if (a[i] === '--no-remote') flags.remote = false; else if (a[i] === '--existing') flags.existing = true; else if (a[i].startsWith('--')) flags[a[i].slice(2)] = a[++i]; else pos.push(a[i])
  const [dir, id, name] = pos
  const d = dirname(fileURLToPath(import.meta.url))
  if (!name || !fs.existsSync(d + '/components/scaffold/scaffold.js')) { console.error('usage (from the game-kit checkout): node kit.mjs new <dir> <id> "<Name>" [--ref r] [--repo owner/name] [--runner label] [--link <node_modules>] [--no-install] [--no-remote] [--existing] [--ports file]'); process.exit(2) }
  const { newGame } = await import(pathToFileURL(d + '/components/scaffold/newgame.js').href)
  try { newGame({ dir, id, name, kit: d, ...flags, remote: flags.remote !== false }) } catch (e) { console.error(e.message); process.exit(1) }
} else {
  console.error('usage: kit.mjs pull <game-kit checkout> <ref> [component...] | kit.mjs check | kit.mjs outdated [game-kit checkout] | kit.mjs next-id [n] [--reserve] | kit.mjs state | kit.mjs worktree|finish [--body <PR body file>]|teardown | kit.mjs claims <file> [--repo <game repo>] [--before <old file>] | kit.mjs list | kit.mjs search <word> | kit.mjs effects [word] | kit.mjs new <dir> <id> "<Name>"')
  process.exit(2)
}
