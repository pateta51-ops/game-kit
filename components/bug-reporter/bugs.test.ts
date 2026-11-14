// Bug reports (ported from Rise of a Jarl): every report goes to the queue first; filing opens one GitHub issue per report
// (never two, even when a row's Send and Send all race), keeps a failed report queued with GitHub's own reason, and files a
// report whose screenshot GitHub refuses without it (downloading the whole report instead). Each failure path that made
// filing fail is here: no token, a refused token, offline, a network error or timeout, the rate limit, 4xx and 5xx.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectReport } from './collect';
import { startTestGame } from './test-utils';
import { MAX_ATTACHMENT_BASE64, MAX_ISSUE_BODY } from './config';
import { fakeGitHub } from './fakeGitHub';
import { fileAll, fileQueued, NO_TOKEN, useFiling } from './fileAll';
import { browserTransport, fileReport, FilingError, type GhRequest, type GhResponse } from './github';
import { issueBody, reportIdLine } from './issue';
import { queueReport, unqueueReport, useQueue } from './queue';
import { LOG_LINES, parseReport, reportFileName, type BugReport } from './report';
import { readToken, tokenKey, useToken } from './token';

// built at run time: this file holds nothing shaped like a token (the repository gate would refuse it)
const PLANTED = ['github', 'pat', 'PLANTED0TOKEN0FOR0THE0LEAK0TEST'].join('_');
const SHOT = 'iVBORw0KGgo'.repeat(30);
const jpg = (base64: string) => () => Promise.resolve({ ext: 'jpg' as const, base64 });

const report = (explanation: string, shot: string | null = SHOT): BugReport =>
  collectReport(explanation, shot);

async function clearQueue(): Promise<void> {
  await useQueue.getState().refresh();
  for (const q of useQueue.getState().items) await unqueueReport(q.report.id);
}

beforeEach(async () => {
  window.localStorage.clear();
  useToken.getState().forget();
  useFiling.setState({ ids: new Set() });
  await clearQueue();
  startTestGame();
});

const response = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('bug reports: what a report holds', () => {
  it('holds the explanation, the screenshot, the game as a save, the last log lines, the build and the screen', () => {
    const r = report('The Market did not refill');
    expect(r.explanation).toBe('The Market did not refill');
    expect(r.screenshot?.base64).toBe(SHOT);
    expect(r.replay?.saveVersion).toBe(1);
    expect(r.details.round).toBe(1);
    expect(r.details.contentHash).not.toBeNull();
    expect(r.details.log.length).toBeLessThanOrEqual(LOG_LINES);
    expect(r.details.theme).toBe('light');
    expect(parseReport(JSON.stringify(r)).ok).toBe(true);
    expect(reportFileName(r)).toMatch(/^test-bug-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.json$/);
  });

  it('never holds the token', () => {
    useToken.getState().save(PLANTED);
    expect(readToken()).toBe(PLANTED);
    expect(JSON.stringify(report('x'))).not.toContain(PLANTED);
  });

  it('the issue body stays under GitHub’s limit even with a huge log', () => {
    const r = report('long');
    const big: BugReport = {
      ...r,
      details: { ...r.details, log: Array.from({ length: 50 }, () => 'y'.repeat(3000)) },
    };
    const body = issueBody(big, null);
    expect(body.length).toBeLessThanOrEqual(MAX_ISSUE_BODY);
    expect(body).toContain(reportIdLine(r));
  });

  it('a huge explanation is cut so the report id line still fits (a retry finds the issue)', () => {
    const r = report('z'.repeat(80_000));
    const body = issueBody(r, null);
    expect(body.length).toBeLessThanOrEqual(MAX_ISSUE_BODY);
    expect(body).toContain(reportIdLine(r));
  });

  it('a token with spaces or an empty one is refused', () => {
    expect(useToken.getState().save('  ')).toBe(false);
    expect(useToken.getState().save('a b')).toBe(false);
    expect(useToken.getState().has).toBe(false);
    expect(useToken.getState().save(PLANTED)).toBe(true);
    expect(window.localStorage.getItem(tokenKey())).toBe(PLANTED);
  });
});

