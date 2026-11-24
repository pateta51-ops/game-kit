import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const LEGACY_V1_PROFILES = {
  "deck-builder": [
    "card-zones",
    "card-language",
    "card-hand",
    "card-pile",
    "market-row",
    "prompt-host",
    "card-harness",
    "turn-flow"
  ],
  "lcg": [
    "card-zones",
    "card-language",
    "card-hand",
    "card-pile",
    "card-attachments",
    "prompt-host",
    "card-harness",
    "turn-flow"
  ],
  "bag-builder": [
    "token-bag",
    "prompt-host",
    "turn-flow"
  ],
  "dice-placement": [
    "dice-patterns",
    "dice-tray",
    "dice-odds",
    "prompt-host",
    "turn-flow"
  ],
  "tactical-board": [
    "board-model",
    "grid-map",
    "board-viewport",
    "prompt-host",
    "turn-flow"
  ],
  "campaign": [
    "campaign",
    "content-pack",
    "screens"
  ]
}
export const PROFILES = LEGACY_V1_PROFILES

export function resolveSpec(spec, read, base, profiles) {
  const object = v => v && typeof v === 'object' && !Array.isArray(v)
  const keys = (v, allowed, label) => {
    if (!object(v)) throw new Error(label + ' must be an object')
    for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new Error('unknown ' + label + ' field: ' + k)
  }
  const strings = (v, label) => {
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.trim() || x !== x.trim()) || new Set(v).size !== v.length) throw new Error(label + ' must contain unique nonempty strings')
    return v
  }
  const componentName = n => {
    if (typeof n !== 'string' || !/^[a-z][a-z0-9-]*$/.test(n)) throw new Error('invalid component name: ' + n)
    return n
  }
  keys(spec, ['version','id','name','profiles','components','mechanics','buildOwn','opponent'], 'spec')
  if (spec.version !== 1) throw new Error('spec version must be 1')
  componentName(spec.id)
  if (typeof spec.name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} .,:!?&()-]*$/u.test(spec.name)) throw new Error('name must be safe for scaffold templates')
  const selected = new Map()
  const add = (n, why) => {
    componentName(n)
    if (!selected.has(n)) selected.set(n, new Set())
    selected.get(n).add(why)
  }
  base.forEach(n => add(n, 'base'))
  for (const p of strings(spec.profiles ?? [], 'profiles')) {
    if (!Object.hasOwn(profiles, p)) throw new Error('unknown profile: ' + p)
    profiles[p].forEach(n => add(n, 'profile: ' + p))
  }
  for (const n of strings(spec.components ?? [], 'components')) add(n, 'explicit')
  const opponents = { none: [], automa: ['automa'], heuristic: ['opponent'], learned: ['opponent','learned-opponent'] }
  const opponent = spec.opponent ?? 'none'
  if (!Object.hasOwn(opponents, opponent)) throw new Error('unknown opponent: ' + opponent)
  opponents[opponent].forEach(n => add(n, 'opponent: ' + opponent))
  const mechanics = strings(spec.mechanics ?? [], 'mechanics')
  const norm = s => s.trim().toLowerCase()
  if (new Set(mechanics.map(norm)).size !== mechanics.length) throw new Error('duplicate mechanic (case-insensitive)')
  const own = spec.buildOwn ?? {}
  if (!object(own)) throw new Error('buildOwn must be an object')
  for (const [k,v] of Object.entries(own)) {
    if (!mechanics.includes(k) || typeof v !== 'string' || !v.trim()) throw new Error('buildOwn needs a requested mechanic and a reason: ' + k)
  }
  const map = read('docs/mechanics.json').lines
  const decisions = mechanics.map(name => {
    const hits = map.filter(m => m.words.split(',').some(w => norm(w) === norm(name)))
    if (hits.length > 1) throw new Error('ambiguous mechanic: ' + name)
    const m = hits[0]
    if (m?.part) {
      add(m.part, 'mechanic: ' + name)
      for (const n of m.also ?? []) add(n, 'mechanic: ' + name)
    }
    const status = m?.part && !m.missing ? 'mapped' : m?.part ? 'partial' : 'unmapped'
    const reason = Object.hasOwn(own, name) ? own[name] : undefined
    if (status === 'mapped' && reason) throw new Error('buildOwn cannot override a fully mapped mechanic: ' + name)
    return {name,status, ...(m?.part ? {part:m.part, also:m.also ?? [], read:m.read ?? ''}:{}), ...(m?.missing?{missing:m.missing}:{}), ...(m?.row?{candidate:m.row}:{}), ...(reason?{buildOwn:reason}:{})}
  })
  const visited = new Set()
  const active = new Set()
  const packages = new Set()
  const visit = n => {
    if (active.has(n)) throw new Error('component dependency cycle: ' + n)
    if (visited.has(n)) return
    active.add(n)
    const meta = read('components/' + n + '/component.json')
    if (meta.name !== n || !Array.isArray(meta.needs)) throw new Error('invalid component manifest: ' + n)
    for (const dep of meta.needs) { add(dep, 'dependency of ' + n); visit(dep) }
    for (const p of meta.packages ?? []) packages.add(p)
    active.delete(n)
    visited.add(n)
  }
  for (const n of selected.keys()) visit(n)
  const pkg = read('package.json')
  const dependencies = {}, devDependencies = {}
  for (const p of [...packages].sort()) {
    if (Object.hasOwn(pkg.dependencies ?? {},p)) dependencies[p] = pkg.dependencies[p]
    else if (Object.hasOwn(pkg.devDependencies ?? {},p)) devDependencies[p] = pkg.devDependencies[p]
    else throw new Error('no pinned package declaration for ' + p)
  }
  return {version:1,id:spec.id,name:spec.name,opponent,components:[...selected.keys()].sort().map(name=>({name,reasons:[...selected.get(name)].sort()})),mechanics:decisions,unresolved:decisions.filter(m=>m.status!=='mapped'&&!m.buildOwn).map(m=>m.name),dependencies,devDependencies}
}

