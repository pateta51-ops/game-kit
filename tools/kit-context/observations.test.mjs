import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { observationEvidence } from './observations.mjs';
import { contextPacket } from './context.mjs';

const checkout=path.resolve(import.meta.dirname,'../..'),kit=path.join(checkout,'kit.mjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kit-observations-')),source=path.join(tmp,'source');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const put=(file,content)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
const git=(root,...args)=>execFileSync('git',['-C',root,'-c','user.name=Kit test','-c','user.email=test@users.noreply.github.com','-c','commit.gpgsign=false',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let revision,count=0;
beforeAll(()=>{
  fs.mkdirSync(source);git(source,'init','-q');git(source,'config','core.autocrlf','false');
  fs.copyFileSync(kit,path.join(source,'kit.mjs'));
  put(path.join(source,'components/sample/component.json'),JSON.stringify({name:'sample',needs:[]}));
  put(path.join(source,'components/sample/index.ts'),'export function move(value: number): number { return value; }\n');
  put(path.join(source,'components/sample/README.md'),'# Sample\n## Rules for agents\nUse legal input.\n');
  git(source,'add','-A');git(source,'commit','-qm','Observation source fixture');git(source,'tag','v1');revision=git(source,'rev-parse','HEAD');
});
afterAll(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function fixture(fail=false,consumerKind='reference') {
  const root=path.join(tmp,'consumer'+ ++count);fs.mkdirSync(root);
  const pull=spawnSync(process.execPath,[kit,'pull',source,'v1','sample'],{cwd:root,encoding:'utf8'});expect(pull.status,pull.stderr).toBe(0);
  put(path.join(root,'.gitignore'),'evidence/\n');
  put(path.join(root,'spec.json'),'{}\n');put(path.join(root,'acceptance.json'),JSON.stringify({componentObservations:[{id:'identity-function',component:'sample',script:'slice',behavior:'The move function preserves its argument.',consumerKind}]}));
  put(path.join(root,'tests/sample.test.ts'),"import { move } from '../kit/sample/index.ts';\nexport const probe = move(1);\n");
  put(path.join(root,'check.mjs'),"import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport { move } from './kit/sample/index.ts';\nfs.writeFileSync('evidence/executed','once');\nassert.equal("+(fail==='disconnected'?'undefined':'move(7)')+", "+(fail===true?'8':'7')+");\nconsole.log('observed behavior');\n");
  put(path.join(root,'package.json'),JSON.stringify({scripts:{check:'npm run slice',slice:'node check.mjs'}}));
  put(path.join(root,'check-runner.config.json'),JSON.stringify({checkScript:'check',first:['slice'],lanes:[],npmSilent:true,receipt:{output:'evidence/acceptance.json',spec:'spec.json',acceptance:'acceptance.json'}}));
  git(root,'init','-q');git(root,'add','-A');git(root,'commit','-qm','Observation consumer fixture');
  const temp=path.join(root,'evidence/tmp');fs.mkdirSync(temp,{recursive:true});
  const run=spawnSync(process.execPath,[path.join(checkout,'components/check-runner/check-runner.ts')],{cwd:root,encoding:'utf8',env:{...process.env,TMPDIR:temp,TMP:temp,TEMP:temp}});
  expect(run.status,run.stdout+run.stderr).toBe(fail?1:0);
  const logs=fs.readdirSync(temp).filter(name=>name.startsWith('check-runner-'));expect(logs).toHaveLength(1);
  fs.copyFileSync(path.join(temp,logs[0],'0.log'),path.join(root,'evidence/slice.log'));
  const receipt='evidence/acceptance.json';
  const row={id:'observation-'+count,component:'sample',revision,kind:'execution',consumer:{id:'consumer-'+count,kind:consumerKind,root},behavior:'The move function preserves its argument.',evidence:{receipt,sha256:sha(fs.readFileSync(path.join(root,receipt))),script:'slice',log:'evidence/slice.log',behaviorId:'identity-function'},limitations:['Synthetic compatibility fixture; no production adoption.']};
  const file=path.join(root,'evidence/observations.json');
  const report=(rows=[row],options={})=>{put(file,JSON.stringify({version:1,observations:rows}));return observationEvidence({file,component:'sample',commit:revision,source,...options});};
  return {root,row,file,report};
}

describe('source-bound component observations',()=>{
  it('verifies a real receipt, exact component pin and retained log without rerunning the command',()=>{
    const f=fixture(),report=f.report();
    expect(report.summary).toMatchObject({status:'matching',executedObservations:1,referenceConsumers:1,authorizedProductionConsumers:0});
    expect(report.observations[0]).toMatchObject({status:'verified-execution',command:{script:'slice',result:'passed',code:0},adoption:'reference'});
    expect(fs.readFileSync(path.join(f.root,'evidence/executed'),'utf8')).toBe('once');
    const packet=contextPacket({root:path.join(f.root,'kit'),source,component:'sample',symbol:'move',observations:f.file,maxChars:6000});
    expect(packet.maturity.referenceConsumers).toBe(1);
    expect(packet.taskReadiness).toBe('not-assessed');
    const unverified=contextPacket({component:'sample',root:path.join(f.root,'kit'),symbol:'move',observations:f.file});
    expect(unverified.maturity.status).toBe('unknown');
  });
  it('keeps test-file presence and static references separate from execution and adoption',()=>{
    const f=fixture(),file='tests/sample.test.ts',evidence={file,sha256:sha(fs.readFileSync(path.join(f.root,file)))};
    const report=f.report([{...f.row,id:'presence',kind:'test-file',evidence},{...f.row,id:'reference',kind:'static-reference',evidence}]);
    expect(report.summary).toMatchObject({testFiles:1,staticReferences:1,executedObservations:0,referenceConsumers:0,authorizedProductionConsumers:0});
    expect(report.observations.every(row=>row.executed===false)).toBe(true);
    expect(()=>f.report([{...f.row,verified:true}])).toThrow('unknown observation field: verified');
  });
  it('requires separate production authorization and deduplicates repeated consumer/source observations',()=>{
    const f=fixture(false,'production');
    expect(f.report().summary).toMatchObject({authorizedProductionConsumers:0,unconfirmedProductionConsumers:1});
    const duplicate={...f.row,id:'second-observation',consumer:{...f.row.consumer,id:'copied-consumer'}};
    const report=f.report([f.row,duplicate],{productionConsumers:[f.row.consumer.id,duplicate.consumer.id]});
    expect(report.summary).toMatchObject({executedObservations:2,authorizedProductionConsumers:1});
    expect(()=>f.report([f.row,{...f.row}])).toThrow('duplicate observation identity');
  });
  it('counts receipt-bound consumer gameplay separately from static, test, reference and release evidence',()=>{
    const f=fixture(false,'consumer'), file='tests/sample.test.ts';
    const staticOnly={...f.row,id:'static-only',kind:'static-reference',evidence:{file,sha256:sha(fs.readFileSync(path.join(f.root,file)))}};
    const copied={...f.row,id:'copied-observation',consumer:{...f.row.consumer,id:'copied-consumer'}};
    const test=fixture(false,'test'), reference=fixture();
    const report=f.report([f.row,copied,staticOnly,test.row,reference.row],{productionConsumers:[f.row.consumer.id]});
    expect(report.summary).toMatchObject({status:'matching',gameplayConsumers:1,executedObservations:4,staticReferences:1,
      executedTestConsumers:1,referenceConsumers:1,authorizedProductionConsumers:0,unconfirmedProductionConsumers:0});
    expect(report.observations[0]).toMatchObject({status:'verified-execution',adoption:'consumer-gameplay',
      consumer:{classificationSource:'operator-declared'},coverage:'declared-by-bound-acceptance',independentRuleReview:'not-assessed'});
    expect(report.observations[2]).toMatchObject({executed:false});
    expect(f.report([staticOnly]).summary.gameplayConsumers).toBe(0);
    const reclassified={...test.row,consumer:{...test.row.consumer,kind:'consumer'}};
    expect(f.report([reclassified]).summary).toMatchObject({status:'invalid',gameplayConsumers:0});
  });
  it('cannot count disconnected gameplay or another pin as a consumer execution',()=>{
    const f=fixture('disconnected','consumer');
    expect(f.report().summary).toMatchObject({status:'failed',gameplayConsumers:0,executedObservations:0});
    expect(f.report([{...f.row,revision:'0'.repeat(40)}]).summary).toMatchObject({status:'stale',gameplayConsumers:0,executedObservations:0});
  });
  it('never promotes a stale pin, missing log, modified source or failed run into matching execution',()=>{
    const f=fixture();
    const stale=f.report([{...f.row,revision:'0'.repeat(40)}]);
    expect(stale.observations[0].status).toBe('stale');expect(stale.summary.status).toBe('stale');
    expect(f.report([{...f.row,evidence:{...f.row.evidence,log:'evidence/missing.log'}}]).observations[0].status).toBe('missing');
    put(path.join(f.root,'evidence/slice.log'),'a different run\n');
    expect(f.report().observations[0].status).toBe('invalid');
    put(path.join(f.root,'check.mjs'),'process.exit(0);\n');
    expect(f.report().observations[0].status).toBe('stale');
    const failed=fixture(true);expect(failed.report().observations[0].status).toBe('failed');
    const receipt=JSON.parse(fs.readFileSync(path.join(failed.root,failed.row.evidence.receipt),'utf8'));receipt.status='passed';
    put(path.join(failed.root,failed.row.evidence.receipt),JSON.stringify(receipt));failed.row.evidence.sha256=sha(fs.readFileSync(path.join(failed.root,failed.row.evidence.receipt)));
    expect(failed.report().observations[0].status).toBe('invalid');
  });
  it('rejects command substitution, protected paths and malformed inventory through CLI status',()=>{
    const f=fixture();
    expect(f.report([{...f.row,evidence:{...f.row.evidence,script:'never-executed'}}]).observations[0].status).toBe('invalid');
    expect(f.report([{...f.row,behavior:'An unrelated invented behavior.'}]).observations[0].status).toBe('invalid');
    expect(f.report([{...f.row,evidence:{...f.row.evidence,log:'../outside.log'}}]).observations[0].status).toBe('invalid');
    f.report([{...f.row,revision:'0'.repeat(40)}]);
    const run=spawnSync(process.execPath,[path.join(import.meta.dirname,'observations.mjs'),f.file,'--component','sample','--commit',revision,'--source',source],{encoding:'utf8'});
    expect(run.status,run.stderr).toBe(2);expect(JSON.parse(run.stdout).summary.executedObservations).toBe(0);
    put(f.file,JSON.stringify({version:1,observations:[{...f.row,status:'verified'}]}));
    const invalid=spawnSync(process.execPath,[path.join(import.meta.dirname,'observations.mjs'),f.file,'--component','sample','--commit',revision,'--source',source],{encoding:'utf8'});
    expect(invalid.status).toBe(1);expect(invalid.stdout).toBe('');
  });
});
