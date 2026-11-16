#!/usr/bin/env node
// Writes the game's workflows from the templates beside this file and ci.config.json in the repository root.
//   node kit/ci-templates/render.mjs           writes .github/workflows/<each workflow>
//   node kit/ci-templates/render.mjs --check   exit 1 when a written workflow differs from its template (put it in the game's check)
// ci.config.json: { "repo": "<owner>/<repo>", "runnerLabel": "<label>", "ownerLogin": "<login, default the repo's owner>",
//                   "workflows": ["ci.yml", "full-gate.yml"], "e2eScripts": ["test:e2e"],
//                   "pathsIgnore": [<paths a push to main does not run CI for>], "runDrafts": <true: CI on draft pull requests too> }
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
const bad = [];
for (const f of c.workflows ?? ['ci.yml', 'full-gate.yml']) {
  const out =
    `# Written by ${dir}/render.mjs from ci.config.json: change those, never this file.\n` +
    fs
      .readFileSync(path.join(here, f), 'utf8')
      .replaceAll('\r\n', '\n')
      .replaceAll('{{REPO_SLUG}}', c.repo)
      .replaceAll('{{RUNNER_LABEL}}', c.runnerLabel)
      .replaceAll('{{OWNER_LOGIN}}', c.ownerLogin ?? c.repo.split('/')[0])
      .replaceAll('.github/scripts/', `${dir}/`)
      .replaceAll('tools/architect/', `${dir}/`)
      .replace('    branches: [main]\n', `    branches: [main]\n${c.pathsIgnore?.length ? `    paths-ignore: [${c.pathsIgnore.map((p) => JSON.stringify(p)).join(', ')}]\n` : ''}`)
      .replace(/( {2}pull_request:\n) {4}types: .*\n/, c.runDrafts ? '$1' : '$&')
      .replace(" && (github.event_name != 'pull_request' || !github.event.pull_request.draft)", (m) => (c.runDrafts ? '' : m));
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
