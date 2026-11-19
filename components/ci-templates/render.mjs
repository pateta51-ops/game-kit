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
// More keys of ci / gate (K190, see README): id, if, runsOn, nodeVersion, before/after/replace (by step), python, rust, failureArtifact, e2ePort, flat; ci: dispatch, inputs, branchesIgnore, draftConcurrency; gate: inputs.
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
  Array.isArray(v)
    ? `\n${v.map((x) => `${ind}-${val(x, `${ind}  `)}`).join('\n')}`
    : v && typeof v === 'object'
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
const knownKeys = ['name', 'timeoutMinutes', 'node', 'install', 'steps', 'checkout', 'id', 'if', 'runsOn', 'nodeVersion', 'before', 'after', 'replace', 'python', 'rust', 'failureArtifact', 'e2ePort', 'flat', 'dispatch', 'inputs', 'branchesIgnore', 'draftConcurrency'];
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
      .replace('Draft pull requests do not\n# run it; marking one ready, or pushing to a ready one, does.', (m) => (c.runDrafts ? 'Draft pull requests run it too.' : m))
      .replace(" && (github.event_name != 'pull_request' || !github.event.pull_request.draft)", (m) => (c.runDrafts ? '' : m));
  const o = { 'ci.yml': c.ci, 'full-gate.yml': c.gate }[f];
  for (const k of Object.keys(o ?? {})) if (!knownKeys.includes(k)) die(`${f}: unknown key "${k}" in ${f === 'ci.yml' ? 'ci' : 'gate'} of ci.config.json`);
  const rep = (k, a, b) => {
    if (o?.[k] === undefined) return;
    if (!(typeof a === 'string' ? out.includes(a) : a.test(out))) die(`${f}: "${k}" of ci.config.json has no place in the template, so it would be dropped`);
    out = out.replace(a, b);
  };
  if (o?.steps !== undefined && !Array.isArray(o.steps)) die(`${f}: "steps" of ci.config.json must be a list`);
  rep('name', /^ {4}name: .*\n/m, () => (o.name === false ? '' : `    name:${val(o.name)}\n`));
  rep('timeoutMinutes', /^ {4}timeout-minutes: \d+$/m, () => `    timeout-minutes: ${o.timeoutMinutes}`);
  rep('id', /^ {2}(?:check|gate):\n/m, () => `  ${o.id}:\n`);
  rep('if', /^ {4}if: .*\n/m, () => (o.if === false ? '' : `    if:${val(o.if)}\n`));
  rep('runsOn', /^ {4}runs-on: .*$/m, () => `    runs-on:${val(o.runsOn)}`);
  rep('draftConcurrency', '  group: ci-${{ github.ref }}\n', () => "  group: ci-${{ github.ref }}-${{ github.event.pull_request.draft && 'draft' || 'ready' }}\n");
  rep('branchesIgnore', /^ {2}pull_request:\n(?: {4}types: .*\n)?/m, (m) => `${m}    branches-ignore: [${o.branchesIgnore.join(', ')}]\n`);
  if (f === 'ci.yml' && (o?.dispatch || o?.inputs)) {
    if (!/ {2}pull_request:\n/.test(out)) die('ci.yml: "dispatch" of ci.config.json needs the pull_request trigger of the template');
    out = out.replace(/ {2}pull_request:\n(?: {4}.*\n)*/, (m) => `${m}  workflow_dispatch:${o.inputs ? `\n    inputs:${val(o.inputs, '      ')}` : ''}\n`);
  }
  if (f === 'full-gate.yml') rep('inputs', / {6}sha:\n(?: {8}.*\n)+/, (m) => `${m}${Object.entries(o.inputs).map(([k, v]) => `      ${k}:${val(v, '        ')}\n`).join('')}`);
  if (o?.flat) {
    if (f !== 'full-gate.yml') die('ci.yml: "flat" is for the gate only');
    out = out.replace(/ {4}# The checkout lives.*\n {4}defaults:\n {6}run:\n {8}working-directory: full-gate\n/, '').replace(' '.repeat(10) + 'path: full-gate\n', '').replace('full-gate/.nvmrc', '.nvmrc');
  }
  const anchors = { checkout: /actions\/checkout@/, prepare: /full-gate\.mjs prepare/, node: /actions\/setup-node@/, install: /npm ci/, check: /run: npm run check\n/, browsers: /full-gate\.mjs browsers/, e2e: /full-gate\.mjs e2e/ };
  const S = (x) => (x == null || x === false ? '' : steps([].concat(x)));
  if (['before', 'after', 'replace', 'python', 'rust', 'failureArtifact', 'e2ePort'].some((k) => o?.[k] !== undefined)) {
    const bef = { ...o.before }, aft = { ...o.after }, rpl = { ...o.replace };
    for (const k of [...Object.keys(bef), ...Object.keys(aft), ...Object.keys(rpl)]) if (!anchors[k]) die(`${f}: unknown step "${k}" in before/after/replace of ci.config.json (${Object.keys(anchors).join(', ')})`);
    const p = o.python;
    if (p) {
      const rq = p.requirements;
      bef.node = [{ uses: 'actions/setup-python@v7', with: { 'python-version': p.version, ...(rq ? { cache: 'pip', 'cache-dependency-path': p.cachePath ?? rq } : {}) } }, ...(rq ? [p.venv ? { run: `python -m venv "$RUNNER_TEMP/venv"\n"$RUNNER_TEMP/venv/bin/python" -m pip install -r ${rq}\necho "PYTHON=$RUNNER_TEMP/venv/bin/python" >> "$GITHUB_ENV"\n` } : `pip install -r ${rq}`] : []), ...[].concat(bef.node ?? [])];
    }
    const r = o.rust;
    if (r) aft.check = [...[].concat(aft.check ?? []), { uses: `dtolnay/rust-toolchain@${r.toolchain ?? 'stable'}`, ...(r.components ? { with: { components: r.components } } : {}) }, ...(r.commands ?? []).map((run) => (r.workingDirectory ? { run, 'working-directory': r.workingDirectory } : run))];
    if (o.e2ePort) {
      const free = o.e2ePort === 'free';
      const run = (c.e2eScripts ?? ['test:e2e']).map((x) => `npm run ${x}`).join('\n');
      rpl.e2e = { name: 'End-to-end tests', run: free ? `E2E_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')\nexport E2E_PORT\necho "e2e port: $E2E_PORT"\n${run}\n` : run, ...(free ? {} : { env: { E2E_PORT: String(o.e2ePort) } }) };
    }
    const i = out.indexOf('    steps:\n') + 11;
    const a = o.failureArtifact;
    out =
      out.slice(0, i) +
      out.slice(i).split(/(?=^ {6}- )/m).map((t) => { const k = Object.keys(anchors).find((n) => anchors[n].test(t)); return S(bef[k]) + (k in rpl ? S(rpl[k]) : t) + S(aft[k]); }).join('') +
      S(a && { name: a.stepName ?? `Upload ${a.name} on failure`, if: 'failure()', uses: a.uses ?? 'actions/upload-artifact@v4', with: { name: a.name, path: [].concat(a.path).join('\n'), ...(a.retentionDays ? { 'retention-days': a.retentionDays } : {}) } });
  }
  rep('checkout', / {6}- uses: actions\/checkout@v7\n(?! {8}with:)/, (m) => `${m}        with:${val(o.checkout, '          ')}\n`);
  rep('node', / {10}node-version-file: .*\n/, (m) => `${m}${val(o.node, '          ').slice(1)}\n`);
  rep('nodeVersion', /^ {10}node-version-file: .*\n/m, () => `          node-version:${val(o.nodeVersion)}\n`);
  rep('install', '      - run: npm ci --no-audit --no-fund\n', () => steps([o.install]));
  rep('steps', '      - run: npm run check\n', () => steps(o.steps));
  if (f === 'ci.yml') {
    for (const [id, j] of Object.entries(c.jobs ?? {})) {
      if (!Array.isArray(j?.steps)) die(`ci.config.json: job "${id}" needs "steps" (a list)`);
      const g = out.match(o?.if === false ? /(?: {4}if: .*\n)? {4}runs-on: .*\n/ : / {4}if: .*\n {4}runs-on: .*\n/);
      if (!g) die(`ci.yml: no "if" and "runs-on" lines in the template to give job "${id}"`);
      out += `\n  ${id}:\n    name:${val(j.name ?? id)}\n${g[0]}    timeout-minutes: ${j.timeoutMinutes ?? 15}\n    steps:\n      - uses: actions/checkout@v7\n${steps(j.steps)}`;
    }
  }
  const to = `.github/workflows/${f}`;
  if (!process.argv.includes('--check')) {
    fs.mkdirSync('.github/workflows', { recursive: true });
    fs.writeFileSync(to, out);
    console.log(`wrote ${to}`);
  } else if (!fs.existsSync(to) || fs.readFileSync(to, 'utf8').replaceAll('\r\n', '\n') !== out) {
    bad.push(to);
    if (fs.existsSync(to)) {
      const have = fs.readFileSync(to, 'utf8').replaceAll('\r\n', '\n').split('\n'), want = out.split('\n');
      const key = (l) => l.trim().replace(/^- /, '').match(/^[\w-]+(?=:)/)?.[0];
      for (let i = 0; i < Math.min(have.length, want.length); i++) if (have[i] !== want[i]) console.error(`render: warning: ${to} line ${i + 1}, field ${key(want[i]) ?? key(have[i]) ?? 'line'}: the file has "${have[i].trim()}", ci.config.json renders "${want[i].trim()}" (hand edits are overwritten: change ci.config.json)`);
      if (have.length !== want.length) console.error(`render: warning: ${to} has ${have.length} lines, ci.config.json renders ${want.length}`);
    }
  }
}
if (bad.length) {
  console.error(`render: ${bad.join(', ')} differ from the templates and ci.config.json: run node ${dir}/render.mjs`);
  process.exit(1);
}
