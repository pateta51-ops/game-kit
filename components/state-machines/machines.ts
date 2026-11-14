// `npm run machines -- <id>`: one state machine as plain text (states, events, transitions, table file:line, notes).
// `npm run machines`: the list of machines. The full map is docs/architecture/STATE_MACHINES.md.
// Exit codes: 0 ok, 1 unknown id.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getMachine, listMachines, MACHINES_DOC } from './machine';
import { loadModules, machineText, readConfig, where } from './machines-doc';

export function listText(): string {
  const ms = listMachines();
  const width = Math.max(...ms.map((m) => m.id.length));
  return [
    `${String(ms.length)} machines (map: ${MACHINES_DOC}; one machine: npm run machines -- <id>)`,
    ...ms.map((m) => `  ${m.id.padEnd(width)}  ${where(m)}  ${m.describe.purpose}`),
  ].join('\n');
}

async function main(argv: readonly string[]): Promise<number> {
  const args = [...argv];
  const at = args.indexOf('--config');
  const file = at >= 0 ? args.splice(at, 2)[1] : undefined;
  await loadModules(readConfig(file));
  const id = args[0];
  if (id === undefined) {
    console.log(listText());
    return 0;
  }
  const m = getMachine(id);
  if (m === undefined) {
    console.error(`unknown machine "${id}".\n${listText()}`);
    return 1;
  }
  console.log(machineText(m));
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main(process.argv.slice(2)).then((c) => process.exit(c));
}
