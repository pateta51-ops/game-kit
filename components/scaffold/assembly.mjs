import { referenceCards } from './reference-cards.mjs'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('courier '+label+' must be an object')
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error('unknown courier '+label+' field: '+key)
}

function resolveCourier(input) {
  keys(input, ['kind','version','board','depot','pickup','destination','allowances','acceptanceRoute'], 'assembly')
  if (input.version !== 1) throw new Error('courier assembly version must be 1')
  keys(input.board, ['rows','cols','walls'], 'board')
  const { rows, cols, walls = [] } = input.board
  if (![rows,cols].every(n => Number.isSafeInteger(n) && n > 0 && n <= 20)) throw new Error('courier board dimensions must be integers from 1 to 20')
  if (!Array.isArray(walls) || walls.some(w => !Array.isArray(w) || w.length !== 3 || !Number.isInteger(w[0]) || w[0] < 0 || w[0] >= rows || !Number.isInteger(w[1]) || w[1] < 0 || w[1] >= cols || !['n','e','s','w'].includes(w[2]))) throw new Error('courier walls must name a board cell and side')
  const space = id => {
    const match = typeof id === 'string' && /^r(0|[1-9]\d*)c(0|[1-9]\d*)$/.exec(id)
    if (!match || Number(match[1]) >= rows || Number(match[2]) >= cols) throw new Error('courier space is outside the board: '+id)
    return id
  }
  const positions = ['depot','pickup','destination'].map(key => space(input[key]))
  if (new Set(positions).size !== 3) throw new Error('courier depot, pickup and destination must differ')
  const allowances = input.allowances
  if (!Array.isArray(allowances) || !allowances.length || allowances.length > 10 || allowances.some(n => !Number.isSafeInteger(n) || n < 1 || n > 1000) || new Set(allowances).size !== allowances.length) throw new Error('courier allowances must contain 1 to 10 distinct integers from 1 to 1000')
  const route = input.acceptanceRoute
  if (!Array.isArray(route) || !route.length || route.length > allowances[0]) throw new Error('courier acceptanceRoute must fit the first movement allowance')
  route.forEach(space)
  if (!route.includes(input.pickup) || route.at(-1) !== input.destination) throw new Error('courier acceptanceRoute must collect the parcel and end at the destination')
  return { kind:'courier', version:1, board:{ rows, cols, walls }, depot:input.depot, pickup:input.pickup, destination:input.destination, allowances, acceptanceRoute:route }
}

export const ASSEMBLIES = {
  'reference-cards': referenceCards,
  courier: {
    components: ['grid-map', 'plan-checker', 'traceability', 'plain-text', 'theme-check'],
    resolve: resolveCourier,
    overlays: () => [path.join(import.meta.dirname,'courier'), path.join(import.meta.dirname,'courier-ui')],
    write(dir, assembly) {
      const { board, depot, pickup, destination, allowances, acceptanceRoute } = assembly
      const config = { board, depot, pickup, destination, allowances }
      fs.writeFileSync(path.join(dir,'src/engine/courier-config.ts'),
        "import type { CourierConfig } from './courier.ts';\n\nexport const CONFIG = "+JSON.stringify(config,null,2)+" as const satisfies CourierConfig;\nexport const ACCEPTANCE_ROUTE = "+JSON.stringify(acceptanceRoute)+" as const;\n")
      const file = path.join(dir,'package.json')
      const pkg = JSON.parse(fs.readFileSync(file,'utf8'))
      pkg.scripts['validate:assembly'] = 'node scripts/validate-courier.mjs'
      pkg.scripts.plancheck = 'node kit/plan-checker/plancheck.ts --plan docs/PLAN.md --applicability docs/check-applicability.json --cover Rules'
      pkg.scripts.traceability = 'node kit/traceability/check-traceability.ts --config trace.config.json --strict --release'
      pkg.scripts['plain-text'] = 'vitest run tests/presentation.test.tsx'
      pkg.scripts['theme-check'] = 'node kit/theme-check/theme-check.ts --config theme-check.config.json'
      pkg.scripts.test = 'vitest run --exclude tests/presentation.test.tsx'
      const gates = 'npm run plancheck && npm run traceability && npm run plain-text && npm run theme-check'
      pkg.scripts['test:acceptance'] = 'npm run validate:assembly && '+gates+' && npm test && npm run test:e2e'
      pkg.scripts['check:chain'] = 'npm run validate:assembly && '+gates+' && '+pkg.scripts['check:chain']
      fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n')
      const runnerFile = path.join(dir,'scripts/check-runner.config.json')
      const runner = JSON.parse(fs.readFileSync(runnerFile,'utf8'))
      runner.first.unshift('validate:assembly')
      runner.lanes.push(['plancheck', 'traceability'], ['plain-text', 'theme-check'])
      runner.pr.lanes.push(['plancheck', 'traceability'], ['plain-text', 'theme-check'])
      fs.writeFileSync(runnerFile,JSON.stringify(runner,null,2)+'\n')
      try { execFileSync(process.execPath,['scripts/validate-courier.mjs'],{cwd:dir,stdio:['ignore','pipe','pipe']}) }
      catch (error) { throw new Error('courier configuration failed its declared route: '+(error.stderr?.toString() ?? error.message),{cause:error}) }
    },
  },
}
