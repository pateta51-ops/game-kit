// Plain-Node twin of watch-run.sh (K238, GAPS-3 tooling A12): no bash, curl or python3, so it runs on Windows too.
// Wait for a GitHub Actions run to finish, then print its conclusion, each job and each failed step. Run it as one background command.
// Usage: node tools/architect/watch-run.mjs <run-id>   (WATCH_TIMEOUT seconds, default 3600; WATCH_INTERVAL, default 30; token: GH_TOKEN, GITHUB_TOKEN or `gh auth token`)
// Exit: 0 success, 1 any other conclusion, 2 run not found, 3 timed out, 4 the API answered with an error. A network failure is retried until the timeout.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = process.argv[2];
let S = '{{REPO_SLUG}}';
if (S.startsWith('{{')) {
  S = process.env.REPO_SLUG || '';
  if (!S) {
    try {
      const url = execFileSync('git', ['-C', fileURLToPath(new URL('.', import.meta.url)), 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim();
      S = url.replace(/(\.git)?\/*$/, '').replace(/^.*[:/]([^/]+\/[^/]+)$/, '$1');
    } catch { /* no origin */ }
  }
}
const API = `${process.env.WATCH_API ?? 'https://api.github.com'}/repos/${S}/actions/runs/${R}`;
let TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
if (!TOKEN) {
  try { TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* none */ }
}
const get = async (u) => {
  try {
    const r = await fetch(u, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
    return await r.json();
  } catch { return undefined; }
};
const end = Date.now() + Number(process.env.WATCH_TIMEOUT ?? 3600) * 1000;
let s = '';
for (;;) {
  const d = await get(API);
  if (d?.status) {
    s = `${d.status} ${d.conclusion}`;
    if (d.status === 'completed') break;
  } else if (d) {
    if (d.message === 'Not Found') { console.log(`run ${R}: not found (no token?)`); process.exit(2); }
    console.log(`run ${R}: API error: ${d.message}`); process.exit(4);
  }
  if (Date.now() >= end) { console.log(`run ${R}: timed out, still ${s || 'unknown'}`); process.exit(3); }
  await new Promise((r) => setTimeout(r, Number(process.env.WATCH_INTERVAL ?? 30) * 1000));
}
console.log(`run ${R}: ${s}`);
const j = await get(`${API}/jobs?per_page=100`);
if (!j?.jobs) console.log('jobs: not read', j?.message ?? '');
for (const job of j?.jobs ?? []) {
  console.log(job.name, job.conclusion, job.runner_name, job.started_at, job.completed_at);
  for (const st of job.steps ?? []) if (!['success', 'skipped'].includes(st.conclusion)) console.log('   step', st.number, st.name, st.conclusion);
}
process.exit(s === 'completed success' ? 0 : 1);
