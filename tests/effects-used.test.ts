import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

// K506: kit.mjs effects --used counts each effect id and old id in the specs and code of the given folders.
const KIT = path.resolve(import.meta.dirname, '..', 'kit.mjs');
it('K506 effects --used counts ids and old ids in specs and code, and marks old ids', () => {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'k506-'));
  try {
    fs.mkdirSync(path.join(g, 'src/motion'), { recursive: true });
    fs.mkdirSync(path.join(g, 'node_modules/x'), { recursive: true });
    fs.mkdirSync(path.join(g, 'kit/effect-library'), { recursive: true });
    fs.writeFileSync(path.join(g, 'src/motion/specs.json'), JSON.stringify({ a: { steps: [{ do: 'rotating-beam' }, { do: 'radar-sweep' }, { do: 'stamp' }] } }));
    fs.writeFileSync(path.join(g, 'src/motion/own.ts'), "verbs.register('rotating-beam', mine);\nconst s = { do: \"dissolve\" };\ncameraPull(el);\n");
    fs.writeFileSync(path.join(g, 'src/notes.md'), "'stamp'");
    fs.writeFileSync(path.join(g, 'node_modules/x/a.js'), "'stamp'");
    fs.writeFileSync(path.join(g, 'kit/effect-library/b.ts'), "'stamp'");
    const r = spawnSync('node', [KIT, 'effects', '--used', g], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const lines = r.stdout.split(/\r?\n/);
    expect(lines).toContain('rotating-beam 2 (old id of radar-sweep)');
    expect(lines).toContain('radar-sweep 1');
    expect(lines).toContain('stamp 1');
    expect(lines).toContain('dissolve 1 (old id of burn-away)');
    expect(lines).toContain('burn-away 0');
    expect(lines).toContain('cameraPull 1');
    expect(lines.filter((l) => l.startsWith('light-teleport '))).toEqual(['light-teleport 0']);
    expect(spawnSync('node', [KIT, 'effects', '--used'], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('node', [KIT, 'effects', '--used', path.join(g, 'missing')], { encoding: 'utf8' }).status).toBe(2);
  } finally {
    fs.rmSync(g, { recursive: true, force: true });
  }
});
