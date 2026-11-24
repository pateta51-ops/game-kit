import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BASE, scaffold } from './scaffold.js'
import { newGame } from './newgame.js'

export const PROFILES = {
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

export function resolveAt(kit, ref, spec) {
  const git = (...a) => execFileSync('git', ['-C', kit, ...a], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
  const commit = git('rev-parse','--verify','--end-of-options',ref+'^{commit}')
  const read = file => {
    try { return JSON.parse(git('show',commit+':'+file)) }
    catch (e) { throw new Error('cannot read '+file+' at '+ref, {cause:e}) }
  }
  return {...resolveSpec(spec,read,BASE,PROFILES),ref,commit}
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
  const resolved = resolveAt(kit,ref,spec)
  if (command==='resolve') { console.log(JSON.stringify(resolved,null,2)); return resolved.unresolved.length?1:0 }
  if (!flags.dir) throw new Error('generate needs --dir')
  if (resolved.unresolved.length) throw new Error('unresolved mechanics: '+resolved.unresolved.join(', '))
  if (fs.existsSync(flags.dir) && fs.readdirSync(flags.dir).length) throw new Error('generation requires an empty or new directory')
  const {dir, ...options} = flags
  newGame({...options,dir,id:resolved.id,name:resolved.name,kit,ref:resolved.ref,remote:false,components:resolved.components.map(c=>c.name),scaffold:o=>{
    if (resolveAt(kit,resolved.ref,spec).commit!==resolved.commit) throw new Error('kit ref moved after resolution')
    const result=scaffold({...o,install:false,git:false})
    const lock=JSON.parse(fs.readFileSync(path.join(o.dir,'kit/kit.lock.json'),'utf8'))
    if (lock.commit!==resolved.commit || resolved.components.some(c=>!Object.hasOwn(lock.components,c.name))) throw new Error('generated kit does not match resolved assembly')
    const pkgFile=path.join(o.dir,'package.json')
    const pkg=JSON.parse(fs.readFileSync(pkgFile,'utf8'))
    for (const kind of ['dependencies','devDependencies']) for (const [p,v] of Object.entries(resolved[kind])) {
      if (!Object.hasOwn(pkg.dependencies??{},p)&&!Object.hasOwn(pkg.devDependencies??{},p)) (pkg[kind]??={})[p]=v
    }
    fs.writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n')
    const docs=path.join(o.dir,'docs')
    fs.mkdirSync(docs,{recursive:true})
    fs.writeFileSync(path.join(docs,'kit-assembly.json'),JSON.stringify(resolved,null,2)+'\n')
    fs.writeFileSync(path.join(docs,'game-spec.json'),JSON.stringify(spec,null,2)+'\n')
    if (o.install!==false&&!o.link) execFileSync('npm',['install'],{cwd:o.dir,stdio:'inherit',shell:process.platform==='win32'})
    return result
  }})
  return 0
}