describe('bug reports: filing', () => {
  it('opens one issue, commits the compressed screenshot, the replay and the report, then links them', async () => {
    const gh = fakeGitHub();
    const r = report('Filed');
    const filed = await fileReport(r, gh.send, jpg('SMALLJPEG'));
    expect(filed.issueNumber).toBe(1);
    expect(filed.screenshotMissing).toBe(false);
    expect([...gh.files.keys()].sort()).toEqual(['bugs/1.jpg', 'bugs/1.replay.json', 'bugs/1.report.json']);
    expect(gh.files.get('bugs/1.jpg')).toBe('SMALLJPEG');
    expect(gh.issues[0]?.body).toContain('bugs/1.jpg');
    expect(gh.issues[0]?.body).toContain(reportIdLine(r));
    expect(gh.issues[0]?.labels).toEqual(['bug-report']);
  });

  it('creates the bug-reports branch from main the first time', async () => {
    const gh = fakeGitHub(() => null, { branchExists: false });
    await fileReport(report('First'), gh.send, jpg('J'));
    expect(gh.requests.some((q) => q.method === 'POST' && q.path.endsWith('/git/refs'))).toBe(true);
    expect(gh.branchExists).toBe(true);
  });

  it('a retry after a failure half way finds the same issue: never two issues for one report', async () => {
    let broken = true;
    const gh = fakeGitHub((q) =>
      broken && q.method === 'PATCH' ? { status: 502, body: { message: 'Bad Gateway' } } : null,
    );
    const r = report('Retry');
    await expect(fileReport(r, gh.send, jpg('J'))).rejects.toMatchObject({ kind: 'server' });
    broken = false;
    const second = await fileReport(r, gh.send, jpg('J'));
    expect(second.issueNumber).toBe(1);
    expect(gh.issues).toHaveLength(1);
  });

  it('a screenshot too big even after compression: filed without it, the issue says so, the report is downloaded', async () => {
    const gh = fakeGitHub();
    const r = report('Huge 4K screenshot');
    await queueReport(r, null);
    const download = vi.fn(() => true);
    const result = await fileQueued(r, {
      send: gh.send,
      compress: jpg('x'.repeat(MAX_ATTACHMENT_BASE64 + 1)),
      download,
    });
    expect(result.outcome).toBe('sent');
    expect(download).toHaveBeenCalledWith(r);
    expect(result.message).toContain('downloaded');
    expect(gh.issues[0]?.body).toContain('too big to attach');
    expect([...gh.files.keys()].some((f) => f.endsWith('.jpg'))).toBe(false);
    expect(useQueue.getState().items).toHaveLength(0);
  });

  it('GitHub refuses the screenshot (no Contents permission): filed without it; when the download also fails it stays queued', async () => {
    const gh = fakeGitHub((q) =>
      q.method === 'PUT' && q.path.endsWith('.jpg')
        ? { status: 403, body: { message: 'Resource not accessible by personal access token' } }
        : null,
    );
    const r = report('No contents permission');
    await queueReport(r, null);
    const result = await fileQueued(r, { send: gh.send, compress: jpg('J'), download: () => false });
    expect(result.outcome).toBe('sent');
    expect(gh.issues).toHaveLength(1);
    expect(gh.issues[0]?.body).toContain('Resource not accessible by personal access token');
    expect(result.message).toContain('would not download');
    expect(useQueue.getState().items.map((i) => i.report.id)).toEqual([r.id]);
  });
});

describe('bug reports: the errors that make filing fail', () => {
  const fetchOnce = (res: Response | Error) =>
    vi.fn<typeof fetch>(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)));

  it('no token: nothing is sent, the report stays queued with a clear reason', async () => {
    const r = report('No token');
    await queueReport(r, null);
    const result = await fileQueued(r, { send: null });
    expect(result).toMatchObject({ outcome: 'failed', message: NO_TOKEN, kind: 'token' });
    expect(useQueue.getState().items[0]?.error).toBe(NO_TOKEN);
  });

  it('401: the token is refused; the message says to paste a new one and never shows the token', async () => {
    const send = browserTransport(PLANTED, fetchOnce(response(401, { message: 'Bad credentials' })));
    const error = await fileReport(report('401'), send).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FilingError);
    expect((error as FilingError).kind).toBe('token');
    expect((error as FilingError).message).toContain('Bad credentials');
    expect((error as FilingError).message).toContain('Settings > Bug reports');
    expect((error as FilingError).message).not.toContain(PLANTED);
  });

  it('offline: no request is made', async () => {
    const doFetch = vi.fn<typeof fetch>();
    const send = browserTransport(PLANTED, doFetch, () => false);
    await expect(fileReport(report('offline'), send)).rejects.toMatchObject({ kind: 'offline' });
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('a network error says GitHub could not be reached', async () => {
    const send = browserTransport(PLANTED, fetchOnce(new TypeError('Failed to fetch')));
    await expect(fileReport(report('net'), send)).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('Could not reach GitHub') as unknown,
    });
  });

  it('the rate limit: GitHub’s message and when to send again', async () => {
    const reset = String(Math.floor(Date.UTC(2026, 10, 10, 18, 30) / 1000));
    const send = browserTransport(
      PLANTED,
      fetchOnce(
        response(
          403,
          { message: 'API rate limit exceeded for user ID 1.' },
          {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': reset,
          },
        ),
      ),
    );
    const error = (await fileReport(report('rate'), send).catch((e: unknown) => e)) as FilingError;
    expect(error.kind).toBe('rate');
    expect(error.message).toContain('API rate limit exceeded');
    expect(error.message).toMatch(/Send again after \d{2}:\d{2}/);
  });

  it('403 without the rate limit: a permission sentence with GitHub’s message', async () => {
    const send = browserTransport(
      PLANTED,
      fetchOnce(response(403, { message: 'Resource not accessible by integration' })),
    );
    const error = (await fileReport(report('403'), send).catch((e: unknown) => e)) as FilingError;
    expect(error.kind).toBe('permission');
    expect(error.message).toContain('Resource not accessible by integration');
    expect(error.message).toContain('Issues and Contents');
  });

  it('422 and 5xx show GitHub’s own message', async () => {
    const gh422 = fakeGitHub((q) =>
      q.method === 'POST' && q.path.endsWith('/issues')
        ? { status: 422, body: { message: 'Validation Failed', errors: [{ message: 'body is too long' }] } }
        : null,
    );
    await expect(fileReport(report('422'), gh422.send)).rejects.toMatchObject({
      kind: 'api',
      message: expect.stringContaining('Validation Failed; body is too long') as unknown,
    });
    const gh500 = fakeGitHub((q) =>
      q.method === 'GET' ? { status: 503, body: { message: 'Service Unavailable' } } : null,
    );
    await expect(fileReport(report('503'), gh500.send)).rejects.toMatchObject({
      kind: 'server',
      message: expect.stringContaining('503: Service Unavailable') as unknown,
    });
  });

  it('the token goes only to this repository on api.github.com', async () => {
    const doFetch = vi.fn<typeof fetch>(() => Promise.resolve(response(200, [])));
    const send = browserTransport(PLANTED, doFetch);
    await expect(send({ method: 'GET', path: '/repos/someone/else/issues' })).rejects.toBeInstanceOf(
      FilingError,
    );
    await expect(
      send({ method: 'GET', path: '/repos/test-owner/test-repo/../../x' }),
    ).rejects.toBeInstanceOf(FilingError);
    expect(doFetch).not.toHaveBeenCalled();
  });
});

