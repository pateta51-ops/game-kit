// Bug reports: an in-memory GitHub for the unit tests and the dev server's simulation (window.bugReports, dev builds only).
// It answers the requests fileReport makes; `fail` decides, per request, to answer with an error instead.
import { bugRepo } from './config';
import { type GhRequest, type GhResponse, type GhTransport } from './github';

export interface FakeIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
}

export interface FakeGitHub {
  send: GhTransport;
  issues: FakeIssue[];
  files: Map<string, string>;
  requests: GhRequest[];
  branchExists: boolean;
}

/** `fail(request, index)` returns a response to send instead (an error), or null to answer normally. */
export function fakeGitHub(
  fail: (request: GhRequest, index: number) => GhResponse | null = () => null,
  options: { branchExists?: boolean } = {},
): FakeGitHub {
  const fake: FakeGitHub = {
    issues: [],
    files: new Map(),
    requests: [],
    branchExists: options.branchExists ?? true,
    send: (request) => {
      fake.requests.push(request);
      const forced = fail(request, fake.requests.length - 1);
      if (forced !== null) return Promise.resolve(forced);
      return Promise.resolve(answer(fake, request));
    },
  };
  return fake;
}

const ok = (status: number, body: unknown = {}): GhResponse => ({ status, body, link: null });

function answer(fake: FakeGitHub, r: GhRequest): GhResponse {
  const path = r.path.replace(/^\/repos\/[^/]+\/[^/]+/, '');
  const body = (r.body ?? {}) as Record<string, unknown>;
  if (r.method === 'GET' && path.startsWith('/issues?')) return ok(200, fake.issues.map(issueJson));
  if (r.method === 'POST' && path === '/issues') {
    const issue: FakeIssue = {
      number: fake.issues.length + 1,
      title: String(body['title']),
      body: String(body['body']),
      labels: (body['labels'] as string[] | undefined) ?? [],
    };
    fake.issues.push(issue);
    return ok(201, issueJson(issue));
  }
  const patch = /^\/issues\/(\d+)$/.exec(path);
  if (r.method === 'PATCH' && patch !== null) {
    const issue = fake.issues.find((i) => i.number === Number(patch[1]));
    if (issue === undefined) return ok(404, { message: 'Not Found' });
    issue.body = String(body['body']);
    return ok(200, issueJson(issue));
  }
  if (r.method === 'GET' && path === '/git/ref/heads/bug-reports')
    return fake.branchExists
      ? ok(200, { object: { sha: 'b'.repeat(40) } })
      : ok(404, { message: 'Not Found' });
  if (r.method === 'GET' && path === '/git/ref/heads/main')
    return ok(200, { object: { sha: 'a'.repeat(40) } });
  if (r.method === 'POST' && path === '/git/refs') {
    fake.branchExists = true;
    return ok(201, {});
  }
  const contents = /^\/contents\/([^?]+)/.exec(path);
  if (contents !== null) {
    const file = contents[1] ?? '';
    if (r.method === 'GET') {
      const have = fake.files.get(file);
      return have === undefined
        ? ok(404, { message: 'Not Found' })
        : ok(200, { content: have, sha: 'f'.repeat(40) });
    }
    if (r.method === 'PUT') {
      fake.files.set(file, String(body['content']));
      return ok(201, {});
    }
  }
  return ok(404, { message: `Not Found (fake: ${r.method} ${path})` });
}

const issueJson = (i: FakeIssue) => ({
  number: i.number,
  title: i.title,
  body: i.body,
  html_url: `https://github.com/${bugRepo().owner}/${bugRepo().repo}/issues/${String(i.number)}`,
});
