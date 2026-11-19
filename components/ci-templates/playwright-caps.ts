// K453: a hard time cap for browser tests, for playwright.config.ts and the full gate (full-gate.mjs e2e).
//   import { gateCaps } from './kit/ci-templates/playwright-caps';
//   export default defineConfig({ ...gateCaps(), reporter: [['list'], ['./kit/ci-templates/playwright-caps.ts']] });
// gateCaps: per-test timeout (E2E_TEST_TIMEOUT_MS, default 90 s: set it near the suite's measured worst case) and an overall
// cap (E2E_GLOBAL_TIMEOUT_MS, default 10 min, or 3x the suite's measured time). The reporter (default export) prints the
// tests that were running when the cap hit or a test timed out, and, when E2E_RUNNING_FILE is set, keeps that file
// listing the running tests so full-gate.mjs can print them if it has to kill the run.
import { writeFileSync } from 'node:fs';

export const gateCaps = (env: Record<string, string | undefined> = process.env): { timeout: number; globalTimeout: number } => ({
  timeout: Number(env.E2E_TEST_TIMEOUT_MS) || 90_000,
  globalTimeout: Number(env.E2E_GLOBAL_TIMEOUT_MS) || 600_000,
});

interface T {
  title: string;
  location?: { file: string; line: number };
}
export default class RunningReporter {
  private running = new Map<T, string>();
  private interrupted: string[] = [];
  private mark(): void {
    if (process.env.E2E_RUNNING_FILE) writeFileSync(process.env.E2E_RUNNING_FILE, [...this.running.values()].join('\n'));
  }
  onTestBegin(t: T): void {
    this.running.set(t, `${t.location ? `${t.location.file}:${String(t.location.line)} ` : ''}${t.title}`);
    this.mark();
  }
  onTestEnd(t: T, r: { status: string }): void {
    if (r.status === 'timedOut') console.error(`e2e: test timed out: ${this.running.get(t) ?? t.title}`);
    if (r.status === 'interrupted') this.interrupted.push(this.running.get(t) ?? t.title);
    this.running.delete(t);
    this.mark();
  }
  onEnd(r: { status: string }): void {
    if (r.status === 'timedout' || r.status === 'interrupted') console.error(`e2e: capped (${r.status}); running: ${[...this.running.values(), ...this.interrupted].join('; ') || 'none'}`);
  }
  printsToStdio(): boolean {
    return false;
  }
}
