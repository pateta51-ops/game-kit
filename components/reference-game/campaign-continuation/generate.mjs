import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scaffold } from '../../scaffold/scaffold.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const kit = path.dirname(path.dirname(path.dirname(directory)));

/** Generate this checkout's bounded continuation reference with its exact kit commit. */
export function generateCampaign({ dir, ports, link = path.join(kit, 'node_modules') }) {
  const ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kit, encoding: 'utf8' }).trim();
  return scaffold({ dir, id: 'campaign-compat', name: 'Campaign Compatibility', kit, ref, ports, link, install: false,
    overlay: [path.join(kit, 'components/scaffold/courier'), path.join(kit, 'components/scaffold/reference-cards'), path.join(kit, 'components/reference-game/template'), path.join(import.meta.dirname, 'template')],
    components: ['prompt-host', 'replay-cli', 'card-language', 'card-zones', 'game-store', 'table-panels', 'opponent', 'paced-view', 'turn-flow', 'automa', 'campaign', 'grid-map', 'content-pack', 'traceability'] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) { console.error('usage: generate.mjs <new-directory> <ports.json>'); process.exitCode = 1; }
  else try { generateCampaign({ dir: process.argv[2], ports: process.argv[3] }); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
