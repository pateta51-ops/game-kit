// Type-checks the TypeScript block (and a tsx mount block right after it) under "## Use it in 10 lines" of every component README against the real exports.
// Imports are written as a game sees them ('../kit/<name>/...'); here they are rewritten to components/.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const top = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const out = path.join(top, '.cache', 'readme-examples')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(path.join(out, 'src'), { recursive: true })
let n = 0
const bad = []
for (const d of fs.readdirSync(path.join(top, 'components'))) {
  const f = path.join(top, 'components', d, 'README.md')
  if (!fs.existsSync(f)) continue
  const m = /## Use it in 10 lines\s+```ts\r?\n([\s\S]*?)```(?:\s+```tsx\r?\n([\s\S]*?)```)?/.exec(fs.readFileSync(f, 'utf8'))
  if (!m) {
    // K238: a sh block is not run; every kit/<component>/<file> it names must exist
    const sh = /## Use it in 10 lines\s+```(?:sh|bash)\r?\n([\s\S]*?)```/.exec(fs.readFileSync(f, 'utf8'))
    if (sh) {
      for (const [, c, rest] of sh[1].matchAll(/\bkit\/([\w-]+)\/([\w./-]+\.(?:ts|mjs|py|sh|json))/g)) if (!fs.existsSync(path.join(top, 'components', c, rest))) bad.push(d + ': the sh example names kit/' + c + '/' + rest + ', which does not exist')
      n++
    }
    continue
  }
  fs.writeFileSync(path.join(out, 'src', d + '.ts'), m[1].replaceAll("'../kit/", "'../../../components/"))
  if (m[2]) fs.writeFileSync(path.join(out, 'src', d + '.mount.tsx'), m[2].replaceAll("'../kit/", "'../../../components/"))
  n++
}
fs.writeFileSync(path.join(out, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { noEmit: true, incremental: false, tsBuildInfoFile: null, noUnusedLocals: false }, include: ['src', '../../components/*/css.d.ts'] }))
const tsc = path.join(top, 'node_modules', 'typescript', 'bin', 'tsc')
const r = spawnSync(process.execPath, [tsc, '-p', path.join(out, 'tsconfig.json')], { encoding: 'utf8' })
fs.rmSync(out, { recursive: true, force: true })
if (bad.length) { console.error(['README sh examples name missing files:', ...bad].join(String.fromCharCode(10))); process.exit(1) }
if (r.status !== 0) { console.error('README examples do not compile:\n' + r.stdout + r.stderr); process.exit(1) }
console.log(`readme examples ok: ${n}`)
