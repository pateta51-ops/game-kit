// Bug reports: what a game supplies when it mounts the reporter (configureBugReporter), and the fixed limits.
import type { EmbedFont } from './capture.ts';

export interface GameSnapshot {
  contentHash: string | null;
  /** The game's save (Saves > Import loads it): a saves-part save (`version`) as it is, or any object with `saveVersion`, or null when no game is open. */
  replay: ({ saveVersion: number } | { version: number }) | null;
  theme?: string;
  round: number | null;
  prompt: { id: string; kind: string; ruleId: string } | null;
  actions: number;
  /** Plain log lines, oldest first (the reporter keeps the last LOG_LINES). */
  log: string[];
}

export interface BugReporterConfig {
  /** A short name: file names (`<id>-bug-...`), the report format, the token key and the queue database. */
  id: string;
  /** The repository reports are filed in; never the token. */
  repo: { owner: string; repo: string; branch?: string; baseBranch?: string; label?: string };
  buildSha: string;
  snapshot: () => GameSnapshot;
  /** A React hook: the "Bug report button" setting. Default: auto. */
  useButtonMode?: () => 'auto' | 'on' | 'off';
  /** A React hook: true where the screen has its own bug button (the floating one hides). */
  useHideFloatingButton?: () => boolean;
  /** Canvas font family for the numbers of the markup pins. */
  markupFont?: string;
  /** Font files to embed in the screenshot (for fonts registered with the FontFace API). */
  fonts?: () => EmbedFont[];
  /** True on a dev server: installs window.bugReports (simulate, real, queue). */
  dev?: boolean;
}

let current: BugReporterConfig | null = null;

export const configureBugReporter = (c: BugReporterConfig): void => {
  current = c;
};

export function bugConfig(): BugReporterConfig {
  if (current === null) throw new Error('configureBugReporter was not called.');
  return current;
}

/** The repository, with the branch names filled in. */
export const bugRepo = (): { owner: string; repo: string; branch: string; baseBranch: string; label: string } => ({
  branch: 'bug-reports',
  baseBranch: 'main',
  label: 'bug-report',
  ...bugConfig().repo,
});
/** The only host the token is ever sent to. */
export const GITHUB_API = 'https://api.github.com';
/** GitHub refuses an issue body over 65 536 characters; the body is cut well below that. */
export const MAX_ISSUE_BODY = 60_000;
/** A screenshot attachment is compressed until its base64 is at most this long (the contents API limit is about 1 MB). */
export const MAX_ATTACHMENT_BASE64 = 900_000;
