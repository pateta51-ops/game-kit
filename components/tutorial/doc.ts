// The readable script document the owner approves (generated, never edited by hand), and its up-to-date check.
import type { GameTypes } from '../engine-core';
import type { TutorialGame } from './game';
import { playStep, startRun } from './play';
import type { ExpectedEvent, TutorialScript, TutorialStep } from './script';

export interface DocOptions {
  readonly title: string;
  /** Where the document comes from, e.g. which content gave the names. */
  readonly source: string;
  /** Lines under the title (the scenario in words). */
  readonly intro?: readonly string[];
  /** A name for an id (card, option, target), shown as Name (`id`). */
  readonly names?: (id: string) => string | undefined;
  /** The heading each step is shown under (see `stepHeadings`). */
  readonly heading?: (stepIndex: number) => string | undefined;
  /** The items to tick, with their words. */
  readonly items?: Readonly<Record<string, string>>;
}

export function scriptDoc(script: TutorialScript, o: DocOptions): string {
  const id = (x: string): string => {
    const n = o.names?.(x);
    return n === undefined ? `\`${x}\`` : `${n} (\`${x}\`)`;
  };
  const event = (e: ExpectedEvent): string => {
    const rest = Object.entries(e)
      .filter(([k]) => k !== 'type')
      .map(([k, v]) => `${k} ${typeof v === 'string' ? id(v) : JSON.stringify(v)}`);
    return `\`${String(e['type'])}\`${rest.length === 0 ? '' : ` (${rest.join(', ')})`}`;
  };
  const what = (s: TutorialStep): string =>
    s.do.kind === 'next'
      ? 'Next (the step only explains)'
      : s.do.kind === 'auto'
        ? `Next: the game plays ${String(s.do.moves.length)} scripted answer${s.do.moves.length === 1 ? '' : 's'} by itself`
        : `${s.do.prompt === undefined ? '' : `${s.do.prompt}: `}${s.do.choose.length === 0 ? 'nothing chosen' : s.do.choose.map(id).join(', then ')}`;
  const covered = new Set(script.steps.flatMap((s) => s.items ?? []));
  const lines = [`# Tutorial script: ${o.title}`, '', `Generated from the script (${o.source}); do not edit by hand. ${String(script.steps.length)} steps, seed \`${script.seed}\`.`, ''];
  if (o.intro !== undefined) lines.push(...o.intro, '');
  if (script.end !== undefined) lines.push(`The game ends: ${Object.entries(script.end).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}.`, '');
  if (o.items !== undefined) {
    lines.push('## Covered', '');
    for (const [k, words] of Object.entries(o.items)) {
      const at = script.steps.flatMap((s, i) => (s.items?.includes(k) === true ? [String(i + 1)] : []));
      lines.push(`- ${covered.has(k) ? '[x]' : '[ ]'} ${k} ${words}${at.length > 0 ? `: steps ${at.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Steps', '');
  let heading: string | undefined;
  script.steps.forEach((s, i) => {
    const h = o.heading?.(i);
    if (h !== undefined && h !== heading) {
      lines.push(`## ${h}`, '');
      heading = h;
    }
    const mark = s.do.kind === 'auto' ? ' [auto-played]' : s.do.kind === 'next' ? ' [Next]' : '';
    lines.push(`### ${String(i + 1)}. ${s.id}${mark}${s.items === undefined || s.items.length === 0 ? '' : ` (${s.items.join(', ')})`}`, '');
    lines.push(`> ${s.narration.split('\n').join('\n> ')}`, '');
    lines.push(`- **The player:** ${what(s)}`);
    if (s.targets.length > 0) lines.push(`- **Highlight:** ${s.targets.map(id).join(', ')}`);
    if (s.asks !== undefined) lines.push(`- **Dimmed controls say:** The tutorial asks for ${s.asks}.`);
    if ((s.expect ?? []).length > 0) lines.push(`- **Then:** ${(s.expect ?? []).map(event).join(', ')}`);
    lines.push('');
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The heading of each step from playing the script (`heading(state)` before the step); a failed step ends them. */
export function stepHeadings<G extends GameTypes>(game: TutorialGame<G>, script: TutorialScript, heading: (state: G['state']) => string): string[] {
  const out: string[] = [];
  let run = startRun(game, script.seed);
  for (const [i, step] of script.steps.entries()) {
    out.push(heading(run.state));
    const r = playStep(game, run, step, i + 1);
    if (!r.ok) break;
    run = r.run;
  }
  return out;
}

export interface DocIo {
  exists(path: string): boolean;
  read(path: string): string;
  write(path: string, text: string): void;
  out(line: string): void;
  err(line: string): void;
}

/** Write `text` to `path`, or with `check` only compare: 0 written or up to date, 1 out of date. */
export function writeDoc(io: DocIo, path: string, text: string, check: boolean): 0 | 1 {
  if (!check) {
    io.write(path, text);
    io.out(`tutorial:doc: wrote ${path}`);
    return 0;
  }
  if (io.exists(path) && io.read(path) === text) {
    io.out(`tutorial:doc: ${path} is up to date`);
    return 0;
  }
  io.err(`tutorial:doc: ${path} is out of date: run tutorial:doc`);
  return 1;
}
