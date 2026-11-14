// Bug reports: one JSON file holds everything: the explanation, the details (build, browser, screen, route, round, open
// prompt, last log lines), the replay (a save file, so loading it in Saves reproduces the game) and the screenshot.
// It never holds the GitHub token: nothing in this module can read it.
import { z } from 'zod';
import { bugConfig } from './config';
import { MarkupSchema } from './markup/model';


const Size = z.looseObject({ width: z.number(), height: z.number() });

/** The device's measurements (viewport, safe-area insets of the iPhone, standalone or browser). */
export const DeviceSchema = z.looseObject({
  viewport: Size,
  visualViewport: z.looseObject({ width: z.number(), height: z.number(), scale: z.number() }).nullable(),
  screen: Size,
  ratio: z.number(),
  safeArea: z.looseObject({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }),
  standalone: z.boolean(),
  coarsePointer: z.boolean(),
  orientation: z.enum(['portrait', 'landscape']),
});

export type DeviceFacts = z.infer<typeof DeviceSchema>;

const Png = z.strictObject({ mime: z.literal('image/png'), base64: z.string() });

export const ReportSchema = z.looseObject({
  format: z.string().endsWith('bug-report'),
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9]{6,20}$/),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
  explanation: z.string(),
  markup: z.array(MarkupSchema).max(200).optional(),
  originalScreenshot: Png.nullable().optional(),
  details: z.looseObject({
    buildSha: z.string(),
    contentHash: z.string().nullable(),
    browser: z.string(),
    screen: z.looseObject({ width: z.number(), height: z.number(), ratio: z.number() }),
    device: DeviceSchema.optional(),
    theme: z.string().optional(),
    time: z.string(),
    round: z.number().nullable(),
    route: z.string(),
    prompt: z.looseObject({ id: z.string(), kind: z.string(), ruleId: z.string() }).nullable(),
    actions: z.number(),
    log: z.array(z.string()),
  }),
  /** The game's save (Saves > Import loads it), or null when no game was open. */
  replay: z.looseObject({ saveVersion: z.number() }).nullable(),
  /** The screenshot as a PNG, base64 without the data-URL prefix, or null when the browser could not capture it. */
  screenshot: Png.nullable(),
});

export type BugReport = z.infer<typeof ReportSchema>;

/** Reports hold the last 50 log lines. */
export const LOG_LINES = 50;

function randomBytes(n: number): number[] {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes];
}

/** A short random id: lowercase letters and digits. */
export function newReportId(now: Date, random: (n: number) => number[] = randomBytes): string {
  const tail = random(4)
    .map((b) => (b % 36).toString(36))
    .join('');
  return `${now.getTime().toString(36)}${tail}`;
}

export type ParsedReport = { ok: true; report: BugReport } | { ok: false; message: string };

/** A report from untrusted text (an exported file or a stored entry), or why it is not one. */
export function parseReport(text: string): ParsedReport {
  let json: unknown;
  try {
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, message: 'The file is not JSON.' };
  }
  const parsed = ReportSchema.safeParse(json);
  if (parsed.success) return { ok: true, report: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue === undefined ? '' : ` (${issue.path.join('.') || 'the file'}: ${issue.message})`;
  return { ok: false, message: `The file is not a bug report${where}.` };
}

/** The file name an exported report gets. */
export const reportFileName = (report: Pick<BugReport, 'id' | 'createdAt'>): string =>
  `${bugConfig().id}-bug-${report.createdAt.slice(0, 10)}-${report.id}.json`;

/** The first line of the explanation, for lists and the issue title. */
export function reportHeadline(report: Pick<BugReport, 'explanation'>): string {
  const first = report.explanation.trim().split(/\r?\n/)[0] ?? '';
  return first === '' ? '(no explanation)' : first;
}
