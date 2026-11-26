#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { contextPacket } from './context.mjs';
import { contextTool } from './provenance.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=(value,label)=>{
  if(typeof value!=='string'||!value.trim()) throw new Error(label+' must be a nonempty string');
  return value;
};
const object=(value,keys,label)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error(label+' must be an object');
  for(const key of Object.keys(value)) if(!keys.includes(key)) throw new Error(label+' has an unknown field: '+key);
};
const list=(value,label,min=0,max=100)=>{
  if(!Array.isArray(value)||value.length<min||value.length>max) throw new Error(label+' must have '+min+'..'+max+' items');
};
const inside=(root,file)=>{
  const rel=path.relative(root,file);
  return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);
};
const internal=part=>['.git','node_modules'].includes(part.toLowerCase());
function gameFile(root,file) {
  text(file,'file');
  if(path.isAbsolute(file)||/[:\\\0]/.test(file)||file.split('/').some(p=>!p||p==='.'||p==='..'||internal(p)||(process.platform==='win32'&&/[ .]$/.test(p)))) throw new Error('invalid game-relative path: '+file);
  const target=path.resolve(root,file);
  let parent=target;
  while(!fs.lstatSync(parent,{throwIfNoEntry:false})) parent=path.dirname(parent);
  const canonical=path.resolve(fs.realpathSync(parent),path.relative(parent,target));
  if(!inside(root,canonical)||path.relative(root,canonical).split(path.sep).some(internal)) throw new Error(file+' escapes game');
  return canonical;
}
function readReference(root,ref) {
  object(ref,['file','from','to'],'read');
  const file=gameFile(root,ref.file);
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile()) throw new Error('read file is missing: '+ref.file);
  const bytes=fs.readFileSync(file);
  const range=ref.from!==undefined||ref.to!==undefined;
  if(range&&(!Number.isSafeInteger(ref.from)||!Number.isSafeInteger(ref.to)||ref.from<1||ref.to<ref.from||ref.to>bytes.toString('utf8').split(/\r?\n/).length)) throw new Error('invalid line range: '+ref.file);
  if(!range&&[ref.file,file].some(name=>/^(?:PLAN|CATALOG|SELECTION)\.md$/i.test(path.basename(name)))) throw new Error(ref.file+' requires a line range');
  return {...ref,sha256:sha(bytes)};
}

