// docs/decisions/SM-explicit-state-machines.md item 3: the generated map of every state machine.
//
//   npm run machines:doc     writes docs/architecture/STATE_MACHINES.md from the registry (src/lib/machine.ts)
//   npm run machines:check   exit 1 when the file is stale, or when a file under src/ defines a machine that
//                            scripts/lib/machine-modules.ts does not load (so the doc would miss it)
//
// Exit codes: 0 ok, 1 stale or unregistered, 2 bad usage.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  allowedFrom,
  docAnchor,
  edgesOf,
  listLocalState,
  listMachines,
  MACHINES_DOC,
  setMachinesDoc,
  type AnyMachine,
  type LocalState,
} from './machine.ts';

export const ROOT = process.cwd();
export interface MachinesConfig {
  modules: string[];
  doc?: string;
  srcDir?: string;
  localState?: string;
}
const CONFIG = 'machines.config.json';
const USAGE = 'usage: node machines-doc.ts [--config <file>] --write | --check';
const HELPER = relative(ROOT, fileURLToPath(new URL('./machine.ts', import.meta.url))).replace(/\\/g, '/');

export function readConfig(file = CONFIG, root = ROOT): MachinesConfig {
  const cfg = JSON.parse(readFileSync(resolve(root, file), 'utf8')) as MachinesConfig;
  if (cfg.doc !== undefined) setMachinesDoc(cfg.doc);
  return cfg;
}

export async function loadModules(cfg: MachinesConfig, root = ROOT): Promise<void> {
  for (const m of cfg.modules) await import(pathToFileURL(resolve(root, m)).href);
}

/**
 * The 1-based line of the machine's `defineMachine(` call: the nearest line at or above `id: '<id>'` that calls
 * defineMachine. The same line the runtime reads from the stack (src/lib/machine.ts callerLine), so errors and
 * `npm run machines` cite one line. Null when the file or the id is not found.
 */
export function tableLine(m: AnyMachine, root = ROOT): number | null {
  try {
    const lines = readFileSync(resolve(root, m.describe.source), 'utf8').split('\n');
    const at = lines.findIndex((l) => l.includes(`id: '${m.id}'`));
    for (let i = at; i >= 0; i -= 1) if (lines[i]?.includes('defineMachine') === true) return i + 1;
    return null;
  } catch {
    return null;
  }
}

/** `path:line` for the CLI and the errors. */
export const where = (m: AnyMachine, root = ROOT): string => {
  const line = tableLine(m, root);
  return line === null ? m.describe.source : `${m.describe.source}:${String(line)}`;
};

/** The doc cites no line (a comment edit above a table must not make the doc stale): the path and a search hint. */
const docWhere = (m: AnyMachine): string => `\`${m.describe.source}\` (search: \`id: '${m.id}'\`)`;

const terminal = (m: AnyMachine, s: string): boolean => allowedFrom(m, s).length === 0;

/** One machine as plain text (`npm run machines -- <id>`). */
export function machineText(m: AnyMachine, root = ROOT): string {
  const out: string[] = [
    `${m.id}`,
    `  table:    ${where(m, root)}`,
    `  doc:      ${MACHINES_DOC}#${docAnchor(m.id)}`,
    `  purpose:  ${m.describe.purpose}`,
  ];
  if (m.describe.stateLivesIn !== undefined) out.push(`  state in: ${m.describe.stateLivesIn}`);
  if (m.describe.rules !== undefined) out.push(`  rules:    ${m.describe.rules.join(', ')}`);
  out.push(
    `  states:   ${m.stateNames.map((s) => (s === m.initial ? `${s} (initial)` : terminal(m, s) ? `${s} (terminal)` : s)).join(', ')}`,
    `  events:   ${m.eventNames.join(', ')}`,
    '  transitions:',
  );
  for (const s of m.stateNames) {
    const allowed = allowedFrom(m, s);
    if (allowed.length === 0) out.push(`    ${s}: terminal`);
    for (const a of allowed) out.push(`    ${s} --${a.event}--> ${a.to}`);
  }
  for (const n of m.describe.notes ?? []) out.push(`  note: ${n}`);
  return out.join('\n');
}

/** A Mermaid id for a state name (Mermaid ids cannot hold '-' or ':'). */
const mid = (s: string): string => `s_${s.replace(/[^A-Za-z0-9]/g, '_')}`;

