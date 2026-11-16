// Bug reports: filing on GitHub (made robust for "Send all"). The issue number names the files.
// The token belongs only to browserTransport; it is never put in a message, a report or a log.
//
// Errors are FilingErrors with a sentence for the screen and a kind:
// - fatal for this attempt (the report stays queued and a later Send finds the same issue by its report id):
//   'token' (none, or 401), 'offline', 'network', 'rate' (rate limit), 'server' (5xx), and any failure to open or update
//   the issue itself ('permission', 'api');
// - an attachment that GitHub refuses ('permission' or 'api', e.g. no Contents permission, or too large) does not stop
//   the filing: the issue is filed without it, says so, and the caller downloads the full report as a file.
import { bugRepo, GITHUB_API, MAX_ATTACHMENT_BASE64 } from './config.ts';
import { bugFiles, issueBody, issueTitle, reportIdLine, type Attached } from './issue.ts';
import { type BugReport } from './report.ts';

export interface GhRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  /** Starts with `/repos/<owner>/<repo>`, the repository of config.ts. */
  path: string;
  body?: unknown;
}
export interface GhResponse {
  status: number;
  body: unknown;
  link?: string | null;
  /** x-ratelimit-remaining, x-ratelimit-reset (epoch seconds) and retry-after, when GitHub sent them. */
  rate?: { remaining: string | null; reset: string | null; retryAfter: string | null };
}
export type GhTransport = (request: GhRequest) => Promise<GhResponse>;

export type FilingErrorKind = 'token' | 'offline' | 'network' | 'rate' | 'permission' | 'server' | 'api';

/** Why filing failed, in a sentence for the screen (never holds the token). */
export class FilingError extends Error {
  readonly kind: FilingErrorKind;
  readonly status?: number;
  constructor(
    message: string,
    kind: FilingErrorKind,
    status?: number,
  ) {
    super(message);
    this.kind = kind;
    if (status !== undefined) this.status = status;
    this.name = 'FilingError';
  }
}

/** Errors that end this attempt even when they hit an attachment: the next Send retries them. */
const FATAL: ReadonlySet<FilingErrorKind> = new Set(['token', 'offline', 'network', 'rate', 'server']);

const repoPath = (): string => `/repos/${bugRepo().owner}/${bugRepo().repo}`;

/** UTF-8 text as base64 (the contents API takes base64). */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;

