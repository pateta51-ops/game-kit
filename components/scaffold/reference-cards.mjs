import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const object = value => value && typeof value === 'object' && !Array.isArray(value)
function keys(value, allowed, label) {
  if (!object(value)) throw new Error('reference-cards '+label+' must be an object')
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error('unknown reference-cards '+label+' field: '+key)
}
const positive = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max
const one = (effect, op, amount) => Array.isArray(effect) && effect.length === 1 && object(effect[0])
  && Object.keys(effect[0]).length === 2 && effect[0].op === op && (amount === undefined ? positive(effect[0].n,5) : effect[0].n === amount)
const text = {rally:'Until end of turn, your hits deal 2 more.',ward:'If you would take damage, instead discard this.',mend:'When you take damage, you may heal 1.'}

export function resolveCards(input) {
  keys(input,['kind','version','cards','printed','setup'],'assembly')
  if (input.version !== 1) throw new Error('reference-cards assembly version must be 1')
  if (!Array.isArray(input.cards) || input.cards.length < 5 || input.cards.length > 20) throw new Error('reference-cards assembly needs 5 to 20 card definitions')
  const ids = new Set()
  for (const card of input.cards) {
    keys(card,['id','line','name','copies','effect','stay','when','text'],'card')
    if (typeof card.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(card.id) || ids.has(card.id) || card.line !== card.id+'.1') throw new Error('reference-cards assembly needs unique card IDs with matching .1 clause IDs')
    ids.add(card.id)
    if (typeof card.name !== 'string' || !card.name.trim() || !positive(card.copies,20)) throw new Error('reference-cards assembly needs names and 1 to 20 physical copies per definition')
    let supported
    if (card.id === 'rally') supported = one(card.effect,'boost',2) && card.stay === undefined && card.when === undefined
    else if (card.id === 'ward') supported = Array.isArray(card.effect) && !card.effect.length && card.stay === true && card.when === undefined
    else if (card.id === 'mend') {
      const trigger = card.when?.[0]
      supported = Array.isArray(card.effect) && !card.effect.length && card.stay === true && Array.isArray(card.when) && card.when.length === 1
        && object(trigger) && Object.keys(trigger).length === 4 && trigger.on === 'damage' && trigger.if === 'mine' && trigger.optional === true && one(trigger.then,'heal',1)
    } else supported = one(card.effect,'hit') && card.stay === undefined && card.when === undefined
    if (!supported) throw new Error('reference-cards assembly has an unsupported card shape: '+card.id)
  }
  for (const id of ['jab','blow','rally','ward','mend']) if (!ids.has(id)) throw new Error('reference-cards assembly requires '+id)
  const count = input.cards.reduce((sum,card)=>sum+card.copies,0)
  if (count < 10 || count > 100) throw new Error('reference-cards assembly needs 10 to 100 physical cards')
  if (!Array.isArray(input.printed) || input.printed.length !== ids.size) throw new Error('reference-cards assembly needs independent printed expectations for every record')
  const clauses = new Set(), rules = new Set()
  for (const clause of input.printed) {
    keys(clause,['id','card','text','rule','damage','family','conditional'],'printed clause')
    if (!ids.has(clause.card) || clause.id !== clause.card+'.1' || clauses.has(clause.id) || typeof clause.rule !== 'string' || !/^[A-Z]+-\d{2}$/.test(clause.rule) || rules.has(clause.rule)) throw new Error('reference-cards assembly needs unique printed clauses and rule IDs')
    clauses.add(clause.id); rules.add(clause.rule)
    const family = Object.hasOwn(text,clause.card) ? clause.card : undefined
    if (family) {
      if (clause.family !== family || clause.text !== text[family] || clause.damage !== undefined || clause.conditional !== (family === 'rally' ? undefined : true)) throw new Error('reference-cards assembly printed special clause is unsupported: '+clause.card)
    } else if (!positive(clause.damage,5) || clause.text !== `Deal ${clause.damage} damage.` || clause.family !== undefined || clause.conditional !== undefined) throw new Error('reference-cards assembly needs an independent single-hit printed expectation: '+clause.card)
  }
  keys(input.setup,['life','rounds','level'],'setup')
  if (!Array.isArray(input.setup.life) || input.setup.life.length !== 2 || input.setup.life.some(n=>!Number.isSafeInteger(n)||n<10||n>30)
      || !positive(input.setup.rounds,12) || !['easy','normal','hard'].includes(input.setup.level)) throw new Error('reference-cards assembly needs two life totals from 10 to 30, 1 to 12 rounds and a supported level')
  return structuredClone(input)
}

