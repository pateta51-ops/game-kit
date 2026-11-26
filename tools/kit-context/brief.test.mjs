import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cli=path.join(import.meta.dirname,'brief.mjs');
const kit=path.resolve(import.meta.dirname,'../../kit.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kit-worker-brief-'));
const source=path.join(tmp,'source');
let commit,count=0;
const git=(...args)=>execFileSync('git',['-C',source,'-c','user.name=Kit test','-c','user.email=test@users.noreply.github.com','-c','commit.gpgsign=false',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const put=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
beforeAll(()=>{
  fs.mkdirSync(source);git('init','-q');git('config','core.autocrlf','false');
  fs.copyFileSync(kit,path.join(source,'kit.mjs'));
  put(path.join(source,'components/sample/component.json'),JSON.stringify({name:'sample',needs:[]}));
  put(path.join(source,'components/sample/index.ts'),'export function move(value: number): number { return value; }\nexport function deferred(value: Missing): Missing { return value; }\n');
  put(path.join(source,'components/sample/README.md'),'# Sample\n## Rules for agents\nUse legal input.\n');
  put(path.join(source,'docs/recipes/sample.md'),'# Recipe\nCall the public move export.\n');
  put(path.join(source,'docs/worker-rules.md'),'# Worker rules\nUse the kit.\n');
  git('add','-A');git('commit','-qm','fixture');git('tag','v1');commit=git('rev-parse','HEAD');
});
afterAll(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const fixture=()=>{
  const game=path.join(tmp,'game'+ ++count);fs.mkdirSync(game);
  const pull=spawnSync(process.execPath,[kit,'pull',source,'v1','sample'],{cwd:game,encoding:'utf8'});
  expect(pull.status,pull.stderr).toBe(0);
  put(path.join(game,'docs/PLAN.md'),'# Plan\nB1 wire the selected API.\nDo not change the art.\n');
  put(path.join(game,'package.json'),JSON.stringify({scripts:{'test:slice':"node -e \"require('fs').writeFileSync('executed','yes')\""}}));
  const task={
    version:1,id:'B1',repo:'sample-game',branch:'b1-wire-api',kitCommit:commit,goal:'Wire the selected public API.',
    reads:[{file:'docs/PLAN.md',from:2,to:3}],recipe:'kit/recipes/sample.md',
    files:[{file:'src/engine/adapter.ts',action:'create'}],
    apis:[{component:'sample',symbol:'move',mustUse:true}],
    acceptance:[{script:'test:slice',proves:'The adapter accepts a legal move.'}],
    outOfScope:['Art decisions'],escalation:{owner:'architect',stop:'Stop before changing the public contract.'},
    questions:[],completion:'Run the game finish workflow and report its PR-head evidence.',
  };
  const run=(input=task,...flags)=>{
    const file=path.join(game,'task.json');fs.writeFileSync(file,JSON.stringify(input));
    return spawnSync(process.execPath,[cli,file,'--game',game,'--source',source,...flags],{encoding:'utf8'});
  };
  return {game,task,run};
};

describe('bounded worker briefs',()=>{
  it('assembles supplied decisions and verified APIs without executing acceptance commands',()=>{
    const {game,run}=fixture();
    const result=run();expect(result.status,result.stderr).toBe(0);
    const brief=JSON.parse(result.stdout);
    expect(brief).toMatchObject({schemaVersion:1,scope:'worker-brief',status:'complete',taskReadiness:'not-assessed',validationEvidence:[]});
    expect(brief.kit.target.commit).toBe(commit);
    expect(brief.task).toMatchObject({id:'B1',repo:'sample-game',branch:'b1-wire-api',questions:[]});
    expect(brief.reads).toEqual(expect.arrayContaining([
      expect.objectContaining({file:'AGENTS.md',sha256:expect.any(String)}),
      expect.objectContaining({file:'docs/PLAN.md',from:2,to:3}),
      expect.objectContaining({file:'kit/recipes/sample.md'}),
    ]));
    expect(brief.apis[0].context.contracts[0].signature).toContain('value: number');
    expect(brief.mustUse).toEqual(['sample:move']);
    expect(brief.acceptance).toEqual([{command:'npm run test:slice',proves:'The adapter accepts a legal move.',executed:false}]);
    expect(fs.existsSync(path.join(game,'executed'))).toBe(false);
    expect(JSON.parse(run().stdout)).toEqual(brief);
  });
  it('keeps unresolved decisions visible instead of inventing an answer',()=>{
    const {task,run}=fixture();
    task.questions=[{question:'Which seat starts?',owner:'arbiter'}];
    const result=run();expect(result.status,result.stderr).toBe(2);
    const brief=JSON.parse(result.stdout);
    expect(brief.task.questions).toEqual(task.questions);
    expect(brief.status).toBe('incomplete');
    expect(brief.taskReadiness).toBe('not-assessed');
  });
  it('fingerprints task inputs even when the new query budget returns the same complete API',()=>{
    const {task,run}=fixture();
    const before=JSON.parse(run().stdout);
    const result=run({...task,apis:[{...task.apis[0],maxChars:6001}]});
    expect(result.status,result.stderr).toBe(0);
    const after=JSON.parse(result.stdout);
    expect(after.apis).toEqual(before.apis);
    expect(after.inputs.task.sha256).not.toBe(before.inputs.task.sha256);
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });
  it('invalidates the input fingerprint when a registered script changes behind the same name',()=>{
    const {game,run}=fixture();
    const before=JSON.parse(run().stdout);
    put(path.join(game,'package.json'),JSON.stringify({scripts:{'test:slice':'node -e "console.log(123)"'}}));
    const result=run();expect(result.status,result.stderr).toBe(0);
    const after=JSON.parse(result.stdout);
    expect(after.acceptance).toEqual(before.acceptance);
    expect(after).not.toEqual(before);
    expect(after.inputs.package.sha256).not.toBe(before.inputs.package.sha256);
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });
  it('fingerprints edit-owned bytes and records create-owned files as missing',()=>{
    const {game,task,run}=fixture();
    const fresh=JSON.parse(run().stdout);
    expect(fresh.inputs.ownedFiles).toEqual([{file:'src/engine/adapter.ts',status:'missing',sha256:null}]);
    put(path.join(game,'src/engine/adapter.ts'),'export const value = 1;\n');
    const staleCreate=run();expect(staleCreate.status).toBe(1);expect(staleCreate.stderr).toContain('create file already exists');
    task.files[0].action='edit';
    const before=JSON.parse(run().stdout);
    expect(before.inputs.ownedFiles[0]).toMatchObject({status:'existing',sha256:expect.any(String)});
    put(path.join(game,'src/engine/adapter.ts'),'export const value = 2;\n');
    const result=run();expect(result.status,result.stderr).toBe(0);
    const after=JSON.parse(result.stdout);
    expect(after).not.toEqual(before);
    expect(after.inputs.ownedFiles[0].sha256).not.toBe(before.inputs.ownedFiles[0].sha256);
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });
  it('keeps an incomplete API contract incomplete even when its packet fits',()=>{
    const {task,run}=fixture();
    const result=run({...task,apis:[{component:'sample',symbol:'deferred'}]});
    expect(result.status,result.stderr).toBe(2);
    const brief=JSON.parse(result.stdout);
    expect(brief.apis[0].context.status).toBe('incomplete');
    expect(brief.requiredReads).toEqual([expect.objectContaining({reason:'api-contract-incomplete',files:['index.ts']})]);
    expect(brief.omitted).toBe(0);
  });
  it('returns bounded continuations when an API packet cannot fit',()=>{
    const {run}=fixture();
    const full=run();expect(full.status,full.stderr).toBe(0);
    const budget=full.stdout.trimEnd().length-1;
    const result=run(undefined,'--max-chars',String(budget));expect(result.status,result.stderr).toBe(2);
    const brief=JSON.parse(result.stdout);
    expect(result.stdout.trimEnd().length).toBeLessThanOrEqual(budget);
    expect(brief.requiredReads).toEqual([expect.objectContaining({component:'sample',reason:'packet-budget',files:['index.ts','README.md']})]);
    expect(brief.apis[0]).not.toHaveProperty('context');
  });
  it('rejects a task for another pin and a public export that does not exist',()=>{
    const {task,run}=fixture();
    const stale=run({...task,kitCommit:'0'.repeat(40)});
    expect(stale.status).toBe(1);expect(stale.stdout).toBe('');expect(stale.stderr).toContain('task kitCommit does not match');
    const missing=run({...task,apis:[{component:'sample',symbol:'missing'}]});
    expect(missing.status).toBe(1);expect(missing.stderr).toContain('not exported');
  });
  it('validates owned files, explicit read ranges and registered acceptance scripts',()=>{
    const {task,run}=fixture();
    for(const [change,message] of [
      [{files:[{file:'kit/sample/index.ts',action:'edit'}]},'owned files must be outside kit'],
      [{files:[{file:'missing.ts',action:'edit'}]},'edit file is missing'],
      [{files:[{file:'package.json',action:'create'}]},'create file already exists'],
      [{reads:[{file:'docs/PLAN.md'}]},'requires a line range'],
      [{reads:[{file:'docs/PLAN.md',from:2,to:500}]},'invalid line range'],
      [{reads:[{file:'../outside.md'}]},'invalid game-relative path'],
      [{acceptance:[{script:'unknown',proves:'A result.'}]},'missing npm script'],
    ]) {
      const result=run({...task,...change});
      expect(result.status,result.stderr).toBe(1);expect(result.stderr).toContain(message);
    }
  });
  it('rejects escaping read symlinks and incomplete decision inputs',()=>{
    const {game,task,run}=fixture();
    const outsideDir=path.join(tmp,'outside');
    put(path.join(outsideDir,'guide.md'),'Outside.');
    fs.symlinkSync(outsideDir,path.join(game,'outside'),process.platform==='win32'?'junction':'dir');
    const outside=run({...task,reads:[{file:'outside/guide.md'}]});
    expect(outside.status).toBe(1);expect(outside.stderr).toContain('escapes game');
    const missing=run({...task,escalation:{owner:'architect'}});
    expect(missing.status).toBe(1);expect(missing.stderr).toContain('escalation.stop');
  });
  it('requires a line range even when a planning reference is named through an alias',()=>{
    const {game,task,run}=fixture();
    const file=process.platform==='win32'?'docs/plan.md':'docs/overview.md';
    if(process.platform!=='win32') fs.symlinkSync('PLAN.md',path.join(game,file));
    const whole=run({...task,reads:[{file}]});
    expect(whole.status).toBe(1);
    expect(whole.stderr).toContain('requires a line range');
    const ranged=run({...task,reads:[{file,from:2,to:3}]});
    expect(ranged.status,ranged.stderr).toBe(0);
  });
});
