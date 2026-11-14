// Bug reports: the issue's title and body (pure, shared by the browser and the tests). The files live in bugs/ on the
// `bug-reports` branch, named by the issue number.
import { bugRepo, MAX_ISSUE_BODY } from './config';
import { reportHeadline, type BugReport } from './report';

/** The folder (on the `bug-reports` branch) that holds the files of every report. */
export const BUGS_DIR = 'bugs';

/** The files of the report filed as issue `n`: `bugs/12.jpg` (or .png), `bugs/12.replay.json`, `bugs/12.report.json`. */
export const bugFiles = (
  n: number,
  ext: 'png' | 'jpg' = 'png',
): { screenshot: string; original: string; replay: string; report: string } => ({
  screenshot: `${BUGS_DIR}/${String(n)}.${ext}`,
  original: `${BUGS_DIR}/${String(n)}.original.${ext}`,
  replay: `${BUGS_DIR}/${String(n)}.replay.json`,
  report: `${BUGS_DIR}/${String(n)}.report.json`,
});

/** The line of the issue body that holds the report id (a retry finds the issue by it, so nothing is filed twice). */
export const reportIdLine = (report: Pick<BugReport, 'id'>): string => `- Report id: \`${report.id}\``;

const blobUrl = (path: string): string =>
  `https://github.com/${bugRepo().owner}/${bugRepo().repo}/blob/${bugRepo().branch}/${path}`;
const rawUrl = (path: string): string =>
  `https://github.com/${bugRepo().owner}/${bugRepo().repo}/raw/${bugRepo().branch}/${path}`;

/** The longest explanation the issue body shows (the report file keeps all of it). */
export const MAX_EXPLANATION = 20_000;

/** "Bug: <first line of the explanation>", at most 80 characters after the prefix. */
export function issueTitle(report: BugReport): string {
  const line = reportHeadline(report);
  return `Bug: ${line.length > 80 ? `${line.slice(0, 77)}...` : line}`;
}

/** What became of the attachments, for the body once they are committed (or could not be). */
export interface Attached {
  screenshot: string | null;
  original: string | null;
  replay: string | null;
  report: string | null;
  /** Why the screenshot (or another file) could not be attached; the report then says to download it. */
  problems: string[];
}

/** The issue body; the links to the files once they are attached, none before. Never longer than MAX_ISSUE_BODY. */
export function issueBody(report: BugReport, attached: Attached | null): string {
  const d = report.details;
  const lines: string[] = [];
  // the explanation is cut so the report id line below always fits (a retry finds the issue by it)
  const said = report.explanation.trim();
  const text =
    said.length > MAX_EXPLANATION
      ? `${said.slice(0, MAX_EXPLANATION)}… (cut; the whole text is in the report file)`
      : said;
  lines.push('## What happened', '', text || '(no explanation)', '');
  if (attached !== null) {
    lines.push('## Files', '');
    if (attached.screenshot !== null)
      lines.push(
        `![Screenshot](${rawUrl(attached.screenshot)})`,
        '',
        `- Screenshot: [${attached.screenshot}](${blobUrl(attached.screenshot)})`,
      );
    if (attached.original !== null)
      lines.push(`- Unmarked screenshot: [${attached.original}](${blobUrl(attached.original)})`);
    if (attached.replay !== null)
      lines.push(`- Replay: [${attached.replay}](${blobUrl(attached.replay)}) (Saves > Import loads it)`);
    if (attached.report !== null)
      lines.push(`- Whole report: [${attached.report}](${blobUrl(attached.report)})`);
    for (const p of attached.problems) lines.push(`- Not attached: ${p}`);
    lines.push('');
  }
  lines.push('## Details', '');
  lines.push(reportIdLine(report));
  lines.push(`- Build: \`${d.buildSha}\``);
  lines.push(`- Content hash: \`${d.contentHash ?? 'no game'}\``);
  lines.push(`- Browser: ${d.browser}`);
  lines.push(`- Screen: ${String(d.screen.width)}x${String(d.screen.height)} at ${String(d.screen.ratio)}x`);
  if (d.theme !== undefined) lines.push(`- Theme: ${d.theme}`);
  lines.push(`- Time: ${d.time}`);
  lines.push(`- Route: ${d.route}`);
  lines.push(
    `- Round: ${d.round === null ? 'no game' : String(d.round)}, actions taken: ${String(d.actions)}`,
  );
  if (d.prompt === null) lines.push('- Open prompt: none');
  else lines.push(`- Open prompt: \`${d.prompt.kind}\` (\`${d.prompt.id}\`, rule ${d.prompt.ruleId})`);
  const head = lines.join('\n');
  const log = d.log.map((l) => l.replaceAll('```', "'''"));
  const tail = (shown: string[]): string =>
    [
      '',
      '',
      `<details><summary>Last ${String(shown.length)} log lines</summary>`,
      '',
      '```text',
      ...shown,
      '```',
      '',
      '</details>',
      '',
    ].join('\n');
  let shown = log;
  while (shown.length > 0 && head.length + tail(shown).length > MAX_ISSUE_BODY) shown = shown.slice(1);
  const body = head + tail(shown);
  return body.length > MAX_ISSUE_BODY ? `${body.slice(0, MAX_ISSUE_BODY - 20)}\n\n(cut to fit)` : body;
}