export function workerBrief({game,source,task,maxChars=24000}) {
  text(game,'game');text(source,'source');
  if(!Number.isSafeInteger(maxChars)||maxChars<2000||maxChars>100000) throw new Error('maxChars must be 2000..100000');
  object(task,['version','id','repo','branch','kitCommit','goal','reads','recipe','files','apis','acceptance','outOfScope','escalation','questions','completion'],'task');
  if(task.version!==1) throw new Error('task version must be 1');
  for(const key of ['id','repo','branch','kitCommit','goal','recipe','completion']) text(task[key],key);
  if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(task.kitCommit)) throw new Error('kitCommit must be an exact commit');
  list(task.reads,'reads');list(task.files,'files',1);list(task.apis,'apis',1,4);
  list(task.acceptance,'acceptance',1);list(task.outOfScope,'outOfScope',1);list(task.questions,'questions');
  for(const item of task.outOfScope) text(item,'outOfScope item');
  object(task.escalation,['owner','stop'],'escalation');
  text(task.escalation.owner,'escalation.owner');text(task.escalation.stop,'escalation.stop');
  for(const q of task.questions) {object(q,['question','owner'],'question');text(q.question,'question');text(q.owner,'question owner');}
  const root=fs.realpathSync(game);
  const ownedFiles=[];
  for(const item of task.files) {
    object(item,['file','action'],'owned file');
    const file=gameFile(root,item.file);
    if([item.file.split('/')[0],path.relative(root,file).split(path.sep)[0]].some(part=>part.toLowerCase()==='kit')) throw new Error('owned files must be outside kit: '+item.file);
    if(!['create','edit'].includes(item.action)) throw new Error('owned file action must be create or edit');
    const stat=fs.statSync(file,{throwIfNoEntry:false});
    if(item.action==='edit'&&!stat?.isFile()) throw new Error('edit file is missing: '+item.file);
    if(item.action==='edit'&&stat.nlink>1) throw new Error('edit file has multiple hardlinks: '+item.file);
    if(item.action==='create'&&stat) throw new Error('create file already exists: '+item.file);
    ownedFiles.push({file:item.file,status:stat?'existing':'missing',sha256:stat?sha(fs.readFileSync(file)):null});
  }
  const reads=[{file:'AGENTS.md'},...task.reads,{file:task.recipe}].map(ref=>readReference(root,ref));
  const packageBytes=fs.readFileSync(gameFile(root,'package.json'));
  const pkg=JSON.parse(packageBytes.toString('utf8'));
  const acceptance=task.acceptance.map(item=>{
    object(item,['script','proves'],'acceptance');text(item.script,'acceptance.script');text(item.proves,'acceptance.proves');
    if(!/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/.test(item.script)||!Object.hasOwn(pkg.scripts??{},item.script)||typeof pkg.scripts[item.script]!=='string'||!pkg.scripts[item.script].trim()) throw new Error('missing npm script: '+item.script);
    return {command:'npm run '+item.script,proves:item.proves,executed:false};
  });
  for(const api of task.apis) {
    object(api,['component','entry','symbol','mustUse','maxChars'],'api');text(api.component,'api.component');text(api.symbol,'api.symbol');
    if(api.mustUse!==undefined&&typeof api.mustUse!=='boolean') throw new Error('api.mustUse must be a boolean');
  }
  const packets=task.apis.map(api=>contextPacket({root:path.join(root,'kit'),source,component:api.component,symbol:api.symbol,entry:api.entry,maxChars:api.maxChars}));
  const provenance=packets[0].provenance;
  if(provenance.target.commit!==task.kitCommit) throw new Error('task kitCommit does not match the verified game pin');
  if(packets.some(p=>p.provenance.lock.sha256!==provenance.lock.sha256)) throw new Error('game lock changed while preparing the brief; retry');
  const inputs={task:{sha256:sha(JSON.stringify(task))},package:{file:'package.json',sha256:sha(packageBytes)},ownedFiles};
  const brief={
    schemaVersion:1,tool:{...contextTool(),mode:'brief'},scope:'worker-brief',status:'incomplete',taskReadiness:'not-assessed',
    game:root,kit:{status:provenance.status,method:provenance.method,scope:provenance.scope,target:provenance.target,lock:provenance.lock,...(provenance.warnings?{warnings:provenance.warnings}:{})},
    task:Object.fromEntries(['id','repo','branch','kitCommit','goal','files','outOfScope','escalation','questions','completion'].map(key=>[key,task[key]])),
    inputs,inputFingerprint:sha(JSON.stringify({inputs,reads,kitLock:provenance.lock.sha256})),
    reads,recipe:task.recipe,acceptance,validationEvidence:[],
    mustUse:task.apis.filter(api=>api.mustUse).map(api=>api.component+':'+api.symbol),
    apis:packets.map(p=>({component:p.component,entry:p.entry,symbol:p.symbol,content:p.provenance.content})),
    requiredReads:packets.map(p=>({component:p.component,entry:p.entry,symbol:p.symbol,reason:'packet-budget',files:[p.entry,'README.md']})),
    omitted:packets.length,
  };
  const size=()=>JSON.stringify(brief).length;
  if(size()>maxChars) throw new Error('brief budget too small for task decisions, references and continuations');
  for(let index=0;index<packets.length;index++) {
    const packet=packets[index],before=brief.requiredReads;
    brief.apis[index].context=packet;
    brief.requiredReads=before.filter(read=>read!==before.find(r=>r.component===packet.component&&r.entry===packet.entry&&r.symbol===packet.symbol));
    if(packet.status!=='complete') brief.requiredReads.push({component:packet.component,entry:packet.entry,symbol:packet.symbol,reason:'api-contract-incomplete',files:packet.requiredReads});
    brief.omitted--;
    if(size()>maxChars) {delete brief.apis[index].context;brief.requiredReads=before;brief.omitted++;}
  }
  if(provenance.status==='verified'&&!brief.requiredReads.length&&!task.questions.length) brief.status='complete';
  return brief;
}

export function main(args) {
  const [file,...flags]=args;
  if(!file) throw new Error('usage: node tools/kit-context/brief.mjs <task.json> --game <game> --source <checkout> [--max-chars 24000]');
  const options={task:JSON.parse(fs.readFileSync(file,'utf8'))};
  for(let i=0;i<flags.length;i+=2) {
    const key=flags[i],value=flags[i+1];
    if(!value||value.startsWith('--')||!['--game','--source','--max-chars'].includes(key)) throw new Error('invalid brief flag: '+key);
    const prop=key==='--max-chars'?'maxChars':key.slice(2);
    if(Object.hasOwn(options,prop)) throw new Error('duplicate flag: '+key);
    options[prop]=key==='--max-chars'?Number(value):value;
  }
  const brief=workerBrief(options);
  console.log(JSON.stringify(brief));
  return brief.status==='complete'?0:2;
}
if(import.meta.main) {
  try {process.exitCode=main(process.argv.slice(2));} catch(e) {console.error(e.message);process.exitCode=1;}
}