/** GitHub's own message (and its validation errors), cut short; never the request. */
export function apiMessage(body: unknown): string {
  const parts: string[] = [];
  const message = field(body, 'message');
  if (typeof message === 'string' && message !== '') parts.push(message);
  const errors = field(body, 'errors');
  if (Array.isArray(errors))
    for (const e of errors) {
      const m = typeof e === 'string' ? e : (field(e, 'message') ?? field(e, 'code'));
      if (typeof m === 'string' && m !== '') parts.push(m);
    }
  const text = parts.join('; ');
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

const clock = (epochSeconds: string | null): string | null => {
  const n = Number(epochSeconds);
  if (epochSeconds === null || !Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toTimeString().slice(0, 5);
};

/** The FilingError for a refused request: what GitHub said, and what to do about it. */
export function explain(step: string, response: GhResponse): FilingError {
  const status = response.status;
  const said = apiMessage(response.body);
  const code = said === '' ? String(status) : `${String(status)}: ${said}`;
  const limited =
    (status === 403 || status === 429) &&
    (response.rate?.remaining === '0' || /rate limit/i.test(said) || response.rate?.retryAfter != null);
  if (status === 401)
    return new FilingError(
      `GitHub refused the token (${code}). Paste a new token in Settings > Bug reports.`,
      'token',
      status,
    );
  if (limited) {
    const at = clock(response.rate?.reset ?? null);
    const wait =
      at !== null
        ? `after ${at}`
        : response.rate?.retryAfter != null
          ? `in ${response.rate.retryAfter} s`
          : 'in a few minutes';
    return new FilingError(`GitHub's rate limit is reached (${code}). Send again ${wait}.`, 'rate', status);
  }
  if (status === 403 || status === 404)
    return new FilingError(
      `GitHub says the token cannot ${step} (${code}). It needs Issues and Contents (read and write) on ${bugRepo().owner}/${bugRepo().repo}.`,
      'permission',
      status,
    );
  if (status >= 500)
    return new FilingError(
      `GitHub had a server error and could not ${step} (${code}). Try again later.`,
      'server',
      status,
    );
  return new FilingError(`GitHub could not ${step} (${code}).`, 'api', status);
}

/** Make sure the `bug-reports` branch exists (made from main the first time). */
async function ensureBranch(send: GhTransport): Promise<void> {
  const have = await send({ method: 'GET', path: `${repoPath()}/git/ref/heads/${bugRepo().branch}` });
  if (have.status === 200) return;
  if (have.status !== 404) throw explain('read the bug-reports branch', have);
  const base = await send({ method: 'GET', path: `${repoPath()}/git/ref/heads/${bugRepo().baseBranch}` });
  const sha = field(field(base.body, 'object'), 'sha');
  if (base.status !== 200 || typeof sha !== 'string') throw explain('read the main branch', base);
  const made = await send({
    method: 'POST',
    path: `${repoPath()}/git/refs`,
    body: { ref: `refs/heads/${bugRepo().branch}`, sha },
  });
  // 422: another report made it in the meantime
  if (made.status !== 201 && made.status !== 422) throw explain('create the bug-reports branch', made);
}

/** Attempts per file: a 409 means the branch moved under us (another report's commit landed first), so read again. */
export const COMMIT_ATTEMPTS = 4;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function commitFile(send: GhTransport, path: string, content: string, message: string): Promise<void> {
  const url = `${repoPath()}/contents/${path}`;
  for (let attempt = 1; ; attempt++) {
    const there = await send({ method: 'GET', path: `${url}?ref=${bugRepo().branch}` });
    if (
      there.status === 200 &&
      typeof field(there.body, 'content') === 'string' &&
      (field(there.body, 'content') as string).replace(/\s/g, '') === content.replace(/\s/g, '')
    )
      return; // a retry: already committed
    if (there.status !== 200 && there.status !== 404) throw explain('look for a report file', there);
    const put = await send({
      method: 'PUT',
      path: url,
      body: {
        message,
        content,
        branch: bugRepo().branch,
        ...(there.status === 200 ? { sha: field(there.body, 'sha') } : {}),
      },
    });
    if (put.status === 200 || put.status === 201) return;
    if (put.status !== 409 || attempt >= COMMIT_ATTEMPTS) throw explain(`commit ${path}`, put);
    await pause(400 * attempt);
  }
}

/** A screenshot ready to commit: JPEG when the browser compressed it, else the PNG as taken. */
export interface Image {
  ext: 'png' | 'jpg';
  base64: string;
}
/** Shrinks a PNG (base64) for the attachment; the browser's is in capture.ts. Tests and Node pass the identity. */
export type Compress = (png: string) => Promise<Image>;
const asPng: Compress = (png) => Promise.resolve({ ext: 'png', base64: png });

export interface Filed {
  issueUrl: string;
  issueNumber: number;
  /** The files GitHub refused (e.g. the screenshot too big), each with the reason; empty when all are attached. */
  problems: string[];
  /** True when the screenshot was not attached (the caller then downloads the whole report). */
  screenshotMissing: boolean;
}

/** The issue an earlier attempt for this report opened (found by the report id in its body), or null. */
async function findIssue(
  send: GhTransport,
  report: BugReport,
): Promise<{ url: string; number: number } | null> {
  let path: string | undefined = `${repoPath()}/issues?state=all&labels=${bugRepo().label}&per_page=100`;
  const marker = reportIdLine(report);
  while (path !== undefined) {
    const list = await send({ method: 'GET', path });
    if (list.status !== 200 || !Array.isArray(list.body)) throw explain('look for an earlier issue', list);
    for (const item of list.body as unknown[]) {
      const body = field(item, 'body');
      const url = field(item, 'html_url');
      const number = field(item, 'number');
      if (
        typeof body === 'string' &&
        body.includes(marker) &&
        typeof url === 'string' &&
        typeof number === 'number'
      )
        return { url, number };
    }
    const next = list.link?.match(/<([^>]+)>;\s*rel="next"/);
    path = next?.[1] === undefined ? undefined : next[1].replace(GITHUB_API, '');
  }
  return null;
}

const kb = (base64: string): string => `${String(Math.round((base64.length * 3) / 4 / 1024))} KB`;

/**
 * File a report. Order: the issue first (found again by the report id if an earlier attempt opened it), because the files
 * are named by its number; then the screenshot (compressed), the replay and the report on the `bug-reports` branch; then
 * the issue's body is rewritten with the links and anything that could not be attached. Throws a FilingError.
 */
export async function fileReport(
  report: BugReport,
  send: GhTransport,
  compress: Compress = asPng,
): Promise<Filed> {
  let issue = await findIssue(send, report);
  if (issue === null) {
    const made = await send({
      method: 'POST',
      path: `${repoPath()}/issues`,
      body: { title: issueTitle(report), body: issueBody(report, null), labels: [bugRepo().label] },
    });
    const url = field(made.body, 'html_url');
    const number = field(made.body, 'number');
    if (made.status !== 201 || typeof url !== 'string' || typeof number !== 'number')
      throw explain('open the issue', made);
    issue = { url, number };
  }
  const n = issue.number;
  const message = `Bug report ${report.id} (issue #${String(n)})`;
  const attached: Attached = { screenshot: null, original: null, replay: null, report: null, problems: [] };
  let screenshotMissing = false;
  /** Runs one attachment step; a refusal that is not fatal becomes a line of the issue. */
  const attempt = async (what: string, step: () => Promise<void>): Promise<boolean> => {
    try {
      await step();
      return true;
    } catch (error) {
      if (!(error instanceof FilingError) || FATAL.has(error.kind)) throw error;
      attached.problems.push(`${what}: ${error.message}`);
      return false;
    }
  };
  const branchReady = await attempt('every file', () => ensureBranch(send));
  if (report.screenshot !== null) {
    screenshotMissing = true;
    if (branchReady) {
      const shot = await compress(report.screenshot.base64);
      const path = bugFiles(n, shot.ext).screenshot;
      if (shot.base64.length > MAX_ATTACHMENT_BASE64)
        attached.problems.push(
          `the screenshot: it is ${kb(shot.base64)} even after compression, too big to attach. The full report was downloaded as a file.`,
        );
      else if (await attempt('the screenshot', () => commitFile(send, path, shot.base64, message))) {
        attached.screenshot = path;
        screenshotMissing = false;
      }
    }
    if (screenshotMissing && !attached.problems.some((p) => p.includes('downloaded')))
      attached.problems.push(
        'the screenshot is in the full report, downloaded as a file on the device that sent it.',
      );
  }
  if (branchReady && report.markup?.length && report.originalScreenshot) {
    const original = await compress(report.originalScreenshot.base64);
    const path = bugFiles(n, original.ext).original;
    if (
      original.base64.length <= MAX_ATTACHMENT_BASE64 &&
      (await attempt('the unmarked screenshot', () => commitFile(send, path, original.base64, message)))
    )
      attached.original = path;
  }
  if (branchReady && report.replay !== null) {
    const path = bugFiles(n).replay;
    if (
      await attempt('the replay', () =>
        commitFile(send, path, textToBase64(JSON.stringify(report.replay, null, 1)), message),
      )
    )
      attached.replay = path;
  }
  if (branchReady) {
    const path = bugFiles(n).report;
    const whole = { ...report, screenshot: null, replay: null, originalScreenshot: null };
    if (
      await attempt('the report file', () =>
        commitFile(send, path, textToBase64(JSON.stringify(whole, null, 1)), message),
      )
    )
      attached.report = path;
  }
  const patched = await send({
    method: 'PATCH',
    path: `${repoPath()}/issues/${String(n)}`,
    body: { body: issueBody(report, attached) },
  });
  if (patched.status !== 200) throw explain('add the files to the issue', patched);
  return { issueUrl: issue.url, issueNumber: n, problems: attached.problems, screenshotMissing };
}

/** How long one request may take before it counts as a network failure. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The browser's transport: `fetch` to api.github.com with the token in the Authorization header. It refuses any path
 * outside this repository, so the token cannot be sent anywhere else; it says "offline" before trying when the browser
 * knows it is offline, and turns a network failure or a timeout into a sentence without the token. `doFetch` and
 * `online` are parameters for the tests.
 */
export function browserTransport(
  token: string,
  doFetch: typeof fetch = fetch,
  online: () => boolean = () => typeof navigator === 'undefined' || navigator.onLine !== false,
): GhTransport {
  return async (request) => {
    // the path as the browser will resolve it (dot-dot and "%2e%2e" are applied), checked against this repository
    let target: URL;
    try {
      target = new URL(`${GITHUB_API}${request.path}`);
    } catch {
      throw new FilingError('Refused: a request outside the bug-report repository.', 'api');
    }
    if (target.origin !== GITHUB_API || (!target.pathname.startsWith(`${repoPath()}/`) && target.pathname !== repoPath()))
      throw new FilingError('Refused: a request outside the bug-report repository.', 'api');
    if (!online())
      throw new FilingError(
        'This device is offline. The report stays in the queue; send it when online.',
        'offline',
      );
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(target.href, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: abort.signal,
      });
    } catch {
      throw new FilingError(
        abort.signal.aborted
          ? `GitHub did not answer within ${String(REQUEST_TIMEOUT_MS / 1000)} s. The report stays in the queue.`
          : 'Could not reach GitHub (network error). The report stays in the queue.',
        'network',
      );
    } finally {
      clearTimeout(timer);
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* an empty or non-JSON body */
    }
    return {
      status: response.status,
      body,
      link: response.headers.get('Link'),
      rate: {
        remaining: response.headers.get('x-ratelimit-remaining'),
        reset: response.headers.get('x-ratelimit-reset'),
        retryAfter: response.headers.get('retry-after'),
      },
    };
  };
}
