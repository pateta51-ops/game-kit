import { expect, it } from 'vitest';
import { codexCliUsage } from './codex-cli.mjs';

const started='2026-01-01T10:00:00.000Z', finished='2026-01-01T10:00:03.000Z';
const usage=(input_tokens,cached_input_tokens,output_tokens)=>({input_tokens,cached_input_tokens,output_tokens});
const rows=items=>Buffer.from(items.map(item=>JSON.stringify(item)).join('\n')+'\n');
function fixture() {
  const totals=usage(25,7,5);
  const events=[{type:'thread.started',thread_id:'thread-one'},{type:'turn.started'},{type:'turn.completed',usage:totals}];
  const meta=(type,payload,timestamp=started)=>({timestamp,type,payload});
  const rollout=[
    meta('session_meta',{id:'thread-one',cli_version:'0.166.0',model_provider:'openai'}),
    meta('event_msg',{type:'task_started',turn_id:'turn-one',root_turn_id:'turn-one'}),
    meta('turn_context',{turn_id:'turn-one',root_turn_id:'turn-one',model:'test-model',effort:'medium'}),
    meta('token_usage_record',{thread_id:'thread-one',session_id:'thread-one',turn_id:'turn-one',root_turn_id:'turn-one',response_id:'one',usage:usage(10,0,3),turn_token_usage:usage(10,0,3)},'2026-01-01T10:00:01.000Z'),
    meta('response_item',{type:'function_call',call_id:'one-tool'}),
    meta('token_usage_record',{thread_id:'thread-one',session_id:'thread-one',turn_id:'turn-one',root_turn_id:'turn-one',response_id:'two',usage:usage(15,7,2),turn_token_usage:totals},'2026-01-01T10:00:02.000Z'),
    meta('event_msg',{type:'task_complete',turn_id:'turn-one',root_turn_id:'turn-one'},finished),
  ];
  return {events,rollout,read:()=>codexCliUsage(rows(events),rows(rollout))};
}
it('reconciles one observed CLI turn with its provider response records without counting cached input twice',()=>{
  const x=fixture().read();
  expect(x).toMatchObject({cliVersion:'0.166.0',model:'test-model',reasoning:'medium',at:finished,usage:{inputTokens:25,cachedInputTokens:7,outputTokens:5},inputIncludesCached:true,modelInvocations:2,toolCalls:1});
  expect(x.usage).not.toHaveProperty('costUsd');
});
it('leaves unrecorded fields missing and preserves observed totals',()=>{
  const f=fixture();
  delete f.events[2].usage.cached_input_tokens;
  expect(f.read().usage).toEqual({inputTokens:25,outputTokens:5});
});
it('rejects conflicting totals, repeated responses, mismatched threads, failed turns and truncated records',()=>{
  let f=fixture();
  f.events[2].usage.input_tokens=30;
  expect(f.read).toThrow(/reconcil/);
  f=fixture();
  f.rollout[5].payload.response_id='one';
  expect(f.read).toThrow(/duplicate/);
  f=fixture();
  f.rollout[3].payload.thread_id='other-thread';
  expect(f.read).toThrow(/different thread/);
  f=fixture();
  f.events[2].type='turn.failed';
  expect(f.read).toThrow(/completed/);
  f=fixture();
  expect(()=>codexCliUsage(rows(f.events).subarray(0,-2),rows(f.rollout))).toThrow(/truncated/);
});
it('fails closed on detached usage and counts tools only inside the actual turn',()=>{
  let f=fixture();
  f.rollout[3].payload.root_turn_id='unrelated-turn';
  expect(f.read).toThrow(/different thread/);
  f=fixture();
  f.rollout[3].payload.session_id='unrelated-session';
  expect(f.read).toThrow(/different thread/);
  f=fixture();
  f.rollout.splice(3,0,f.rollout.pop());
  expect(f.read).toThrow(/bounds|out of order|outside/);
  f=fixture();
  f.rollout[6].timestamp='2026-01-32T10:00:03.000Z';
  expect(f.read).toThrow(/bounds/);
  f=fixture();
  f.rollout.push({type:'response_item',timestamp:'2099-01-01T10:00:00.000Z',payload:{type:'function_call',call_id:'off-turn'}});
  expect(f.read().toolCalls).toBe(1);
});