export const referenceCards = {
  opponents:['automa'], profiles:[],
  components:['prompt-host','replay-cli','card-language','card-zones','table-panels','opponent','paced-view','turn-flow','automa','campaign','content-pack','card-harness','traceability','plan-checker','plain-text','theme-check'],
  resolve:resolveCards,
  overlays:()=>[path.join(import.meta.dirname,'reference-cards'),path.join(import.meta.dirname,'reference-cards-ui')],
  write(dir,assembly) {
    const json = value=>JSON.stringify(value,null,2)
    fs.writeFileSync(path.join(dir,'src/engine/card-config.ts'),
      "import type { CardRecord, Level } from './rules.ts';\n\nexport const CARD_RECORDS: readonly CardRecord[] = "+json(assembly.cards)+";\n\nexport const PRINTED_CLAUSES = "+json(assembly.printed)+" as const;\n\nexport const CARD_SETUP: { readonly life: readonly [number, number]; readonly rounds: number; readonly level: Level; readonly fixedSeats: boolean } = "+json({...assembly.setup,fixedSeats:true})+";\n")
    const ruleText = assembly.printed.map(clause=>`- **${clause.rule}** ${clause.text}`).join('\n')
    fs.writeFileSync(path.join(dir,'docs/CARD_RULES.md'),'# Bounded card composition\n\nOne human (seat 0) faces the automa (seat 1). Setup is declared in game-spec.json. Draw is optional, one card is played each turn, and the acting seat strikes for 1 at its turn end. Cards have the independently supplied rules below. Life at zero ends the game; after the last round, higher life wins.\n\n'+ruleText+'\n\n- **PLAY-01** Only a card in the acting hand may be played; illegal and stale answers preserve state and emit no events.\n\nRally expires after the acting turn. Ward is active only in its controller\'s play area and discards that physical copy once. Mend is active only in its controller\'s play area and offers exactly one heal of 1 after each damage occurrence. Declining heals zero. Hidden deck and opponent-hand identities are not policy inputs.\n')
    const planFile = path.join(dir,'docs/PLAN.md')
    const plan = fs.readFileSync(planFile,'utf8').replace('CARD_RULE_INVENTORY',ruleText).replaceAll('CARD_RULE_IDS',assembly.printed.map(clause=>clause.rule).join(', ')).replaceAll('CLAUSE_COUNT',String(assembly.printed.length))
    fs.writeFileSync(planFile,plan)
    fs.mkdirSync(path.join(dir,'docs/cards'),{recursive:true})
    fs.writeFileSync(path.join(dir,'docs/cards/catalogue.json'),json({summary:{clauses:assembly.printed.length},patterns:[{id:'P-01'}]})+'\n')
    fs.writeFileSync(path.join(dir,'docs/acceptance.json'),json({version:1,composition:'reference-cards',rules:assembly.printed.map(clause=>({id:clause.rule,clause:clause.id,text:clause.text})),commands:['validate:assembly','cards:check','plancheck','test','lint','typecheck','kit:check','ci:check','repo-gate','build','size','cards:screen','theme-check','test:e2e'],componentObservations:[{id:'store-simulation',component:'game-store',script:'test',behavior:'A configured reference card game reaches the same terminal state and answer trace through the live store and simulation.',consumerKind:'reference'}],endpoint:'Human draw/play/undo and automated response, followed by a terminal game in the real browser.',limitations:['Original synthetic card subset only.','Source receipts do not certify rules or unbound environment inputs.']})+'\n')
    const file=path.join(dir,'package.json'),pkg=JSON.parse(fs.readFileSync(file,'utf8'))
    Object.assign(pkg.scripts,{
      'validate:assembly':'node scripts/validate-cards.mjs',
      'cards:check':'node tests/acceptance.ts',
      'cards:whole-game':'node scripts/check-hidden.mjs',
      traceability:'node tests/acceptance.ts',
      plancheck:'node kit/plan-checker/plancheck.ts --plan docs/PLAN.md --applicability docs/check-applicability.json --cover Rules',
      'cards:screen':'vitest run tests/presentation.test.tsx',
      'theme-check':'node kit/theme-check/theme-check.ts --config theme-check.config.json',
      test:'vitest run --exclude tests/presentation.test.tsx',
      'test:acceptance':'node kit/check-runner/check-runner.ts --config scripts/acceptance-runner.config.json',
      'test:bootstrap':'node kit/check-runner/check-runner.ts --config scripts/bootstrap-runner.config.json',
      'acceptance:verify':'node kit/check-runner/receipt.ts --verify evidence/acceptance.json',
    })
    const extra=['validate:assembly','cards:check','plancheck','cards:screen','theme-check']
    pkg.scripts['check:chain']=extra.map(name=>'npm run '+name).join(' && ')+' && '+pkg.scripts['check:chain']
    pkg.scripts['acceptance:chain']=pkg.scripts['check:chain']+' && npm run test:e2e'
    fs.writeFileSync(file,json(pkg)+'\n')
    const runnerFile=path.join(dir,'scripts/check-runner.config.json'),runner=JSON.parse(fs.readFileSync(runnerFile,'utf8'))
    runner.first.unshift('validate:assembly','cards:check')
    runner.lanes.push(['plancheck'],['cards:screen','theme-check'])
    runner.pr.lanes.push(['plancheck'],['cards:screen','theme-check'])
    fs.writeFileSync(runnerFile,json(runner)+'\n')
    fs.writeFileSync(path.join(dir,'scripts/bootstrap-runner.config.json'),json({...runner,receipt:{output:'evidence/bootstrap.json',spec:'docs/game-spec.json',acceptance:'docs/acceptance.json'}})+'\n')
    fs.writeFileSync(path.join(dir,'scripts/acceptance-runner.config.json'),json({...runner,checkScript:'acceptance:chain',last:['test:e2e'],receipt:{output:'evidence/acceptance.json',spec:'docs/game-spec.json',acceptance:'docs/acceptance.json'}})+'\n')
    fs.appendFileSync(path.join(dir,'.gitignore'),'\nevidence/\n')
    const lintFile=path.join(dir,'eslint.config.js')
    fs.writeFileSync(lintFile,fs.readFileSync(lintFile,'utf8').replace('globalIgnores([',"globalIgnores(['evidence/**', "))
    try { execFileSync(process.execPath,['scripts/validate-cards.mjs'],{cwd:dir,stdio:['ignore','pipe','pipe']}) }
    catch(error){throw new Error('reference-cards assembly validation failed: '+(error.stderr?.toString()??error.message),{cause:error})}
  },
}