function mermaid(m: AnyMachine): string[] {
  const out = ['```mermaid', 'stateDiagram-v2'];
  for (const s of m.stateNames) out.push(`  state "${s}" as ${mid(s)}`);
  out.push(`  [*] --> ${mid(m.initial)}`);
  for (const e of edgesOf(m)) out.push(`  ${mid(e.from)} --> ${mid(e.to)} : ${e.event.replace(/:/g, ' ')}`);
  for (const s of m.stateNames) if (terminal(m, s)) out.push(`  ${mid(s)} --> [*]`);
  out.push('```');
  return out;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');

function section(m: AnyMachine): string[] {
  const out = [`## ${m.id}`, '', m.describe.purpose, ''];
  out.push(`- Table: ${docWhere(m)}; query: \`npm run machines -- ${m.id}\` (prints the line)`);
  if (m.describe.stateLivesIn !== undefined) out.push(`- State lives in: ${m.describe.stateLivesIn}`);
  if (m.describe.rules !== undefined) out.push(`- Rules: ${m.describe.rules.join(', ')}`);
  out.push(`- Initial: \`${m.initial}\``);
  out.push(`- States (${String(m.stateNames.length)}): ${m.stateNames.map((s) => `\`${s}\``).join(', ')}`);
  out.push(`- Events (${String(m.eventNames.length)}): ${m.eventNames.map((e) => `\`${e}\``).join(', ')}`);
  const terminals = m.stateNames.filter((s) => terminal(m, s));
  if (terminals.length > 0) out.push(`- Terminal: ${terminals.map((s) => `\`${s}\``).join(', ')}`);
  out.push(
    '',
    `Transitions (${String(edgesOf(m).length)}):`,
    '',
    '| From | Event | To |',
    '| --- | --- | --- |',
  );
  for (const e of edgesOf(m)) out.push(`| ${cell(e.from)} | ${cell(e.event)} | ${cell(e.to)} |`);
  const notes = m.describe.notes ?? [];
  if (notes.length > 0) out.push('', 'Notes:', '', ...notes.map((n) => `- ${n}`));
  out.push('', ...mermaid(m), '');
  return out;
}

const TEMPLATE = `\`\`\`ts
// Map: the doc named in machines.config.json (npm run machines:doc after editing this table).
import { defineMachine, transition } from '<relative path>/machine';

export type DoorState = 'closed' | 'open' | 'locked';
export type DoorEvent = 'open' | 'close' | 'lock' | 'unlock';

export const DOOR_MACHINE = defineMachine<DoorState, DoorEvent>({
  id: 'ui.door',
  initial: 'closed',
  states: {
    closed: { on: { open: 'open', lock: 'locked' } },
    open: { on: { close: 'closed' } },
    locked: { on: { unlock: 'closed' } },
  },
  describe: {
    purpose: 'What the machine models, in one sentence.',
    source: 'src/door.ts', // this file, from the repository root
    stateLivesIn: 'useDoor.state',
  },
});

// in the code that changes the state:
state = transition(DOOR_MACHINE, state, 'open');
\`\`\``;

/** The whole generated document. */
export function renderDoc(
  machines: readonly AnyMachine[] = listMachines(),
  locals: readonly LocalState[] = listLocalState(),
): string {
  const out = [
    '# State machines',
    '',
    '<!-- GENERATED by scripts/machines-doc.ts from the machine registry (src/lib/machine.ts). Do not edit by hand:',
    '     change the table in its source file, then run `npm run machines:doc`. `npm run check` fails when this file is stale. -->',
    '',
    '## For agents',
    '',
    '- **Rule: never add a boolean flag (or a nullable field) for a state; add a state to the table.**',
    `- Machines live next to the code that uses them, as one \`defineMachine\` table each (helper: \`${HELPER}\`). ` +
      `Every file that defines one is listed in \`${CONFIG}\` (the check fails otherwise).`,
    '- Query one machine as plain text: `npm run machines -- <id>`; list them: `npm run machines`.',
    '- After changing a table: `npm run machines:doc` (writes this file); `npm run machines:check` verifies it.',
    '- `transition(machine, state, event)` returns the target. An illegal event **throws** an `IllegalTransitionError` in ' +
      'dev, test and vitest runs (production logs the same message and keeps the state). The message names the machine, ' +
      'the state, the event, the allowed events, the table file and this doc.',
    '- Machines are driven through `transition` or `transitionTo` (the target must agree with the data). Machines derived ' +
      'from data are checked with `transitionTo` / `expectEdge`. Plain values that are not machines are listed under ' +
      '"Local state, not a machine" (`declareLocalState`).',
    '',
    `To add a machine (copy, rename, then add the file to \`${CONFIG}\` and run \`npm run machines:doc\`):`,
    '',
    TEMPLATE,
    '',
    '## Index',
    '',
    '| Machine | States | Transitions | Table | Purpose |',
    '| --- | --- | --- | --- | --- |',
    ...machines.map(
      (m) =>
        `| [${m.id}](#${docAnchor(m.id)}) | ${String(m.stateNames.length)} | ${String(edgesOf(m).length)} | \`${m.describe.source}\` | ${cell(m.describe.purpose)} |`,
    ),
    '',
    ...(locals.length === 0
      ? []
      : [
          '## Local state, not a machine',
          '',
          'State deliberately left as plain local values (declared with `declareLocalState`). If one grows a second flag that combines with the first, make it a machine.',
          '',
          '| Name | Source | Why not a machine |',
          '| --- | --- | --- |',
          ...locals.map((l) => `| ${l.id} | \`${l.source}\` | ${cell(l.why)} |`),
          '',
        ]),
    ...machines.flatMap((m) => section(m)),
  ];
  return `${out.join('\n').trimEnd()}\n`;
}

/** Files under src/ (outside the helper and the tests) that call defineMachine. */
export function definingFiles(root = ROOT, srcDir = 'src'): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        const rel = relative(root, p).replace(/\\/g, '/');
        if (rel !== HELPER && /defineMachine\s*<|declareLocalState\s*\(/.test(readFileSync(p, 'utf8'))) out.push(rel);
      }
    }
  };
  walk(resolve(root, srcDir));
  return out.sort();
}