function withVersion(kit, ref, spec, run) {
  const git = (...a) => execFileSync('git', ['-C', kit, ...a], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
  const commit = git('rev-parse','--verify','--end-of-options',ref+'^{commit}')
  const read = file => {
    try { return JSON.parse(git('show',commit+':'+file)) }
    catch (e) { throw new Error('cannot read '+file+' at '+ref, {cause:e}) }
  }
  const source = fs.mkdtempSync(path.join(os.tmpdir(),'kit-spec-source-'))
  try {
    let base, scaffold, profiles
    try {
      const archive = execFileSync('git',['-C',kit,'archive',commit,'components/scaffold'],{maxBuffer:1<<26,stdio:['ignore','pipe','pipe']})
      execFileSync('tar',['-xf','-','-C',source],{input:archive,stdio:['pipe','pipe','pipe']})
      fs.writeFileSync(path.join(source,'package.json'),'{"type":"module"}\n')
      const folder = path.join(source,'components/scaffold')
      const generator = require(path.join(folder,'scaffold.js'))
      base = generator.BASE
      scaffold = generator.scaffold
      const starter = path.join(folder,'spec.mjs')
      profiles = fs.existsSync(starter) ? require(starter).PROFILES : LEGACY_V1_PROFILES
      if (!Array.isArray(base) || typeof scaffold !== 'function' || !profiles || typeof profiles !== 'object' || !fs.statSync(path.join(folder,'template')).isDirectory()) {
        throw new Error('unsupported scaffold layout')
      }
    } catch (e) { throw new Error('unsupported starter at '+ref+': '+e.message,{cause:e}) }
    return run({...resolveSpec(spec,read,base,profiles),ref,commit},scaffold)
  } finally { fs.rmSync(source,{recursive:true,force:true,maxRetries:3}) }
}

export function resolveAt(kit, ref, spec) {
  return withVersion(kit,ref,spec,resolved=>resolved)
}

function generate(kit, spec, resolved, scaffold, flags) {
  if (!flags.dir) throw new Error('generate needs --dir')
  if (resolved.unresolved.length) throw new Error('unresolved mechanics: '+resolved.unresolved.join(', '))
  const dir = path.resolve(flags.dir)
  const original = fs.lstatSync(dir,{throwIfNoEntry:false})
  if (original && (!original.isDirectory() || fs.readdirSync(dir).length)) throw new Error('generation requires an empty or new directory')
  const ports = path.resolve(flags.ports ?? path.join(kit,'ports.json'))
  const entry = JSON.parse(fs.readFileSync(ports,'utf8')).games?.[resolved.id]
  if (!Number.isSafeInteger(entry?.block) || !Number.isSafeInteger(entry?.serve?.local)) {
    throw new Error(`no complete ports entry for ${resolved.id}; run node tools/game-server/server.mjs add ${resolved.id} "${resolved.name}" <dir> --pending or pass a registered --ports file`)
  }
  const parent = path.dirname(dir)
  fs.mkdirSync(parent,{recursive:true})
  const stageRoot = fs.mkdtempSync(path.join(parent,'.kit-spec-'))
  const staged = path.join(stageRoot,'game')
  try {
    const components = resolved.components.map(c=>c.name)
    scaffold({
      dir:staged, id:resolved.id, name:resolved.name, kit, ref:resolved.ref,
      ports, link:flags.link, install:false, git:false, components,
    })
    const lock = JSON.parse(fs.readFileSync(path.join(staged,'kit/kit.lock.json'),'utf8'))
    if (lock.commit!==resolved.commit || lock.ref!==resolved.ref || !lock.components ||
        Object.keys(lock.components).length!==components.length || components.some(c=>!Object.hasOwn(lock.components,c))) {
      throw new Error('generated kit.lock.json does not match resolved assembly')
    }
    // Older pinned scaffolds ignore only directories, which leaves dependency links stageable.
    const ignoreFile = path.join(staged,'.gitignore')
    const ignore = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile,'utf8') : ''
    if (!ignore.split(/\r?\n/).includes('node_modules')) {
      const separator = ignore && !ignore.endsWith('\n') ? '\n' : ''
      fs.appendFileSync(ignoreFile,separator+'node_modules\n')
    }
    const pkgFile = path.join(staged,'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgFile,'utf8'))
    // Protect the generated command for legacy pins while leaving the installed kit byte-for-byte pinned.
    const repoGate = pkg.scripts?.['repo-gate']
    const pinnedGate = path.join(staged,'kit/repo-gate/repo-gate.ts')
    if (typeof repoGate === 'string' && fs.existsSync(pinnedGate) && !fs.readFileSync(pinnedGate,'utf8').includes('DEPENDENCY_LINK')) {
      const legacyCheck = 'scripts/legacy-repo-gate.mjs'
      fs.mkdirSync(path.join(staged,'scripts'),{recursive:true})
      fs.copyFileSync(new URL('./legacy-repo-gate.mjs',import.meta.url),path.join(staged,legacyCheck),fs.constants.COPYFILE_EXCL)
      pkg.scripts['repo-gate'] = `node ${legacyCheck} && ${repoGate}`
    }
    for (const kind of ['dependencies','devDependencies']) for (const [p,v] of Object.entries(resolved[kind])) {
      if (!Object.hasOwn(pkg.dependencies??{},p)&&!Object.hasOwn(pkg.devDependencies??{},p)) (pkg[kind]??={})[p]=v
    }
    fs.writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n')
    const docs = path.join(staged,'docs')
    fs.mkdirSync(docs,{recursive:true})
    fs.writeFileSync(path.join(docs,'kit-assembly.json'),JSON.stringify(resolved,null,2)+'\n')
    fs.writeFileSync(path.join(docs,'game-spec.json'),JSON.stringify(spec,null,2)+'\n')
    if (flags.install!==false&&!flags.link) {
      execFileSync('npm',['install','--package-lock=true'],{cwd:staged,stdio:'inherit',shell:process.platform==='win32'})
      if (!fs.existsSync(path.join(staged,'package-lock.json'))) throw new Error('npm install did not write package-lock.json')
    }
    const current = fs.lstatSync(dir,{throwIfNoEntry:false})
    if (Boolean(current)!==Boolean(original) || (current && (current.dev!==original.dev || current.ino!==original.ino))) throw new Error('destination changed during generation: '+dir)
    if (original) fs.rmdirSync(dir)
    try { fs.renameSync(staged,dir) }
    catch (e) { if (original && !fs.existsSync(dir)) fs.mkdirSync(dir,{mode:original.mode}); throw e }
  } finally { fs.rmSync(stageRoot,{recursive:true,force:true,maxRetries:3}) }
}

export function specMain(kit, args) {
  const [command, file, ...rest] = args
  if (!['resolve','generate'].includes(command) || !file) throw new Error('usage: kit.mjs spec resolve <spec.json> [--ref tag] | kit.mjs spec generate <spec.json> --dir <dir> [--ref tag] [--ports file] [--no-install] [--link dir]')
  const flags = {}
  for (let i=0;i<rest.length;i++) {
    const f=rest[i]
    if (f==='--no-install' && command==='generate') { flags.install=false; continue }
    if (!(command==='resolve'?['--ref']:['--dir','--ref','--ports','--link']).includes(f) || !rest[i+1] || rest[i+1].startsWith('--')) throw new Error('invalid spec flag: '+f)
    if (Object.hasOwn(flags,f.slice(2))) throw new Error('duplicate flag: '+f)
    flags[f.slice(2)]=rest[++i]
  }
  const spec = JSON.parse(fs.readFileSync(file,'utf8'))
  const ref = flags.ref ?? execFileSync('git',['-C',kit,'describe','--tags','--abbrev=0'],{encoding:'utf8'}).trim()
  return withVersion(kit,ref,spec,(resolved,scaffold)=>{
    if (command==='resolve') { console.log(JSON.stringify(resolved,null,2)); return resolved.unresolved.length?1:0 }
    generate(kit,spec,resolved,scaffold,flags)
    return 0
  })
}
