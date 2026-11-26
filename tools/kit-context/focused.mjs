import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const guidanceSha=bytes=>sha(bytes.toString('utf8').replace(/\r\n/g,'\n'));
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const relative=(root,file)=>path.relative(root,file).split(path.sep).join('/');
const identifier=/^[A-Za-z_$][\w$]*$/;
const linesOf=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).split(/\r?\n/);
function confined(root,name) {
  if(typeof name!=='string'||!name||/[:\\\0]/.test(name)||path.isAbsolute(name)||name.split('/').some(p=>!p||p==='.'||p==='..'||['.git','node_modules'].includes(p.toLowerCase())||(process.platform==='win32'&&/[ .]$/.test(p)))) throw new Error('invalid guidance path: '+name);
  const file=fs.realpathSync(path.join(root,name));
  if(!inside(root,file)||!fs.statSync(file).isFile()) throw new Error('guidance path escapes component: '+name);
  return file;
}
function treeInputs(root) {
  const rows=[];
  const walk=(dir)=>{
    for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(['.git','node_modules'].includes(item.name)) continue;
      const file=path.join(dir,item.name);
      if(item.isDirectory()) walk(file);
      else if(item.isFile()) rows.push([relative(root,file),sha(fs.readFileSync(file))]);
      else if(item.isSymbolicLink()) {
        const target=confined(root,relative(root,file));
        rows.push([relative(root,file),relative(root,target),sha(fs.readFileSync(target))]);
      }
    }
  };
  walk(root);
  return rows;
}
function blocks(file,from,text) {
  const lines=text.split(/\r?\n/),out=[];
  let start=0;
  const add=end=>{
    if(lines.slice(start,end).some(line=>line.trim())) out.push({file,line:from+start,to:from+end-1,text:lines.slice(start,end).join('\n')});
    start=end+1;
  };
  let fence=false;
  for(let i=0;i<lines.length;i++) {
    if(/^\s*```/.test(lines[i])) fence=!fence;
    if(!fence&&/^(?:\d+\.|[-*]) /.test(lines[i])&&i>start) {add(i);start=i;}
    if(!fence&&!lines[i].trim()) add(i);
  }
  add(lines.length);
  return out;
}
function renderedGuidance(root,full,source,name,bytes,mapBytes,hash) {
  const changed=()=>new Error('guidance source changed: '+name);
  if(!name.endsWith('.md')||source===undefined||full.provenance?.status!=='verified')
    throw new Error('guidance source changed: '+name+'; installed Markdown requires --source verification');
  const lockBytes=fs.readFileSync(path.join(path.dirname(root),'kit.lock.json'));
  if(sha(lockBytes)!==full.provenance.lock.sha256) throw new Error('kit lock changed during guidance validation');
  const lock=JSON.parse(lockBytes.toString('utf8'));
  if(lock.support?.renderer!=='installed-markdown-v1') throw new Error('unsupported guidance rendering');
  // The source verifier already reconstructed this line-preserving renderer.
  // Recheck the bytes used here against that verified lock, including the map.
  for(const [file,data] of [['context.json',mapBytes],[name,bytes]]) {
    const digest=sha(data.includes(0)?data:data.toString('utf8').replace(/\r\n/g,'\n'));
    if(lock.components[full.component]?.files['kit/'+full.component+'/'+file]!==digest) throw changed();
  }
  const pinned=execFileSync('git',['-C',fs.realpathSync(source),'show',full.provenance.target.commit+':components/'+full.component+'/'+name],{maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
  if(guidanceSha(pinned)!==hash||linesOf(pinned).length!==linesOf(bytes).length) throw changed();
}
function guidance(root,full,source) {
  const file=path.join(root,'context.json');
  if(!fs.lstatSync(file,{throwIfNoEntry:false})) return null;
  const bytes=fs.readFileSync(confined(root,'context.json'));
  const map=JSON.parse(bytes.toString('utf8'));
  if(map.version!==1||!map.sources||typeof map.sources!=='object'||Array.isArray(map.sources)||!Array.isArray(map.apis)||!Object.hasOwn(map.sources,'README.md')) throw new Error('invalid context.json guidance');
  const sources=new Map(),renderedSources=[];
  for(const [name,hash] of Object.entries(map.sources)) {
    const data=fs.readFileSync(confined(root,name));
    if(!/^[a-f0-9]{64}$/.test(hash)) throw new Error('guidance source changed: '+name);
    if(guidanceSha(data)!==hash) {
      renderedGuidance(root,full,source,name,data,bytes,hash);
      renderedSources.push(name);
    }
    sources.set(name,linesOf(data));
  }
  const matches=map.apis.filter(api=>api.entry===full.entry&&api.symbol===full.symbol);
  if(matches.length>1) throw new Error('duplicate guidance for '+full.symbol);
  if(!matches.length) return null;
  const api=matches[0];
  const selected={rules:[],usage:[]};
  for(const field of ['rules','usage']) {
    if(!Array.isArray(api[field])||(field==='rules'&&!api[field].length)) throw new Error('guidance must declare '+field);
    for(const row of api[field]) {
      confined(root,row.file);
      const lines=sources.get(row.file);
      if(!lines||!Number.isSafeInteger(row.from)||!Number.isSafeInteger(row.to)||row.from<1||row.to<row.from||row.to>lines.length) throw new Error('invalid guidance range: '+row.file);
      selected[field].push(...blocks(row.file,row.from,lines.slice(row.from-1,row.to).join('\n')));
    }
  }
  if(!Array.isArray(api.dependencies)) throw new Error('guidance dependencies must be an array');
  const dependencies=api.dependencies.map(dep=>{
    if(!/^[a-z][a-z0-9-]*$/.test(dep.component??'')||!full.needs.includes(dep.component)||typeof dep.entry!=='string'||!/\.(?:ts|tsx|mts|js|mjs)$/.test(dep.entry)||/\.test\./.test(dep.entry)||!identifier.test(dep.symbol??'')) throw new Error('guidance continuation must name a declared dependency and symbol');
    const base=fs.realpathSync(path.dirname(root)),dir=fs.realpathSync(path.join(base,dep.component));
    if(!inside(base,dir)||dir===base) throw new Error('dependency escapes root');
    confined(dir,dep.entry);
    return {component:dep.component,entry:dep.entry,symbol:dep.symbol,focused:true};
  });
  return {...selected,dependencies,sha256:sha(bytes),...(renderedSources.length?{renderedSources}:{})};
}

export function focusedPacket(options,readPacket) {
  const {root,component,symbol,entry='index.ts',maxChars=6000,cursor,source}=options;
  if(typeof symbol!=='string'||!identifier.test(symbol)) throw new Error('focused context requires one public symbol');
  if(!Number.isSafeInteger(maxChars)||maxChars<500||maxChars>100000) throw new Error('maxChars must be 500..100000');
  const full=readPacket({...options,focused:false,cursor:undefined,provenance:true,maxChars:100000});
  const base=fs.realpathSync(root),dir=fs.realpathSync(path.join(base,component));
  const selected=guidance(dir,full,source);
  const mandatory=selected??{
    rules:full.rules.flatMap(row=>blocks(row.file,row.line,row.text)),
    usage:full.usage.flatMap(row=>blocks(row.file,row.line,row.text)),dependencies:[],
  };
  const inputFingerprint=sha(JSON.stringify({root:base,component,entry,symbol,tool:full.tool,provenance:full.provenance,maturity:full.maturity,files:treeInputs(dir)}));
  let offset=0;
  if(cursor!==undefined) {
    const match=/^([a-f0-9]{64}):(\d+)$/.exec(cursor);
    if(!match||!Number.isSafeInteger(Number(match[2]))) throw new Error('invalid context cursor');
    if(match[1]!==inputFingerprint) throw new Error('context inputs changed; restart at the first page');
    offset=Number(match[2]);
  }
  const items=[...mandatory.rules.map(row=>['rules',row]),...full.contracts.map(row=>['contracts',row]),...mandatory.usage.map(row=>['usage',row])];
  if(offset<0||offset>=items.length&&offset!==0) throw new Error('invalid context cursor offset');
  const requiredReads=selected?full.requiredReads.filter(file=>!file.endsWith('.md')):full.requiredReads;
  const packet={
    schemaVersion:2,mode:'focused',scope:'api-contract',taskReadiness:'not-assessed',
    tool:full.tool,provenance:full.provenance,...(full.maturity?{maturity:full.maturity}:{}),component,entry,symbol,
    status:'incomplete',inputFingerprint,guidance:{status:selected?'authored':'unmapped',...(selected?{file:'context.json',sha256:selected.sha256,...(selected.renderedSources?{renderedSources:selected.renderedSources}:{})}:{})},
    continuation:{root:base,...(source!==undefined?{source:path.resolve(source)}:{}),...(options.observations!==undefined?{observations:path.resolve(options.observations),productionConsumers:options.productionConsumers}:{}),component,entry,symbol,focused:true,maxChars},
    page:{offset,next:null,remaining:items.length-offset},
    rules:[],contracts:[],usage:[],requiredReads,dependencies:mandatory.dependencies,deferredReads:[],
  };
  const size=()=>JSON.stringify(packet).length;
  let next=offset;
  const update=()=>{packet.page.next=next<items.length?inputFingerprint+':'+next:null;packet.page.remaining=items.length-next;};
  update();
  if(size()>maxChars) throw new Error('budget too small for focused metadata and actionable continuations');
  for(;next<items.length;) {
    const [field,row]=items[next];
    packet[field].push(row);next++;update();
    if(size()<=maxChars) continue;
    packet[field].pop();next--;update();
    if(next>offset) break;
    packet.deferredReads.push({file:row.file,line:row.line,...(row.to?{to:row.to}:{}),reason:'item-exceeds-budget'});
    next++;update();
    if(size()>maxChars) throw new Error('budget too small for a required read; increase metadata budget');
    break;
  }
  if(offset===0&&!packet.page.next&&!requiredReads.length&&!mandatory.dependencies.length&&!packet.deferredReads.length) packet.status='complete';
  return packet;
}
