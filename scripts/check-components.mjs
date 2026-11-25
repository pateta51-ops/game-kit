import fs from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import ts from 'typescript'

const root = path.join(process.argv[2] ?? '.', 'components')
const bad = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const PARENT = /^(?:\.\.)(?:\/|$)/
const QUOTED_PARENT = /['"`](\.\.(?:\/[^'"`\n]*)?)['"`]/g
const BARE = /^(?:@[\w~.-]+\/)?[a-z0-9][\w~.-]*(?:\/[\w./-]*)?$/i
const TESTISH = /(\.test\.|\.e2e\.|[\\/]fake[\\/]|[\\/]examples?[\\/]|\.d\.ts$)/
// This standalone screenshot script uses Playwright only when an operator runs it.
const DEMO_PACKAGES = new Map([['phone-mode/demo/imp-shots.mjs', 'playwright']])
const pkgOf = (x) => (x.startsWith('@') ? x.split('/').slice(0, 2).join('/') : x.split('/')[0])
const isOutside = (rel) => rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)

function moduleSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isJSDocImportTag(node)) return node.moduleSpecifier
  if (ts.isExternalModuleReference(node)) return node.expression
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) return node.argument.literal
  if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) return node.arguments[0]
}

function isThrowMessage(node) {
  const call = node.parent
  return (ts.isCallExpression(call) || ts.isNewExpression(call)) && call.arguments?.[0] === node &&
    ts.isIdentifier(call.expression) && call.expression.text === 'Error' &&
    ts.isThrowStatement(call.parent)
}

function checkCode(file, dir, name, needs, packages) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const local = path.relative(dir, file).split(path.sep).join('/')
  const position = (offset) => {
    const { line, character } = source.getLineAndCharacterOfPosition(offset)
    return `${name}: ${local}:${line + 1}:${character + 1}`
  }
  function checkPath(value, offset) {
    if (!PARENT.test(value)) return
    const target = path.resolve(path.dirname(file), value)
    if (!isOutside(path.relative(dir, target))) return
    const owner = path.relative(path.resolve(root), target).split(path.sep)[0]
    if (needs.includes(owner)) return
    const fix = dirs.includes(owner) ? `declare ${owner} in component.json needs` : 'keep the path inside a declared component'
    bad.push(`${position(offset)}: references ${value} outside its folder; ${fix}`)
  }

  const checkPackages = Array.isArray(packages) && !TESTISH.test(file)
  function visit(node) {
    const spec = checkPackages ? moduleSpecifier(node) : undefined
    if (spec && ts.isStringLiteralLike(spec) && BARE.test(spec.text) && !isBuiltin(spec.text)) {
      const pkg = pkgOf(spec.text)
      if (!packages.includes(pkg) && DEMO_PACKAGES.get(`${name}/${local}`) !== pkg) {
        bad.push(`${position(spec.getStart(source))}: imports package ${pkg} (${spec.text}); add ${pkg} to component.json packages`)
      }
    }

    // Check parent paths independently of imports, including stored asset paths and URL arguments.
    if (ts.isStringLiteralLike(node) && !isThrowMessage(node)) {
      const start = node.getStart(source)
      checkPath(node.text, start)
      // Embedded quoted paths can still be used by generated source and shell commands.
      for (const match of node.getText(source).slice(1, -1).matchAll(QUOTED_PARENT)) checkPath(match[1], start + 1 + match.index)
    }
    if (ts.isTemplateExpression(node) && !isThrowMessage(node)) checkPath(node.head.text + '${…}', node.getStart(source))

    for (const doc of node.jsDoc ?? []) visit(doc)
    ts.forEachChild(node, visit)
  }
  visit(source)
  for (const ref of source.referencedFiles) checkPath(ref.fileName, ref.pos)
}

const dirs = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []
for (const n of dirs) {
  const dir = path.resolve(root, n)
  let meta
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, 'component.json'), 'utf8'))
  } catch {
    bad.push(`${n}: component.json missing or not valid JSON`)
    continue
  }
  const s = meta.source
  if (typeof meta.name !== 'string' || !meta.name) bad.push(`${n}: name missing`)
  if (!s || typeof s.game !== 'string' || typeof s.commit !== 'string' || !Array.isArray(s.paths)) bad.push(`${n}: source needs game, commit, paths`)
  if (!Array.isArray(meta.needs) || meta.needs.some((x) => typeof x !== 'string')) bad.push(`${n}: needs must be an array of component names`)
  if ('licence' in meta && typeof meta.licence !== 'string') bad.push(`${n}: licence must be a string`)
  const needs = Array.isArray(meta.needs) ? meta.needs : []
  for (const x of needs) if (!dirs.includes(x)) bad.push(`${n}: needs ${x}, which is not a component folder`)
  const pk = meta.packages ?? []
  if (!Array.isArray(pk) || pk.some((x) => typeof x !== 'string' || !/^(@[a-z0-9~._-]+\/)?[a-z0-9~._-]+$/.test(x))) bad.push(`${n}: packages must be bare package names`)
  const rm = path.join(dir, 'README.md')
  if (!fs.existsSync(rm) || !fs.readFileSync(rm, 'utf8').split(/\r?\n/)[0].trim()) bad.push(`${n}: README.md missing or its first line is empty`)
  if (fs.existsSync(rm) && !/^## Rules for agents\s*$/m.test(fs.readFileSync(rm, 'utf8'))) bad.push(`${n}: README.md has no "## Rules for agents" heading`)
  if (!walk(dir).some((f) => /(\.test\.[^\\/]+|[\\/]test_[^\\/]+\.py)$/.test(f))) bad.push(`${n}: no test file (*.test.* or test_*.py)`)
  for (const f of walk(dir).filter((f) => CODE.test(f))) checkCode(f, dir, n, needs, pk)
}
const tools = path.join(path.dirname(root), 'tools')
if (fs.existsSync(tools)) for (const e of fs.readdirSync(tools, { withFileTypes: true })) {
  const rm = path.join(tools, e.name, 'README.md')
  if (e.isDirectory() && fs.existsSync(rm) && !/^## Rules for agents\s*$/m.test(fs.readFileSync(rm, 'utf8'))) bad.push(`tools/${e.name}: README.md has no "## Rules for agents" heading`)
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`components ok: ${dirs.length}`)
