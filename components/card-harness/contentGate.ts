export type GateIssue = { code: string; severity: string; path?: string; message?: string };
export type GateInput = {
  packs?: { path: string; validate: () => GateIssue[]; allowWarnings?: boolean }[];
  broken?: { file: string; code: string; severity: string; validate: () => GateIssue[] }[];
  generated?: Record<string, string>;
  readGenerated: (path: string) => string | undefined;
  regenerate?: string;
  features?: { required: readonly string[]; used: Iterable<string> };
  requireAll?: boolean;
};
export function contentGate(i: GateInput, log: (line: string) => void = console.log): { failed: boolean } {
  let failed = false;
  const show = (is: GateIssue[]) => is.map((x) => `    ${x.severity === 'error' ? 'ERROR' : 'warn '} ${x.code} ${x.path ?? ''}: ${x.message ?? ''}`).join('\n');
  for (const [path, text] of Object.entries(i.generated ?? {})) {
    if (i.readGenerated(path) !== text) { log(`FAIL ${path} is stale: run ${i.regenerate ?? 'the generator'}`); failed = true; }
  }
  for (const p of i.packs ?? []) {
    const is = p.validate();
    const e = is.filter((x) => x.severity === 'error').length, w = is.filter((x) => x.severity === 'warning').length;
    const bad = e > 0 || (!p.allowWarnings && w > 0);
    log(`${bad ? 'FAIL' : 'ok  '} ${p.path} (${e} errors, ${w} warnings)`);
    if (is.length) log(show(is));
    if (bad) failed = true;
  }
  for (const b of i.broken ?? []) {
    const is = b.validate();
    const hit = is.some((x) => x.code === b.code && x.severity === b.severity);
    log(`${hit ? 'ok  ' : 'FAIL'} broken/${b.file} reports ${b.code}`);
    if (!hit) { failed = true; log(show(is)); }
  }
  if (i.features) {
    const used = new Set(i.features.used);
    const missing = i.features.required.filter((f) => !used.has(f));
    log(`coverage: ${i.features.required.length - missing.length}/${i.features.required.length} features used`);
    if (missing.length) log(`  unused: ${missing.join(', ')}`);
    if (i.requireAll && missing.length) failed = true;
  }
  return { failed };
}
