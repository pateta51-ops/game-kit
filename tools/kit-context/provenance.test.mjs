import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contextPacket } from './context.mjs';

const checkout=path.resolve(import.meta.dirname,'../..');
const cli=path.join(import.meta.dirname,'context.mjs');
const kit=path.join(checkout,'kit.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kit-context-source-'));
const source=path.join(tmp,'source');
let count=0;
const git=(...args)=>execFileSync('git',['-C',source,'-c','user.name=Kit test','-c','user.email=test@users.noreply.github.com','-c','commit.gpgsign=false',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const put=(file,content)=>{ fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content); };
const commit=tag=>{git('add','-A');git('commit','-qm',tag);git('tag',tag);};
const game=tag=>{
  const dir=path.join(tmp,'game'+ ++count);
  fs.mkdirSync(dir);
  const run=spawnSync(process.execPath,[kit,'pull',source,tag,'sample'],{cwd:dir,encoding:'utf8'});
  expect(run.status,run.stderr).toBe(0);
  return path.join(dir,'kit');
};
const query=(root,options={})=>contextPacket({root,component:'sample',symbol:'move',source,...options});
beforeAll(()=>{
  fs.mkdirSync(source);
  git('init','-q');
  git('config','core.autocrlf','false');
  fs.copyFileSync(kit,path.join(source,'kit.mjs'));
  put(path.join(source,'components/sample/component.json'),JSON.stringify({name:'sample',needs:[]}));
  put(path.join(source,'components/sample/README.md'),'# Sample\n## Rules for agents\nUse a number. Read [the guide](guide.md).\n');
  put(path.join(source,'components/sample/guide.md'),'# Guide\nThe first pin accepts a number.\n');
  put(path.join(source,'components/sample/index.ts'),'export function move(value: number): number { return value; }\n');
  fs.writeFileSync(path.join(source,'kit.mjs'),'// Legacy CLI fixture.\n');
  commit('legacy');
  fs.copyFileSync(kit,path.join(source,'kit.mjs'));
  commit('v1');
  put(path.join(source,'components/sample/README.md'),'# Sample\n## Rules for agents\nUse a string. Read [the guide](guide.md).\n');
  put(path.join(source,'components/sample/guide.md'),'# Guide\nThe second pin accepts a string.\n');
  put(path.join(source,'components/sample/index.ts'),'export function move(value: string): string { return value; }\n');
  commit('v2');
  put(path.join(source,'components/sample/README.md'),'# Sample\n## Rules for agents\nRequired: '+ 'read this instruction '.repeat(180)+'\n');
  commit('large');
});
afterAll(()=>fs.rmSync(tmp,{recursive:true,force:true}));

describe('context provenance',()=>{
  it('uses the target pin for contracts and guides, with the existing lock and Git identities',()=>{
    for(const [tag,type,guide] of [['v1','number','first'],['v2','string','second']]) {
      const root=game(tag);
      const packet=query(root);
      expect(packet).toMatchObject({schemaVersion:1,tool:{name:'kit-context'},scope:'api-contract',taskReadiness:'not-assessed',status:'complete'});
      expect(packet.provenance).toMatchObject({
        status:'verified',method:'kit.mjs check --source',scope:'installed-kit-against-source',
        target:{ref:tag,commit:git('rev-parse',tag)},
        lock:{file:'kit/kit.lock.json',sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'kit.lock.json'))).digest('hex')},
        content:{componentTree:git('rev-parse',tag+':components/sample'),lockPointer:'/components/sample/files'},
      });
      expect(packet.contracts[0].signature).toContain('value: '+type);
      expect(packet.rules.map(row=>row.text).join('\n')).toContain('Use a '+type);
      expect(packet.usage.find(row=>row.file==='guide.md').text).toContain('The '+guide+' pin');
      expect(query(root)).toEqual(packet);
    }
  });
  it('does not call a lock declaration or an unverified checkout verified',()=>{
    const root=game('v1');
    const packet=contextPacket({root,component:'sample',symbol:'move',provenance:true});
    expect(packet.provenance).toEqual({status:'unverified',method:null});
    expect(packet.taskReadiness).toBe('not-assessed');
    expect(packet.status).toBe('complete');
    expect(contextPacket({root,component:'sample',symbol:'move'})).not.toHaveProperty('provenance');
    expect(()=>query(path.join(source,'components'))).toThrow('vendored kit');
  });
  it('rejects a changed file even when its local lock hash was also changed',()=>{
    const root=game('v1');
    const file=path.join(root,'sample/README.md');
    fs.appendFileSync(file,'\nChanged instructions.\n');
    const lock=JSON.parse(fs.readFileSync(path.join(root,'kit.lock.json'),'utf8'));
    lock.components.sample.files['kit/sample/README.md']=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fs.writeFileSync(path.join(root,'kit.lock.json'),JSON.stringify(lock));
    expect(()=>query(root)).toThrow('content differs from the tagged commit: kit/sample/README.md');
  });
  it('rejects a different pin and never executes the installed verifier',()=>{
    const root=game('v1');
    const lock=JSON.parse(fs.readFileSync(path.join(root,'kit.lock.json'),'utf8'));
    lock.ref='v2';lock.commit=git('rev-parse','v2');
    fs.writeFileSync(path.join(root,'kit.lock.json'),JSON.stringify(lock));
    expect(()=>query(root)).toThrow('content differs from the tagged commit');
    const changed=game('v1');
    fs.writeFileSync(path.join(changed,'kit.mjs'),'process.exit(0);\n');
    expect(()=>query(changed)).toThrow('changed kit/kit.mjs');
  });
  it('does not certify a pin absent from the supplied source',()=>{
    const root=game('v1');
    const missing=path.join(tmp,'empty-source');
    fs.mkdirSync(missing);
    execFileSync('git',['-C',missing,'init','-q']);
    expect(()=>query(root,{source:missing})).toThrow('not found');
  });
  it('reports actual legacy source-check coverage without certifying unrecorded support',()=>{
    const root=game('legacy');
    fs.writeFileSync(path.join(root,'kit.mjs'),'// An unrecorded installed CLI change.\n');
    const check=spawnSync(process.execPath,[kit,'check','--source',source],{cwd:path.dirname(root),encoding:'utf8'});
    expect(check.status,check.stderr).toBe(0);
    expect(check.stderr).toContain('legacy lock');
    const packet=query(root);
    expect(packet.status).toBe('complete');
    expect(packet.provenance).toMatchObject({status:'partial',scope:'recorded-files-against-source'});
    expect(packet.provenance.warnings.join('\n')).toContain('kit.mjs and CATALOG.md are outside its coverage');
  });
  it('preserves mandatory continuations and the full budget with provenance enabled',()=>{
    const root=game('large');
    const packet=query(root,{maxChars:1500});
    expect(packet.provenance.status).toBe('verified');
    expect(packet.status).toBe('incomplete');
    expect(packet.taskReadiness).toBe('not-assessed');
    expect(packet.requiredReads).toContain('README.md');
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(1500);
    const run=spawnSync(process.execPath,[cli,'sample','move','--root',root,'--source',source,'--max-chars','1500'],{encoding:'utf8'});
    expect(run.status,run.stderr).toBe(2);
    expect(JSON.parse(run.stdout)).toEqual(packet);
  });
  it('reports successful provenance and invalid source requests through CLI exit codes',()=>{
    const root=game('v1');
    const run=(...flags)=>spawnSync(process.execPath,[cli,'sample','move','--root',root,...flags],{encoding:'utf8'});
    const verified=run('--source',source);
    expect(verified.status,verified.stderr).toBe(0);
    expect(JSON.parse(verified.stdout).provenance.status).toBe('verified');
    const unverified=run('--provenance');
    expect(unverified.status,unverified.stderr).toBe(0);
    expect(JSON.parse(unverified.stdout).provenance.status).toBe('unverified');
    fs.appendFileSync(path.join(root,'sample/index.ts'),'\n// changed\n');
    const bad=run('--source',source);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).toContain('changed kit/sample/index.ts');
  });
});
