import { mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DOOR_MACHINE } from './fake/door.machine';
import { getMachine, listMachines, MACHINES_DOC } from './machine';
import { checkFindings, definingFiles, loadModules, machineText, renderDoc, tableLine, type MachinesConfig } from './machines-doc';
import { listText } from './machines';
import { expectIllegal } from './test-utils';

const SRC = 'components/state-machines/fake';
const cfg: MachinesConfig = { modules: [`${SRC}/door.machine.ts`], srcDir: SRC };

beforeAll(() => loadModules(cfg));

describe('machines:doc and machines:check (generic)', () => {
  it('modules come from the config; the table line agrees with the runtime', () => {
    expect(listMachines().map((m) => m.id)).toContain('fake.door');
    expect(tableLine(DOOR_MACHINE)).toBe(DOOR_MACHINE.line);
    expect(definingFiles(process.cwd(), SRC)).toEqual([`${SRC}/door.machine.ts`]);
  });

  it('renders a deterministic doc that leads with the agent block', () => {
    const doc = renderDoc();
    expect(doc.indexOf('## For agents')).toBeLessThan(doc.indexOf('## Index'));
    expect(doc).toContain('stateDiagram-v2');
    expect(doc).toContain('machines.config.json');
    expect(renderDoc()).toBe(doc);
    expect(doc).toContain("`components/state-machines/fake/door.machine.ts` (search: `id: 'fake.door'`)");
  });

  it('check reports a stale doc and passes on a current one', () => {
    const root = mkdtempSync(join(tmpdir(), 'machines-'));
    try {
      const file = join(root, `${SRC}/door.machine.ts`);
      mkdirSync(dirname(file), { recursive: true });
      copyFileSync(`${SRC}/door.machine.ts`, file);
      expect(checkFindings(root, cfg).join()).toContain('is stale');
      mkdirSync(join(root, dirname(MACHINES_DOC)), { recursive: true });
      writeFileSync(join(root, MACHINES_DOC), renderDoc());
      expect(checkFindings(root, cfg)).toEqual([]);
      expect(checkFindings(root, { srcDir: SRC, localState: 'nope.ts' })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('machines -- <id> prints plain text; machines lists them', () => {
    const m = getMachine('fake.door');
    if (m === undefined) throw new Error('fake.door is not registered');
    const text = machineText(m);
    expect(text).toMatch(/table: {4}components\/state-machines\/fake\/door\.machine\.ts:\d+/);
    expect(text).toContain('closed --lock--> locked');
    expect(listText()).toContain('fake.door');
  });

  it('expectIllegal checks the error message', async () => {
    const { transition } = await import('./machine');
    expectIllegal(() => transition(DOOR_MACHINE, 'locked', 'open'), DOOR_MACHINE, 'locked', 'open');
  });
});
