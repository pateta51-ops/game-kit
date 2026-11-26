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
  put(path.join(source,'docs/recipes/sample.md'),'# Sample recipe\nFollow the component rules.\n');
  for(const [tag,type] of [['mapped-v1','number'],['mapped-v2','string']]) {
    const readme='# Sample\n## Rules for agents\nUse a '+type+'. Read [the recipe](../../docs/recipes/sample.md).\n';
    put(path.join(source,'components/sample/README.md'),readme);
    put(path.join(source,'components/sample/index.ts'),'export function move(value: '+type+'): '+type+' { return value; }\n');
    put(path.join(source,'components/sample/context.json'),JSON.stringify({version:1,sources:{'README.md':createHash('sha256').update(readme).digest('hex')},apis:[{
      entry:'index.ts',symbol:'move',rules:[{file:'README.md',from:3,to:3}],usage:[{file:'README.md',from:1,to:1}],dependencies:[],
    }]}));
    commit(tag);
  }
  fs.appendFileSync(path.join(source,'components/sample/README.md'),'New mandatory instruction without a refreshed map.\n');
  commit('mapped-stale');
});
afterAll(()=>fs.rmSync(tmp,{recursive:true,force:true}));

describe('context provenance',()=>{
  it('reports scoped producer changes and only identifies its own Git checkout',()=>{
    const repo=path.join(tmp,'producer');
    fs.mkdirSync(repo);
    const ownGit=(...args)=>git('-C',repo,...args);
    ownGit('init','-q');
    const file=path.join(repo,'tools/kit-context/provenance.mjs');
    put(file,fs.readFileSync(path.join(import.meta.dirname,'provenance.mjs')));
    const tool=path.join(repo,'kit.mjs');
    put(tool,'// Original verifier.\n');
    put(path.join(repo,'.gitignore'),'copied/\n');
    ownGit('add','-A');
    ownGit('commit','-qm','producer fixture');
    const commit=ownGit('rev-parse','HEAD');
    const metadata=script=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',
      "import { pathToFileURL } from 'node:url'; const m=await import(pathToFileURL(process.argv[1])); console.log(JSON.stringify(m.contextTool()));",script],{encoding:'utf8'}));
    expect(metadata(file)).toEqual({name:'kit-context',commit,modified:false,sourceSha256:expect.any(String)});
    fs.appendFileSync(tool,'// Ordinary change.\n');
    expect(metadata(file).modified).toBe(true);
    ownGit('restore','kit.mjs');
    const flagged=[];
    for(const flag of ['assume-unchanged','skip-worktree']) {
      ownGit('update-index','--'+flag,'kit.mjs');
      put(tool,'// Change covered by an index flag.\n');
      flagged.push(metadata(file));
      ownGit('update-index','--no-'+flag,'kit.mjs');
      ownGit('restore','kit.mjs');
    }
    const copy=path.join(repo,'copied/tools/kit-context/provenance.mjs');
    put(copy,fs.readFileSync(file));
    expect([...flagged,metadata(copy)]).toEqual([
      {name:'kit-context',commit,modified:null,sourceSha256:expect.any(String)},
      {name:'kit-context',commit,modified:null,sourceSha256:expect.any(String)},
      {name:'kit-context',commit:null,modified:null,sourceSha256:expect.any(String)},
    ]);
    const unrelated=path.join(repo,'copied');
    const copyGit=(...args)=>git('-C',unrelated,...args);
    copyGit('init','-q');
    put(path.join(unrelated,'kit.mjs'),'// Copied verifier.\n');
    put(path.join(unrelated,'.gitignore'),'kit.mjs\ntools/\n');
    copyGit('add','.gitignore');
    copyGit('commit','-qm','unrelated fixture');
    expect(metadata(copy)).toEqual({name:'kit-context',commit:null,modified:null,sourceSha256:expect.any(String)});
  });

  it('binds receipt verifier and reference scanner source to tool identity and focused continuations',()=>{
    const repo=path.join(tmp,'producer-dependencies');
    fs.mkdirSync(repo);
    const ownGit=(...args)=>git('-C',repo,...args);
    ownGit('init','-q');
    const dependencies=['components/check-runner/receipt.ts','components/check-runner/tracked-source.ts','components/check-runner/check-runner.ts','tools/reuse-metrics/report.mjs'];
    const modules=fs.readdirSync(import.meta.dirname).filter(file=>file.endsWith('.mjs')&&!file.endsWith('.test.mjs')).map(file=>'tools/kit-context/'+file);
    for(const file of ['kit.mjs',...modules,...dependencies]) put(path.join(repo,file),fs.readFileSync(path.join(checkout,file)));
    put(path.join(repo,'.gitignore'),'node_modules/\n');
    fs.symlinkSync(path.join(checkout,'node_modules'),path.join(repo,'node_modules'),process.platform==='win32'?'junction':'dir');
    ownGit('add','-A');ownGit('commit','-qm','producer dependencies');
    const componentRoot=path.join(tmp,'dependency-contract');
    put(path.join(componentRoot,'sample/component.json'),JSON.stringify({name:'sample',needs:[]}));
    put(path.join(componentRoot,'sample/index.ts'),'export function move(value: number): number { return value; }\n');
    put(path.join(componentRoot,'sample/README.md'),'# Sample\n## Rules for agents\n'+Array.from({length:30},(_,i)=>'Rule '+i+': '+('required contract words '.repeat(10))).join('\n\n')+'\n');
    const run=(...flags)=>spawnSync(process.execPath,[path.join(repo,'tools/kit-context/context.mjs'),'sample','move','--root',componentRoot,'--focused','--max-chars','3000',...flags],{encoding:'utf8'});
    const query=()=>{const result=run();expect(result.status,result.stderr).toBe(2);return JSON.parse(result.stdout);};
    let previous=query();
    expect(previous.tool.modified).toBe(false);
    for(const file of dependencies) {
      fs.appendFileSync(path.join(repo,file),'\n// Changed evidence dependency.\n');
      const current=query();
      expect(current.tool.modified).toBe(true);
      expect(current.tool.sourceSha256).toEqual(expect.any(String));
      expect(current.tool.sourceSha256).not.toBe(previous.tool.sourceSha256);
      const stale=run('--cursor',previous.page.next);
      expect(stale.status,stale.stderr).toBe(1);
      expect(stale.stderr).toContain('context inputs changed');
      previous=current;
    }
  });

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
  it('keeps focused continuations on each installed pin and rejects changed verified bytes',()=>{
    for(const [tag,type] of [['v1','number'],['v2','string']]) {
      const root=game(tag);
      const packet=query(root,{focused:true,maxChars:6000});
      expect(packet.provenance.target.commit).toBe(git('rev-parse',tag));
      expect(packet.continuation).toMatchObject({root,source,focused:true});
      expect(packet.guidance.status).toBe('unmapped');
      expect(packet.contracts[0].signature).toContain('value: '+type);
      fs.appendFileSync(path.join(root,'sample/guide.md'),'Changed mandatory guidance.\n');
      expect(()=>query(root,{focused:true})).toThrow('changed kit/sample/guide.md');
    }
    const legacy=query(game('legacy'),{focused:true});
    expect(legacy.provenance.status).toBe('partial');
    expect(legacy.taskReadiness).toBe('not-assessed');
  });
  it('validates authored map hashes across real installed Markdown rendering at the exact pin',()=>{
    for(const [tag,type] of [['mapped-v1','number'],['mapped-v2','string']]) {
      const root=game(tag),readme=path.join(root,'sample/README.md');
      const mapped=JSON.parse(fs.readFileSync(path.join(root,'sample/context.json'),'utf8'));
      expect(createHash('sha256').update(fs.readFileSync(readme)).digest('hex')).not.toBe(mapped.sources['README.md']);
      const packet=query(root,{focused:true});
      expect(packet.provenance.target.commit).toBe(git('rev-parse',tag));
      expect(packet.guidance).toMatchObject({status:'authored',renderedSources:['README.md']});
      expect(packet.rules.map(row=>row.text).join('\n')).toContain('Use a '+type+'. Read [the recipe](../recipes/sample.md).');
      expect(packet.contracts[0].signature).toContain('value: '+type);
      expect(()=>contextPacket({root,component:'sample',symbol:'move',focused:true})).toThrow('guidance source changed');
      fs.appendFileSync(readme,'Changed installed guidance.\n');
      const lock=JSON.parse(fs.readFileSync(path.join(root,'kit.lock.json'),'utf8'));
      lock.components.sample.files['kit/sample/README.md']=createHash('sha256').update(fs.readFileSync(readme)).digest('hex');
      fs.writeFileSync(path.join(root,'kit.lock.json'),JSON.stringify(lock));
      expect(()=>query(root,{focused:true})).toThrow('content differs from the tagged commit: kit/sample/README.md');
    }
    expect(()=>query(game('mapped-stale'),{focused:true})).toThrow('guidance source changed: README.md');
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
  it('rejects a kit linked from another game before certifying source provenance',()=>{
    const donor=game('v1');
    const recipient=fs.mkdtempSync(path.join(tmp,'recipient-'));
    const linked=path.join(recipient,'kit');
    fs.symlinkSync(donor,linked,process.platform==='win32'?'junction':'dir');
    expect(()=>query(linked)).toThrow('cannot verify a linked kit directory');
  });
  it('can verify a game reached through an alias when kit is local to that game',()=>{
    const root=game('v1');
    const alias=path.join(tmp,'game-alias');
    fs.symlinkSync(path.dirname(root),alias,process.platform==='win32'?'junction':'dir');
    expect(query(path.join(alias,'kit')).provenance.status).toBe('verified');
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
