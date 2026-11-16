#!/usr/bin/env node
// Writes the game's workflows from the templates beside this file and ci.config.json in the repository root.
//   node kit/ci-templates/render.mjs           writes .github/workflows/<each workflow>
//   node kit/ci-templates/render.mjs --check   exit 1 when a written workflow differs from its template (put it in the game's check)
// ci.config.json: { "repo": "<owner>/<repo>", "runnerLabel": "<label>", "ownerLogin": "<login, default the repo's owner>",
//                   "workflows": ["ci.yml", "full-gate.yml"], "e2eScripts": ["test:e2e"],
//                   "pathsIgnore": [<paths a push to main does not run CI for>], "runDrafts": <true: CI on draft pull requests too>,
//                   "push": <false: no CI on a push to main>, "prTypes": [<pull_request types instead of the template's>],
//                   "ci": { "name", "timeoutMinutes", "checkout": {<with>}, "node": {<more with>}, "install": <step>, "steps": [<steps instead of npm run check>] },
//                   "gate": { the same keys, for full-gate.yml }, "jobs": { "<id>": { "name", "timeoutMinutes", "steps": [...] } } (more jobs in ci.yml) }
// A step is a command (a string) or the step's own keys in order: { "name": .., "run": .., "uses": .., "with": {..}, "env": {..}, "if": .. }.
// The written workflows call full-gate.mjs (and name local-ci.sh) where this file is, so nothing is copied out of kit/.
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const dir = path.relative(process.cwd(), here).replaceAll('\\', '/');
const die = (m) => {
  console.error(`render: ${m}`);
  process.exit(2);
};
if (!fs.existsSync('ci.config.json')) die('ci.config.json is missing in the repository root: { "repo": "<owner>/<repo>", "runnerLabel": "<label>" }');
const c = JSON.parse(fs.readFileSync('ci.config.json', 'utf8'));
if (!/^[^/\s]+\/[^/\s]+$/.test(c.repo ?? '') || !c.runnerLabel) die('ci.config.json needs "repo" (<owner>/<repo>) and "runnerLabel"');
const plain = (s) => /^[^\s\-?:,[\]{}#&*!|>'"%@`][^\n]*$/.test(s) && !/: | #|[:\s]$/.test(s) && !/^(true|false|null|yes|no|on|off|~|[-+.\d][\d._eE+-]*)$/i.test(s);
const val = (v, ind) =>
  v && typeof v === 'object'
    ? `\n${Object.entries(v)
        .map(([k, x]) => `${ind}${k}:${val(x, `${ind}  `)}`)
        .join('\n')}`
    : typeof v !== 'string'
      ? ` ${v}`
      : v.includes('\n')
        ? ` |\n${v
            .replace(/\n+$/, '')
            .split('\n')
            .map((l) => (l ? ind + l : ''))
            .join('\n')}`
        : ` ${plain(v) ? v : JSON.stringify(v)}`;
const steps = (a) =>
  a
    .map(
      (s) =>
        `${Object.entries(typeof s === 'string' ? { run: s } : s)
          .map(([k, v], i) => `      ${i ? '  ' : '- '}${k}:${val(v, '          ')}`)
          .join('\n')}\n`,
    )
    .join('');
const bad = [];
for (const f of c.workflows ?? ['ci.yml', 'full-gate.yml']) {
  const t = fs.readFileSync(path.join(here, f), 'utf8').replaceAll('\r\n', '\n');
  if (f === 'ci.yml' && c.push === false && !/ {2}push:\n {4}/.test(t)) die('ci.yml: "push": false of ci.config.json has no place in the template, so it would be dropped');
  if (f === 'ci.yml' && c.prTypes && !/ {2}pull_request:\n {4}types: /.test(t)) die('ci.yml: "prTypes" of ci.config.json has no place in the template, so it would be dropped');
  let out =
    `# Written by ${dir}/render.mjs from ci.config.json: change those, never this file.\n` +
    t
      .replaceAll('{{REPO_SLUG}}', c.repo)
      .replaceAll('{{RUNNER_LABEL}}', c.runnerLabel)
      .replaceAll('{{OWNER_LOGIN}}', c.ownerLogin ?? c.repo.split('/')[0])
      .replaceAll('.github/scripts/', `${dir}/`)
      .replaceAll('tools/architect/', `${dir}/`)
      .replace('    branches: [main]\n', `    branches: [main]\n${c.pathsIgnore?.length ? `    paths-ignore: [${c.pathsIgnore.map((p) => JSON.stringify(p)).join(', ')}]\n` : ''}`)
      .replace(/ {2}push:\n(?: {4}.*\n)+/, (m) => (c.push === false ? '' : m))
      .replace(/( {2}pull_request:\n) {4}types: .*\n/, c.prTypes ? `$1    types: [${c.prTypes.join(', ')}]\n` : c.runDrafts ? '$1' : '$&')
      .replace(" && (github.event_name != 'pull_request' || !github.event.pull_request.draft)", (m) => (c.runDrafts ? '' : m));
  const o = { 'ci.yml': c.ci, 'full-gate.yml': c.gate }[f];
  const rep = (k, a, b) => {
    if (o?.[k] === undefined) return;
    if (!(typeof a === 'string' ? out.includes(a) : a.test(out))) die(`${f}: "${k}" of ci.config.json has no place in the template, so it would be dropped`);
    out = out.replace(a, b);
  };
  if (o?.steps !== undefined && !Array.isArray(o.steps)) die(`${f}: "steps" of ci.config.json must be a list`);
  rep('name', /^ {4}name: .*$/m, () => `    name:${val(o.name)}`);
  rep('timeoutMinutes', /^ {4}timeout-minutes: \d+$/m, () => `    timeout-minutes: ${o.timeoutMinutes}`);
  rep('checkout', / {6}- uses: actions\/checkout@v7\n(?! {8}with:)/, (m) => `${m}        with:${val(o.checkout, '          ')}\n`);
  rep('node', / {10}node-version-file: .*\n/, (m) => `${m}${val(o.node, '          ').slice(1)}\n`);
  rep('install', '      - run: npm ci --no-audit --no-fund\n', () => steps([o.install]));
  rep('steps', '      - run: npm run check\n', () => steps(o.steps));
  if (f === 'ci.yml') {
    for (const [id, j] of Object.entries(c.jobs ?? {})) {
      if (!Array.isArray(j?.steps)) die(`ci.config.json: job "${id}" needs "steps" (a list)`);
      const g = out.match(/ {4}if: .*\n {4}runs-on: .*\n/);
      if (!g) die(`ci.yml: no "if" and "runs-on" lines in the template to give job "${id}"`);
      out += `\n  ${id}:\n    name:${val(j.name ?? id)}\n${g[0]}    timeout-minutes: ${j.timeoutMinutes ?? 15}\n    steps:\n      - uses: actions/checkout@v7\n${steps(j.steps)}`;
    }
  }
  const to = `.github/workflows/${f}`;
  if (!process.argv.includes('--check')) {
    fs.mkdirSync('.github/workflows', { recursive: true });
    fs.writeFileSync(to, out);
    console.log(`wrote ${to}`);
  } else if (!fs.existsSync(to) || fs.readFileSync(to, 'utf8').replaceAll('\r\n', '\n') !== out) bad.push(to);
}
if (bad.length) {
  console.error(`render: ${bad.join(', ')} differ from the templates and ci.config.json: run node ${dir}/render.mjs`);
  process.exit(1);
}
