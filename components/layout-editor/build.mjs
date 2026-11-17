// K269: writes index.ts (types stripped) into editor.html between the lib markers. `node build.mjs` after editing index.ts.
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
export const HTML = path.join(dir, 'editor.html')
const A = '// <lib generated from index.ts by build.mjs>', B = '// </lib>'
export const lib = () => stripTypeScriptTypes(fs.readFileSync(path.join(dir, 'index.ts'), 'utf8')).replace(/^export /gm, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter((l) => l).join('\n')
export function inline(html) {
  const i = html.indexOf(A), j = html.indexOf(B)
  return html.slice(0, i + A.length) + '\n' + lib() + '\n' + html.slice(j)
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) fs.writeFileSync(HTML, inline(fs.readFileSync(HTML, 'utf8')))
