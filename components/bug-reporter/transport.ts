// Bug reports: the transport every Send uses: the browser's fetch with the stored token, or null when there is no token.
// Dev builds only: window.bugReports.simulate() swaps in the in-memory GitHub (fakeGitHub.ts), failing the reports whose
// explanation contains "[fail]" with a GitHub server error, so Send all's summary can be seen without filing anything.
import { compressScreenshot } from './capture.ts';
import { fakeGitHub } from './fakeGitHub.ts';
import { browserTransport, type GhTransport } from './github.ts';
import { type FileDeps } from './fileAll.ts';
import { queueReport } from './queue.ts';
import { readToken } from './token.ts';

let override: GhTransport | null = null;

export function sendDeps(): FileDeps {
  if (override !== null) return { send: override, compress: compressScreenshot };
  const token = readToken();
  return { send: token === null ? null : browserTransport(token), compress: compressScreenshot };
}

/** Dev server only (see the header). */
export function installDevBugHooks(): void {
  (window as unknown as { bugReports: unknown }).bugReports = {
    simulate: (): void => {
      const fake = fakeGitHub((request) =>
        request.method === 'POST' &&
        request.path.endsWith('/issues') &&
        String((request.body as { body?: string } | undefined)?.body ?? '').includes('[fail]')
          ? { status: 502, body: { message: 'Server Error' }, link: null }
          : null,
      );
      override = fake.send;
    },
    real: (): void => {
      override = null;
    },
    queue: queueReport,
  };
}
