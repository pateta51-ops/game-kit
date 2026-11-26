import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const fields={input_tokens:'inputTokens',cached_input_tokens:'cachedInputTokens',output_tokens:'outputTokens'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=value=>typeof value==='string'&&value.length>0;
function occurred(value){
  const match=typeof value==='string'&&/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,3}))?Z$/.exec(value);
  const at=Date.parse(value);
  return !!match&&Number.isFinite(at)&&new Date(at).toISOString()===match[1]+'.'+(match[2]??'').padEnd(3,'0')+'Z';
}

function readRows(bytes,label){
  const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!content.endsWith('\n')) throw new Error(label+' JSONL is truncated');
  try{return content.trimEnd().split('\n').map(line=>JSON.parse(line));}
  catch{throw new Error(label+' JSONL contains malformed records');}
}
function only(rows,predicate,label){
  const matches=rows.filter(predicate);
  if(matches.length!==1) throw new Error('Expected one '+label);
  return matches[0];
}
function counts(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('Missing usage record');
  const values={};
  for(const key of Object.keys(fields)) {
    if(!Object.hasOwn(raw,key)) continue;
    const n=raw[key];
    if(!Number.isSafeInteger(n)||n<0) throw new Error('Invalid usage count: '+key);
    values[key]=n;
  }
  if('cached_input_tokens' in values&&(!('input_tokens' in values)||values.cached_input_tokens>values.input_tokens))
    throw new Error('Cached input exceeds or lacks total input');
  return values;
}

/** Decode the tested fresh single-turn Codex CLI 0.166.0 export. Original records stay with the operator. */
export function codexCliUsage(eventsBytes,rolloutBytes){
  const events=readRows(eventsBytes,'CLI'),rollout=readRows(rolloutBytes,'Rollout');
  const thread=only(events,row=>row.type==='thread.started','CLI thread start');
  const startEvent=only(events,row=>row.type==='turn.started','CLI turn start');
  const endEvent=only(events,row=>row.type==='turn.completed','completed CLI turn');
  if(!(events.indexOf(thread)<events.indexOf(startEvent)&&events.indexOf(startEvent)<events.indexOf(endEvent))||events.some(row=>row.type==='turn.failed'))
    throw new Error('CLI turn did not complete in order');
  const sessionRow=only(rollout,row=>row.type==='session_meta','rollout session');
  const contextRow=only(rollout,row=>row.type==='turn_context','rollout turn context');
  const {payload:session}=sessionRow,{payload:context}=contextRow;
  if(!text(thread.thread_id)||session?.id!==thread.thread_id) throw new Error('CLI and rollout refer to a different thread');
  if(session.cli_version!=='0.166.0'||session.model_provider!=='openai') throw new Error('Unsupported CLI export or provider');
  if(!text(context?.turn_id)||context.root_turn_id!==context.turn_id||!text(context.model)||!text(context.effort)) throw new Error('Missing fresh root turn or model configuration');
  const begin=only(rollout,row=>row.type==='event_msg'&&row.payload?.type==='task_started','rollout task start');
  const end=only(rollout,row=>row.type==='event_msg'&&row.payload?.type==='task_complete','completed rollout task');
  const first=rollout.indexOf(begin),last=rollout.indexOf(end),model=rollout.indexOf(contextRow);
  if(rollout.indexOf(sessionRow)>first||first>=last||model<=first||model>=last||
    [begin,end].some(row=>row.payload.turn_id!==context.turn_id||row.payload.root_turn_id!==context.turn_id||!occurred(row.timestamp))||
    !occurred(contextRow.timestamp)||Date.parse(contextRow.timestamp)<Date.parse(begin.timestamp)||Date.parse(contextRow.timestamp)>Date.parse(end.timestamp))
    throw new Error('Rollout turn bounds are invalid');
  const responses=new Set(),sums={},missing=new Set();
  let previous=Date.parse(begin.timestamp);
  for(const [i,row] of rollout.entries()){
    if(row.type!=='token_usage_record') continue;
    const record=row.payload;
    if(record?.thread_id!==thread.thread_id||record.session_id!==session.id||record.turn_id!==context.turn_id||record.root_turn_id!==context.turn_id)
      throw new Error('Usage references a different thread, session or turn');
    if(!text(record.response_id)||responses.has(record.response_id)) throw new Error('Missing or duplicate provider response identity');
    responses.add(record.response_id);
    const at=Date.parse(row.timestamp);
    if(i<=model||i>=last||!occurred(row.timestamp)||at<previous||at>Date.parse(end.timestamp)) throw new Error('Usage records are out of order or outside the turn');
    previous=at;
    const values=counts(record.usage), cumulative=counts(record.turn_token_usage);
    for(const key of Object.keys(fields)) {
      if(!Object.hasOwn(values,key)||!Object.hasOwn(cumulative,key)) missing.add(key);
      if(missing.has(key)) continue;
      sums[key]=(sums[key]??0)+values[key];
      if(!Number.isSafeInteger(sums[key])||cumulative[key]!==sums[key]) throw new Error('Provider totals do not reconcile within the rollout');
    }
  }
  if(!responses.size) throw new Error('Rollout has no provider response usage records');
  const total=counts(endEvent.usage),usage={};
  for(const [key,metric] of Object.entries(fields)){
    if(missing.has(key)||!Object.hasOwn(total,key)) continue;
    if(sums[key]!==total[key]) throw new Error('CLI usage does not reconcile with provider responses');
    usage[metric]=sums[key];
  }
  if(!Object.hasOwn(usage,'inputTokens')) delete usage.cachedInputTokens;
  const calls=rollout.slice(first+1,last).filter(row=>row.type==='response_item'&&['function_call','custom_tool_call'].includes(row.payload?.type));
  const toolIds=new Set(calls.map(row=>row.payload.call_id));
  const validCalls=toolIds.size===calls.length&&calls.every(row=>text(row.payload.call_id)&&occurred(row.timestamp)&&
    Date.parse(row.timestamp)>=Date.parse(begin.timestamp)&&Date.parse(row.timestamp)<=Date.parse(end.timestamp));
  return {version:1,sourceFormat:'codex-cli-0.166.0-single-turn',cliVersion:session.cli_version,model:context.model,reasoning:context.effort,
    at:new Date(end.timestamp).toISOString(),evidence:{eventsSha256:digest(eventsBytes),rolloutSha256:digest(rolloutBytes)},usage,
    ...(Object.hasOwn(usage,'inputTokens')?{inputIncludesCached:true}:{}),modelInvocations:responses.size,
    toolCalls:validCalls?toolIds.size:null,missing:[...Object.values(fields),'costUsd'].filter(key=>!Object.hasOwn(usage,key))};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{
    const [events,rollout,...extra]=process.argv.slice(2);
    if(!events||!rollout||extra.length) throw new Error('Usage: node tools/reuse-metrics/codex-cli.mjs <exec.jsonl> <rollout.jsonl>');
    const input=file=>{ try{return readFileSync(file);}catch{throw new Error('Could not read local CLI evidence');} };
    console.log(JSON.stringify(codexCliUsage(input(events),input(rollout))));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
