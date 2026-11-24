import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterAll,describe,expect,it } from 'vitest';
import { contextPacket } from './context.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'kit-context-'));
const cli=path.join(import.meta.dirname,'context.mjs');
const dir=path.join(root,'sample');
fs.mkdirSync(dir);
const write=(name,content)=>fs.writeFileSync(path.join(dir,name),content);
const fixture=(name, files={})=>{
  const folder=path.join(root,name);
  fs.mkdirSync(folder);
  for(const [file,content] of Object.entries({
    'component.json':JSON.stringify({name}),
    'README.md':'# Sample\n## Rules for agents\nUse legal input.\n',
    'index.ts':'export const move = 1;',
    ...files,
  })) fs.writeFileSync(path.join(folder,file),content);
  return folder;
};
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
    expect(p.rules.map(r=>r.text)).toMatchObject(['1. Use play with legal moves.',expect.stringContaining('2. Other instructions.')]);
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
  it.each(['README.md','component.json'])('rejects a %s link outside its own component',file=>{
    const component=file==='README.md'?'linked-rules':'linked-manifest';
    const folder=fixture(component);
    const sibling=fixture(`${component}-sibling`,{'component.json':JSON.stringify({name:component})});
    fs.unlinkSync(path.join(folder,file));
    fs.symlinkSync(path.join(sibling,file),path.join(folder,file));
    expect(()=>contextPacket({root,component})).toThrow(`${file} escapes component`);
  });
  it('allows canonical paths that stay inside the component',()=>{
    const component='local-links';
    const folder=fixture(component);
    for(const file of ['README.md','component.json','index.ts']) {
      fs.renameSync(path.join(folder,file),path.join(folder,`real-${file}`));
      fs.symlinkSync(path.join(folder,`real-${file}`),path.join(folder,file));
    }
    const packet=contextPacket({root,component,symbol:'move'});
    expect(packet.status).toBe('complete');
    expect(packet.contracts[0]).toMatchObject({symbol:'move',file:'real-index.ts'});
    expect(packet.rules[0].text).toBe('Use legal input.');
  });
  it.each(['README.md','component.json'])('diagnoses missing %s',file=>{
    const component=file==='README.md'?'missing-rules':'missing-manifest';
    const folder=fixture(component);
    fs.unlinkSync(path.join(folder,file));
    expect(()=>contextPacket({root,component})).toThrow(`${file} is missing or unreadable`);
  });
  it('rejects malformed manifest metadata',()=>{
    const component='bad-manifest';
    fixture(component,{'component.json':JSON.stringify({name:component,needs:'no'})});
    expect(()=>contextPacket({root,component})).toThrow('invalid component.json');
  });
  it('does not infer public types from sibling component source',()=>{
    const component='local-contract';
    fixture('other-component',{'index.ts':"export const otherMove = 'sibling-fixture-value' as const;"});
    fixture(component,{'index.ts':"import { otherMove } from '../other-component/index.ts'; export const move = otherMove;"});
    const packet=contextPacket({root,component,symbol:'move'});
    expect(JSON.stringify(packet)).not.toContain('sibling-fixture-value');
    expect(packet).toMatchObject({status:'incomplete',requiredReads:['index.ts']});
  });
  it('reports an oversized requested contract and prints bounded JSON with CLI exit 2',()=>{
    const component='large-contract';
    fixture(component,{'index.ts':`export type Move = '${'x'.repeat(700)}';`});
    const options={root,component,symbol:'Move',maxChars:500};
    const packet=contextPacket(options);
    expect(packet).toMatchObject({status:'incomplete',requiredReads:['index.ts'],contracts:[]});
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(500);
    expect(contextPacket(options)).toEqual(packet);
    const run=spawnSync(process.execPath,[cli,component,'Move','--root',root,'--max-chars','500'],{encoding:'utf8'});
    expect(run.status,run.stderr).toBe(2);
    expect(JSON.parse(run.stdout)).toEqual(packet);
  });
  it('reports incomplete contracts when multiple public symbols compete for the budget',()=>{
    const component='multiple-contracts';
    fixture(component,{'index.ts':`export type A = '${'a'.repeat(175)}';\nexport type B = '${'b'.repeat(175)}';`});
    const packet=contextPacket({root,component,maxChars:560});
    expect(packet).toMatchObject({status:'incomplete',requiredReads:['index.ts']});
    expect(packet.contracts).toHaveLength(1);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(560);
  });
  it('requires the README when a general usage constraint exceeds the budget',()=>{
    const component='large-rules';
    fixture(component,{'README.md':`# Sample\n## Rules for agents\nGeneral constraint: ${'x'.repeat(600)}\n`});
    const packet=contextPacket({root,component,symbol:'move',maxChars:500});
    expect(packet).toMatchObject({status:'incomplete',requiredReads:['README.md']});
    expect(packet.contracts[0]).toMatchObject({symbol:'move'});
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(500);
  });
  it('can omit optional test excerpts from a complete packet',()=>{
    const component='long-evidence';
    fixture(component,{'index.test.ts':`it('checks move',()=>{ /* ${'x'.repeat(500)} */ });`});
    const packet=contextPacket({root,component,symbol:'move',maxChars:500});
    expect(packet).toMatchObject({status:'complete',requiredReads:[],omitted:1,testEvidence:[]});
  });
  it('refuses traversal and test entrypoints',()=>{
    expect(()=>contextPacket({root,component:'../sample'})).toThrow('invalid component');
    expect(()=>contextPacket({root,component:'sample',entry:'../outside.ts'})).toThrow('invalid entry');
    expect(()=>contextPacket({root,component:'sample',entry:'impl.test.ts'})).toThrow('test');
  });
  it('CLI exits nonzero on missing symbols and prints a bounded JSON packet on success',()=>{
    const run=(symbol)=>spawnSync(process.execPath,[cli,'sample',symbol,'--root',root,'--max-chars','6000'],{encoding:'utf8'});
    const ok=run('play');
    expect(ok.status,ok.stderr).toBe(0);
    expect(ok.stdout,ok.stderr||`no output from ${cli}`).not.toBe('');
    expect(JSON.parse(ok.stdout)).toMatchObject({symbol:'play',status:'complete'});
    expect(run('secret').status).toBe(1);
  });
  it('discovers a dice component and uses its contract in a downstream check',()=>{
    const repo=path.resolve(import.meta.dirname,'../..');
    const search=spawnSync(process.execPath,[path.join(repo,'kit.mjs'),'search','exact','dice','odds'],{encoding:'utf8'});
    expect(search.status,search.stderr).toBe(0);
    const component=search.stdout.split('\n')[0].match(/\(`([^`]+)`\)/)?.[1];
    expect(component).toBe('dice-odds');
    const packet=contextPacket({component,symbol:'chance'});
    expect(packet.status).toBe('complete');
    expect(packet.contracts[0].signature).toContain('spec?: DiceSpec');
    expect(packet.rules.map(rule=>rule.text).join('\n')).toContain('Keep k small');
    const api=pathToFileURL(path.join(repo,'components',packet.component,packet.entry)).href;
    const script=`import { ${packet.symbol} as rollChance } from ${JSON.stringify(api)};
      console.log(rollChance(2, dice => dice.includes(4), { sides: 4 }));`;
    const game=spawnSync(process.execPath,['--input-type=module'],{input:script,encoding:'utf8'});
    expect(game.status,game.stderr).toBe(0);
    expect(Number.parseFloat(game.stdout)).toBe(7/16);
  });
});