describe('bug reports: Send all', () => {
  const failing =
    (word: string) =>
    (q: GhRequest): GhResponse | null =>
      q.method === 'POST' &&
      q.path.endsWith('/issues') &&
      String((q.body as { body: string }).body).includes(word)
        ? { status: 502, body: { message: 'Server Error' } }
        : null;

  it('files every report one at a time; a failure stays queued with its reason; the summary counts both', async () => {
    const gh = fakeGitHub(failing('[fail]'));
    const reports = [report('First'), report('Second [fail]'), report('Third')];
    for (const r of reports) await queueReport(r, null);
    const progress: number[] = [];
    const summary = await fileAll(useQueue.getState().items, { send: gh.send, compress: jpg('J') }, (d) =>
      progress.push(d),
    );
    expect(summary).toMatchObject({ sent: 2, failed: 1, skipped: 0 });
    expect(progress).toEqual([1, 2, 3]);
    const failed = summary.results.find((r) => r.outcome === 'failed');
    expect(failed?.title).toBe('Second [fail]');
    expect(failed?.message).toContain('502: Server Error');
    expect(useQueue.getState().items.map((i) => i.report.explanation)).toEqual(['Second [fail]']);
    expect(useQueue.getState().items[0]?.error).toContain('502: Server Error');
    expect(gh.issues).toHaveLength(2);
    // in order, never in parallel: each report's issue before the next report's
    expect(gh.issues.map((i) => i.title)).toEqual(['Bug: First', 'Bug: Third']);
  });

  it('never files one report twice when a row’s Send races Send all', async () => {
    const gh = fakeGitHub();
    const reports = [report('A'), report('B'), report('C')];
    for (const r of reports) await queueReport(r, null);
    const deps = { send: gh.send, compress: jpg('J') };
    const [all, row] = await Promise.all([
      fileAll(useQueue.getState().items, deps),
      fileQueued(reports[0] as BugReport, deps),
    ]);
    expect(gh.issues).toHaveLength(3);
    expect(all.sent + (row.outcome === 'sent' ? 1 : 0)).toBe(3);
    expect(new Set(gh.issues.map((i) => i.title)).size).toBe(3);
    expect(useQueue.getState().items).toHaveLength(0);
  });

  it('a refused token stops the run: the rest are not tried and stay queued', async () => {
    const gh = fakeGitHub(() => ({ status: 401, body: { message: 'Bad credentials' } }));
    for (const r of [report('1'), report('2'), report('3')]) await queueReport(r, null);
    const summary = await fileAll(useQueue.getState().items, { send: gh.send });
    expect(summary).toMatchObject({ sent: 0, failed: 3 });
    expect(gh.requests).toHaveLength(1);
    expect(summary.results[1]?.message).toMatch(/^Not tried: GitHub refused the token/);
    expect(useQueue.getState().items).toHaveLength(3);
  });

  it('a report deleted while Send all runs is skipped', async () => {
    const gh = fakeGitHub();
    const a = report('Keep');
    const b = report('Deleted');
    await queueReport(a, null);
    await queueReport(b, null);
    const items = [...useQueue.getState().items];
    await unqueueReport(b.id);
    const summary = await fileAll(items, { send: gh.send, compress: jpg('J') });
    expect(summary).toMatchObject({ sent: 1, failed: 0, skipped: 1 });
  });
});
