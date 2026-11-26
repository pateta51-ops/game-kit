import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { contextPacket } from './context.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'kit-context-focused-'));
let count=0;
const sha=text=>createHash('sha256').update(text).digest('hex');
const fixture=()=>{
  const component='sample-'+ ++count,dir=path.join(root,component);
  fs.mkdirSync(dir);
  const readme='# Sample\n## Rules for agents\nAlways reject stale actions.\n\n## Unrelated subsystem\n'+('Other behavior.\n'.repeat(500));
  const guide='# Move\n\nUse the legal answer.\n\n## Rules for agents\nRecompute eligibility when committing.\n';
  fs.writeFileSync(path.join(dir,'README.md'),readme);
  fs.writeFileSync(path.join(dir,'move.md'),guide);
  fs.writeFileSync(path.join(dir,'component.json'),JSON.stringify({name:component,needs:[]}));
  fs.writeFileSync(path.join(dir,'index.ts'),'export interface Move { value: number }\nexport function move(value: Move): number { return value.value; }\n');
  const mapping={version:1,sources:{'README.md':sha(readme),'move.md':sha(guide)},apis:[{
    entry:'index.ts',symbol:'move',rules:[{file:'README.md',from:3,to:3},{file:'move.md',from:6,to:6}],
    usage:[{file:'move.md',from:1,to:3}],dependencies:[],
  }]};
  fs.writeFileSync(path.join(dir,'context.json'),JSON.stringify(mapping));
  return {component,dir,mapping};
};
afterAll(()=>fs.rmSync(root,{recursive:true,force:true}));

describe('focused context at one observed pin',()=>{
  it('uses authored applicable guidance without losing mandatory rules or required declarations',()=>{
    const {component}=fixture();
    const before=contextPacket({root,component,symbol:'move',maxChars:6000});
    const after=contextPacket({root,component,symbol:'move',focused:true,maxChars:6000});
    expect(before.status).toBe('incomplete');
    expect(after.status).toBe('complete');
    expect(after.guidance.status).toBe('authored');
    expect(after.contracts.some(row=>row.signature.includes('interface Move'))).toBe(true);
    expect(after.rules.map(row=>row.text).join('\n')).toContain('Always reject stale actions.');
    expect(after.rules.map(row=>row.text).join('\n')).toContain('Recompute eligibility when committing.');
    expect(JSON.stringify(after)).not.toContain('Unrelated subsystem');
  });
  it('accepts CRLF checkout conversion but rejects changed instruction text',()=>{
    const {component,dir}=fixture();
    for(const name of ['README.md','move.md']) {
      const file=path.join(dir,name);
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\n/g,'\r\n'));
    }
    const query=()=>contextPacket({root,component,symbol:'move',focused:true,maxChars:6000});
    const packet=query();
    expect(packet.status).toBe('complete');
    expect(packet.guidance.status).toBe('authored');
    expect(packet.guidance).not.toHaveProperty('renderedSources');
    expect(packet.rules.map(row=>row.text).join('\n')).toContain('Recompute eligibility when committing.');
    const guide=path.join(dir,'move.md');
    fs.writeFileSync(guide,fs.readFileSync(guide,'utf8').replace('Recompute eligibility','Skip eligibility'));
    expect(query).toThrow('guidance source changed: move.md');
  });
  it('paginates all required material at a fixed budget and rejects a changed-input cursor',()=>{
    const {component,dir,mapping}=fixture();
    const guide=Array.from({length:30},(_,i)=>'Rule '+i+': '+('required contract words '.repeat(10))).join('\n\n')+'\n';
    fs.writeFileSync(path.join(dir,'move.md'),guide);
    mapping.sources['move.md']=sha(guide);
    mapping.apis[0].rules=[{file:'move.md',from:1,to:59}];mapping.apis[0].usage=[];
    fs.writeFileSync(path.join(dir,'context.json'),JSON.stringify(mapping));
    const options={root,component,symbol:'move',focused:true,maxChars:2400};
    const first=contextPacket(options),pages=[first];
    expect(first.page.next).toEqual(expect.any(String));
    let cursor=first.page.next;
    while(cursor){const page=contextPacket({...options,cursor});pages.push(page);cursor=page.page.next;expect(pages.length).toBeLessThan(100);}
    expect(pages.every(page=>JSON.stringify(page).length<=2400)).toBe(true);
    expect(pages.every(page=>page.inputFingerprint===first.inputFingerprint)).toBe(true);
    expect(pages.at(-1).page.remaining).toBe(0);
    expect(pages.at(-1).status).toBe('incomplete');
    expect(pages.flatMap(page=>page.rules).map(row=>row.text).join('\n')).toContain('Rule 29:');
    fs.appendFileSync(path.join(dir,'index.ts'),'\nexport const changed = true;\n');
    expect(()=>contextPacket({...options,cursor:first.page.next})).toThrow('context inputs changed');
  });
  it('refuses stale, escaping, missing and undeclared guidance instead of claiming completeness',()=>{
    const {component,dir,mapping}=fixture();
    const query=()=>contextPacket({root,component,symbol:'move',focused:true,maxChars:6000});
    fs.appendFileSync(path.join(dir,'move.md'),'New mandatory instruction.\n');
    expect(query).toThrow('guidance source changed');
    mapping.sources['move.md']=sha(fs.readFileSync(path.join(dir,'move.md')));
    mapping.apis[0].dependencies=[{component:'unlisted',entry:'index.ts',symbol:'move'}];
    fs.writeFileSync(path.join(dir,'context.json'),JSON.stringify(mapping));
    expect(query).toThrow('declared dependency');
    mapping.apis[0].dependencies=[];mapping.apis[0].usage=[{file:'../outside.md',from:1,to:1}];
    fs.writeFileSync(path.join(dir,'context.json'),JSON.stringify(mapping));
    expect(query).toThrow('guidance path');
    fs.unlinkSync(path.join(dir,'move.md'));
    expect(query).toThrow();
  });
  it('keeps an unmapped older component on its own full guidance and reports unresolved contracts',()=>{
    const {component,dir}=fixture();
    fs.unlinkSync(path.join(dir,'context.json'));
    fs.writeFileSync(path.join(dir,'index.ts'),'export function move(value: Missing): Missing { return value; }\n');
    const packet=contextPacket({root,component,symbol:'move',focused:true,maxChars:6000});
    expect(packet.guidance.status).toBe('unmapped');
    expect(packet.status).toBe('incomplete');
    expect(packet.requiredReads).toContain('index.ts');
  });
  it('prints real bounded JSON and exit 2 for a continuation through the CLI',()=>{
    const {component}=fixture();
    const run=spawnSync(process.execPath,[path.join(import.meta.dirname,'context.mjs'),component,'move','--root',root,'--focused','--max-chars','1200'],{encoding:'utf8'});
    expect(run.status,run.stderr).toBe(2);
    const packet=JSON.parse(run.stdout);
    expect(packet.page.next).toEqual(expect.any(String));
    expect(run.stdout.trimEnd().length).toBeLessThanOrEqual(1200);
  });
});
