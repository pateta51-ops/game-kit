import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll,describe,expect,it } from 'vitest';
import { contextPacket } from './context.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'kit-context-'));
const dir=path.join(root,'sample');
fs.mkdirSync(dir);
const write=(name,content)=>fs.writeFileSync(path.join(dir,name),content);
write('component.json',JSON.stringify({name:'sample',needs:['engine-core'],packages:[]}));
write('index.ts',"export { act as play } from './impl.ts'; export type { Move } from './impl.ts';");
write('impl.ts',"export interface Move { n: number }\nexport function act(move: Move): number { return move.n; }\nfunction secret(): string { return 'private implementation'; }");
write('README.md','# Sample\n## Rules for agents\n1. Use play with legal moves.\n2. Other instructions. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. Long instruction for budget testing. \n## More\nThis is not a rule.');
write('impl.test.ts',"import { play } from './index.ts';\nit('plays',()=>{\n  expect(play({n:1})).toBe(1);\n});");
afterAll(()=>fs.rmSync(root,{recursive:true,force:true}));
describe('agent context packets',()=>{
  it('resolves an aliased export with exact declaration location and matching test/rule evidence',()=>{
    const p=contextPacket({root,component:'sample',symbol:'play'});
    expect(p.contracts[0]).toMatchObject({symbol:'play',file:'impl.ts',line:2});
    expect(p.contracts[0].signature).toContain('Move');
    expect(p.rules.map(r=>r.text)).toEqual(['1. Use play with legal moves.']);
    expect(p.testEvidence[0].text).toContain('expect(play');
    expect(JSON.stringify(p)).not.toContain('private implementation');
  });
  it('lists public exports and never private declarations',()=>{
    const p=contextPacket({root,component:'sample'});
    expect(p.exports).toEqual(['Move','play']);
    expect(()=>contextPacket({root,component:'sample',symbol:'secret'})).toThrow('not exported');
  });
  it('enforces the full serialized character budget without cutting signatures',()=>{
    const p=contextPacket({root,component:'sample',maxChars:500});
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(500);
    expect(p.omitted).toBeGreaterThan(0);
    expect(p).toEqual(contextPacket({root,component:'sample',maxChars:500}));
  });
  it('refuses traversal and test entrypoints',()=>{
    expect(()=>contextPacket({root,component:'../sample'})).toThrow('invalid component');
    expect(()=>contextPacket({root,component:'sample',entry:'../outside.ts'})).toThrow('invalid entry');
    expect(()=>contextPacket({root,component:'sample',entry:'impl.test.ts'})).toThrow('test');
  });
  it('CLI exits nonzero on missing symbols and prints a bounded JSON packet on success',()=>{
    const cli=fileURLToPath(new URL('./context.mjs',import.meta.url));
    const run=(symbol)=>spawnSync('node',[cli,'sample',symbol,'--root',root,'--max-chars','1000'],{encoding:'utf8'});
    const ok=run('play');
    expect(ok.status,ok.stderr).toBe(0);
    expect(JSON.parse(ok.stdout).symbol).toBe('play');
    expect(run('secret').status).toBe(1);
  });
});
