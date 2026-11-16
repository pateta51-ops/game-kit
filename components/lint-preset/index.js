const PURE = 'Not allowed in the pure engine.';
const GLOBALS = ['window', 'document', 'fetch', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'performance', 'crypto', 'Date', 'Intl', 'console', 'process', 'globalThis', 'self', 'global', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame'];
const MUTATORS = '/^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)$/';
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (xs) => xs.map(esc).join('|');
const norm = (d) => d.replaceAll('\\', '/').replace(/\/$/, '');
const EXT = '{ts,tsx,js,mjs}';

// `x` or `a.b` at `path`
const at = (path, name) => {
  const [a, b] = name.split('.');
  return b ? `[${path}.property.name='${b}'][${path}.object.name='${a}']` : `[${path}.name='${a}']`;
};

// Writes below the top level of the shared state (`s.a.b = 1`); `s.a = 1` is the action's own shallow copy.
export function cowSelectors({ state = ['s', 'ctx.s'], owned = [], inPlace = ['drawRandom', 'shuffleInPlace', 'nextUint32', 'randomInt'], depth = 3, message = 'Write through the copy-on-write barrier (engine-core cow.ts own*), not to the shared state.' } = {}) {
  const paths = (prefix, from = 1) => Array.from({ length: depth }, (_, i) => `${prefix}${'.object'.repeat(i + from)}`).flatMap((p) => state.map((n) => at(p, n)));
  const skip = owned.length ? `[callee.object.property.name!=/^(${alt(owned)})$/]` : '';
  return [
    ...paths('left.object').map((p) => `AssignmentExpression${p}`),
    ...paths('argument.object').map((p) => `UpdateExpression${p}`),
    ...paths('argument.object').map((p) => `UnaryExpression[operator='delete']${p}`),
    ...paths('callee.object').map((p) => `CallExpression[callee.property.name=${MUTATORS}]${skip}${p}`),
    ...paths('object', 0).map((p) => `CallExpression[callee.object.name='Object'][callee.property.name='assign'] > MemberExpression.arguments${p}:first-child`),
    ...(inPlace.length ? state.map((n) => `CallExpression[callee.name=/^(${alt(inPlace)})$/] > MemberExpression.arguments${at('object', n)}`) : []),
  ].map((selector) => ({ selector, message }));
}

export function cardIdSelectors(prefixes, message = 'The engine never names a real card.') {
  const id = `^(${alt(prefixes)}):\\d`;
  return [
    { selector: `Literal[value=/${id}/]`, message },
    { selector: `TemplateElement[value.raw=/${id}/]`, message },
  ];
}

// The prefixes in one list and not the other: a game's test expects [].
export function prefixDrift(lintPrefixes, registryPrefixes) {
  return [...lintPrefixes.filter((p) => !registryPrefixes.includes(p)), ...registryPrefixes.filter((p) => !lintPrefixes.includes(p))];
}

export function engineLint({ engine = 'src/engine', api = 'api', pure = [], callers = ['src/ui'], allowImports = [], forbidImports = ['ui'], cow = {}, cardPrefixes = [], cardFiles = [] } = {}) {
  engine = norm(engine);
  const name = engine.split('/').pop();
  const card = cardPrefixes.length ? cardIdSelectors(cardPrefixes) : [];
  const syntax = [{ selector: 'ImportExpression', message: `${PURE} No dynamic import.` }, ...(cow ? cowSelectors(cow) : []), ...card];
  const inward = `The engine imports only its own files${allowImports.length ? ` and ${allowImports.join(', ')}` : ''}.`;
  return [
    ...(card.length && cardFiles.length ? [{ files: cardFiles, rules: { 'no-restricted-syntax': ['error', ...card] } }] : []),
    {
      files: [engine, ...pure.map(norm)].map((d) => `${d}/**/*.${EXT}`),
      rules: {
        'no-restricted-globals': ['error', ...GLOBALS.map((g) => ({ name: g, message: PURE }))],
        'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: `${PURE} Use the seeded rng.` }],
        'no-restricted-syntax': ['error', ...syntax],
      },
    },
    {
      files: [`${engine}/**/*.${EXT}`],
      rules: {
        'no-restricted-imports': ['error', { patterns: [
          { regex: `^(?!\\.${allowImports.map((m) => `|${esc(m)}$`).join('')})`, message: inward },
          ...(forbidImports.length ? [{ regex: `(^|/)(${alt(forbidImports)})(/|$)`, message: inward }] : []),
        ] }],
      },
    },
    ...(callers.length ? [{
      files: callers.map((d) => `${norm(d)}/**/*.${EXT}`),
      rules: { 'no-restricted-imports': ['error', { patterns: [{ group: [`**/${name}/**`, `!**/${name}/${api}`, `!**/${name}/${api}.ts`], message: `Import the engine only through ${engine}/${api}.ts.` }] }] },
    }] : []),
  ];
}
