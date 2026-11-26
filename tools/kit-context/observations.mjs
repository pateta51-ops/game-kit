#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { contextTool, sourceProvenance } from './provenance.mjs';
import { referencedParts } from '../reuse-metrics/report.mjs';

const checkout=path.resolve(import.meta.dirname,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const revision=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const label=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const limits=['Local receipts are not signed execution attestations.','Recorded commands do not prove independent rule coverage.','Production classification requires a separately authorized consumer ID.','Consumer IDs are caller supplied; repeated IDs or identical source revisions are grouped.'];
function object(value,keys,name) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(name+' must be an object');
  for(const key of Object.keys(value)) if(!keys.includes(key)) throw new Error('unknown '+name+' field: '+key);
}
function text(value,name) {if(typeof value!=='string'||!value.trim()||value.length>2000) throw new Error(name+' must be nonempty text of at most 2000 characters');}
function bytes(file,max=16*1024*1024) {
  if(!fs.statSync(file).isFile()||fs.statSync(file).size>max) throw new Error('evidence must be a regular file no larger than '+max+' bytes');
  return fs.readFileSync(file);
}
function consumerFile(root,file) {
  if(typeof file!=='string'||!file||/[:\\\0]/.test(file)||path.isAbsolute(file)||file.split('/').some(p=>!p||p==='.'||p==='..'||['.git','node_modules'].includes(p.toLowerCase())||(process.platform==='win32'&&/[ .]$/.test(p)))) throw new Error('evidence path must stay inside the consumer');
  const target=fs.realpathSync(path.join(root,file)),rel=path.relative(root,target);
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)) throw new Error('evidence path escapes the consumer');
  return target;
}
function inspect(row,{base,component,commit,source,productionConsumers}) {
  object(row,['id','component','revision','kind','consumer','behavior','evidence','limitations'],'observation');
  if(!label.test(row.id??'')||!/^[a-z][a-z0-9-]*$/.test(row.component??'')||!revision.test(row.revision??'')) throw new Error('invalid observation identity');
  object(row.consumer,['id','root','kind'],'consumer');
  if(!label.test(row.consumer.id??'')||!['test','reference','production'].includes(row.consumer.kind)) throw new Error('invalid consumer identity');
  text(row.consumer.root,'consumer.root');text(row.behavior,'behavior');
  if(!Array.isArray(row.limitations)||!row.limitations.length||row.limitations.length>20) throw new Error('observation needs explicit limitations');
  row.limitations.forEach(value=>text(value,'limitation'));
  if(!['execution','test-file','static-reference'].includes(row.kind)) throw new Error('invalid observation kind');
  const result={id:row.id,component:row.component,revision:row.revision,consumer:{id:row.consumer.id,kind:row.consumer.kind},kind:row.kind,behavior:row.behavior,status:'unknown',limitations:row.limitations};
  if(row.component!==component) return {...result,status:'other-component'};
  if(row.revision!==commit) return {...result,status:'stale',reason:'observation revision differs from requested pin'};
  try {
    const root=fs.realpathSync(path.resolve(base,row.consumer.root));
    const provenance=sourceProvenance({root:path.join(root,'kit'),component,source});
    if(provenance.target?.commit!==commit) return {...result,status:'stale',reason:'consumer kit pin differs from requested pin'};
    if(provenance.status!=='verified') return {...result,status:'unknown',reason:'consumer source verification is partial'};
    if(row.kind!=='execution') {
      object(row.evidence,['file','sha256'],'static evidence');
      const file=consumerFile(root,row.evidence.file),data=bytes(file);
      if(sha(data)!==row.evidence.sha256) return {...result,status:'stale',reason:'static evidence bytes differ'};
      if(row.kind==='test-file'&&!/\.(?:test|spec)\.[mc]?[jt]sx?$/.test(row.evidence.file)) throw new Error('test-file evidence must name a test source');
      if(row.kind==='static-reference'&&!referencedParts(file,data.toString('utf8'),path.join(root,'kit')).includes(component)) throw new Error('file has no literal relative component reference');
      return {...result,status:row.kind==='test-file'?'test-file-present':'static-reference-present',evidence:{file:row.evidence.file,sha256:sha(data)},executed:false};
    }
    object(row.evidence,['receipt','sha256','script','log','behaviorId'],'execution evidence');
    if(!/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(row.evidence.script??'')) throw new Error('invalid observation script');
    if(!label.test(row.evidence.behaviorId??'')) throw new Error('invalid observed behavior identity');
    const receipt=consumerFile(root,row.evidence.receipt),data=bytes(receipt);
    if(sha(data)!==row.evidence.sha256) return {...result,status:'stale',reason:'receipt bytes differ from observation'};
    const verified=spawnSync(process.execPath,[path.join(checkout,'components/check-runner/receipt.ts'),'--verify',receipt],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
    if(verified.error) throw new Error('receipt verifier could not execute');
    let checked;
    try { checked=JSON.parse(verified.stdout); } catch { throw new Error('receipt verifier did not return evidence'); }
    if(verified.status!==0||checked.status!=='passed') return {...result,status:['stale','missing','invalid','not-run','failed','stopped','truncated'].includes(checked.status)?checked.status:'invalid',reason:'receipt verification did not pass'};
    if(!fs.readFileSync(receipt).equals(data)) throw new Error('receipt changed during verification');
    const evidence=JSON.parse(data.toString('utf8'));
    if(evidence.binding.kit.commit!==commit||evidence.binding.kit.sha256!==provenance.lock.sha256) return {...result,status:'stale',reason:'receipt and verified component pin differ'};
    const command=evidence.commands.find(command=>command.script===row.evidence.script);
    if(!command) throw new Error('declared command was not executed by the receipt');
    const acceptanceBytes=bytes(consumerFile(root,evidence.definition.acceptance));
    if(sha(acceptanceBytes)!==evidence.binding.acceptance.sha256) throw new Error('acceptance changed during verification');
    const acceptance=JSON.parse(acceptanceBytes.toString('utf8'));
    const declarations=Array.isArray(acceptance.componentObservations)?acceptance.componentObservations.filter(item=>item.id===row.evidence.behaviorId):[];
    if(declarations.length!==1||declarations[0].component!==component||declarations[0].script!==row.evidence.script||declarations[0].behavior!==row.behavior||declarations[0].consumerKind!==row.consumer.kind) throw new Error('component behavior is not declared by the bound acceptance');
    const log=bytes(consumerFile(root,row.evidence.log));
    if(log.length!==command.output.bytes||sha(log)!==command.output.sha256) throw new Error('retained command log differs from receipt');
    return {...result,status:'verified-execution',command:{script:command.script,commandSha256:sha(command.command),code:command.code,result:command.status},
      source:evidence.binding.source,kit:{commit,lockSha256:provenance.lock.sha256},
      evidence:{receipt:row.evidence.receipt,sha256:sha(data),log:row.evidence.log,logSha256:sha(log),behaviorId:row.evidence.behaviorId},coverage:'declared-by-bound-acceptance',independentRuleReview:'not-assessed',
      adoption:row.consumer.kind==='reference'?'reference':row.consumer.kind==='production'?(productionConsumers.includes(row.consumer.id)?'authorized-production':'unconfirmed-production'):'executed-test'};
  } catch(error) {
    return {...result,status:error?.code==='ENOENT'?'missing':'invalid',reason:error.message};
  }
}

export function observationEvidence({file,component,commit,source,productionConsumers=[]}) {
  if(!/^[a-z][a-z0-9-]*$/.test(component??'')||!revision.test(commit??'')) throw new Error('observations require a component and exact requested revision');
  if(typeof source!=='string'||!source.trim()) throw new Error('observations require a trusted source checkout');
  if(!Array.isArray(productionConsumers)||productionConsumers.some(id=>!label.test(id))) throw new Error('invalid authorized production consumer IDs');
  const location=fs.realpathSync(file),data=bytes(location,1024*1024),input=JSON.parse(data.toString('utf8'));
  object(input,['version','observations'],'observation inventory');
  if(input.version!==1||!Array.isArray(input.observations)||input.observations.length>100) throw new Error('invalid observation inventory');
  const ids=new Set();
  for(const row of input.observations) {if(ids.has(row.id)) throw new Error('duplicate observation identity: '+row.id);ids.add(row.id);}
  const rows=input.observations.map(row=>inspect(row,{base:path.dirname(location),component,commit,source,productionConsumers}));
  const verified=rows.filter(row=>row.status==='verified-execution');
  const groups=[];
  for(const row of verified) {
    const sourceKey=row.source.commit+':'+row.source.tree;
    const matched=groups.filter(group=>group.ids.has(row.consumer.id)||group.sources.has(sourceKey));
    const group={ids:new Set([row.consumer.id]),sources:new Set([sourceKey]),rows:[row]};
    for(const prior of matched) {for(const id of prior.ids) group.ids.add(id);for(const source of prior.sources) group.sources.add(source);group.rows.push(...prior.rows);groups.splice(groups.indexOf(prior),1);}
    groups.push(group);
  }
  const count=adoption=>groups.filter(group=>group.rows.some(row=>row.adoption===adoption)).length;
  const relevant=rows.filter(row=>row.status!=='other-component');
  const matching=relevant.filter(row=>['verified-execution','test-file-present','static-reference-present'].includes(row.status));
  const states=[...new Set(relevant.map(row=>row.status))];
  const status=!relevant.length?'unknown':matching.length===relevant.length?'matching':matching.length?'partial':states.length===1?states[0]:'unknown';
  const summary={status,component,revision:commit,
    input:{file:path.resolve(file),sha256:sha(data)},
    testFiles:rows.filter(row=>row.status==='test-file-present').length,staticReferences:rows.filter(row=>row.status==='static-reference-present').length,
    executedObservations:verified.length,executedTestConsumers:count('executed-test'),referenceConsumers:count('reference'),authorizedProductionConsumers:count('authorized-production'),unconfirmedProductionConsumers:count('unconfirmed-production'),
    statuses:Object.fromEntries([...new Set(rows.map(row=>row.status))].map(status=>[status,rows.filter(row=>row.status===status).length])),
    limitations:limits,report:{component,commit,source:path.resolve(source),file:path.resolve(file),productionConsumers}};
  return {schemaVersion:1,tool:contextTool(),scope:'component-observations',summary,observations:rows};
}

export function main(args) {
  const [file,...flags]=args,options={file};
  for(let i=0;i<flags.length;i+=2) {
    const key=flags[i],value=flags[i+1];
    if(!['--component','--commit','--source','--production-consumers'].includes(key)||!value||value.startsWith('--')) throw new Error('invalid observation flag: '+key);
    const prop=key==='--production-consumers'?'productionConsumers':key.slice(2);
    if(Object.hasOwn(options,prop)) throw new Error('duplicate observation flag: '+key);
    options[prop]=prop==='productionConsumers'?value.split(','):value;
  }
  const result=observationEvidence(options);console.log(JSON.stringify(result));
  return result.observations.some(row=>!['other-component','verified-execution','test-file-present','static-reference-present'].includes(row.status))?2:0;
}
if(import.meta.main) {
  try {process.exitCode=main(process.argv.slice(2));} catch(error) {console.error(error.message);process.exitCode=1;}
}