/** The findings of machines:check: a stale doc, an unloaded defining file, a source path that does not exist. */
export function checkFindings(root = ROOT, cfg: Pick<MachinesConfig, 'srcDir' | 'localState'> = {}): string[] {
  const findings: string[] = [];
  let current: string;
  try {
    current = readFileSync(resolve(root, MACHINES_DOC), 'utf8');
  } catch {
    current = '';
  }
  if (current.replace(/\r\n/g, '\n') !== renderDoc(listMachines())) {
    findings.push(`${MACHINES_DOC} is stale: run npm run machines:doc and commit the result.`);
  }
  const sources = new Set([...listMachines().map((m) => m.describe.source), ...(cfg.localState === undefined ? [] : [cfg.localState])]);
  for (const l of listLocalState()) {
    if (!existsSync(resolve(root, l.source))) findings.push(`local state ${l.id}: source ${l.source} does not exist.`);
  }
  for (const f of definingFiles(root, cfg.srcDir)) {
    if (!sources.has(f)) {
      findings.push(
        `${f} defines a machine that the registry does not hold: list it in ${CONFIG}.`,
      );
    }
  }
  for (const m of listMachines()) {
    if (tableLine(m, root) === null) {
      findings.push(
        `${m.id}: describe.source ${m.describe.source} does not contain id: '${m.id}' (use the repository path of the table file).`,
      );
    }
  }
  return findings;
}

async function main(argv: readonly string[]): Promise<number> {
  const args = [...argv];
  const at = args.indexOf('--config');
  const file = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const mode = args[0];
  if (args.length !== 1 || (mode !== '--write' && mode !== '--check')) {
    console.error(USAGE);
    return 2;
  }
  const cfg = readConfig(file);
  await loadModules(cfg);
  if (mode === '--write') {
    writeFileSync(resolve(ROOT, MACHINES_DOC), renderDoc());
    console.log(`machines:doc: wrote ${MACHINES_DOC} (${String(listMachines().length)} machines)`);
    return 0;
  }
  const findings = checkFindings(ROOT, cfg);
  for (const f of findings) console.error(`machines:check: ${f}`);
  if (findings.length === 0)
    console.log(`machines:check: ${MACHINES_DOC} is current (${String(listMachines().length)} machines)`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main(process.argv.slice(2)).then((c) => process.exit(c));
}
