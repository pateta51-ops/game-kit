import { afterAll,describe,expect,it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureGame,summarize } from './report.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kit-metrics-'));
afterAll(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const kitRevision='1'.repeat(40);
const sourceRevision='2'.repeat(40);
const window={start:'2026-01-01T00:00:00.000Z',end:'2026-01-02T00:00:00.000Z',protocol:'synthetic-playable-task'};
const measured=value=>({kind:'measured',value,provenance:'synthetic-usage-record'});
const build=(metrics={},overrides={})=>({kitRevision,sourceRevision,window,metrics,...overrides});
const cli=fileURLToPath(new URL('./report.mjs',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
const rejected=(result,message)=>{
  expect(result.status,result.stderr).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(message);
};
const identified=(projectId,observationId,overrides={})=>build({
  inputTokens:measured(100),costUsd:measured(2),
},{identity:{projectId,observationId},runtimeAdoption:{'engine-core':'synthetic-runtime-trace'},...overrides});
const measurementFile=(root,input)=>fs.writeFileSync(path.join(root,'kit-reuse-metrics.json'),JSON.stringify(input));
function fixture(name) {
  const root=path.join(tmp,name);
  for(const d of ['kit','src','tests'])fs.mkdirSync(path.join(root,d),{recursive:true});
  fs.writeFileSync(path.join(root,'kit/kit.lock.json'),JSON.stringify({ref:'v1',commit:kitRevision,components:{'engine-core':{},'card-harness':{},'screens':{}}}));
  fs.writeFileSync(path.join(root,'src/a.ts'),"import type { X } from '../kit/engine-core/index.ts';\nexport { f } from '../kit/engine-core/index.ts';\n// import '../kit/screens/index.ts'\nconst text = \"import '../kit/screens/index.ts'\";");
  fs.writeFileSync(path.join(root,'src/b.ts'),"import '../kit/unknown/index.ts';");
  fs.writeFileSync(path.join(root,'tests/a.test.ts'),"import '../kit/card-harness/index.ts';");
  return root;
}
describe('reuse metrics',()=>{
  it('distinguishes installed parts, production/test references and unknown imports',()=>{
    const result=measureGame(fixture('one'));
    expect(result.installedComponents).toBe(3);
    expect(result.productionReferenced).toEqual(['engine-core']);
    expect(result.testReferenced).toEqual(['card-harness']);
    expect(result.noStaticReference).toEqual(['screens']);
    expect(result.unlockedReferences).toEqual(['unknown']);
    expect(result.productionFilesReferencingKit).toBe(1);
    expect(result.productionFiles).toBe(2);
    expect(result.telemetry.costUsd).toEqual({kind:'missing'});
  });
  it('keeps the full CLI report when the same game moves under test markers',()=>{
    let root=fixture(path.join('ordinary','game'));
    measurementFile(root,identified('synthetic-project','synthetic-observation'));
    fs.renameSync(path.join(root,'tests/a.test.ts'),path.join(root,'tests/helper.ts'));
    for(const [file,source] of [
      ['src/model.test.ts',"import '../kit/screens/index.ts';"],
      ['src/model.spec.ts',"import '../kit/card-harness/index.ts';"],
      ['src/__tests__/helper.ts',"import '../../kit/screens/index.ts';"],
      ['src/model.test.assets/view.ts',"import '../../kit/engine-core/index.ts';"],
      ['src/model.spec.assets/view.ts',"import '../../kit/engine-core/index.ts';"],
      ['src/data/view.ts',"import '../../kit/engine-core/index.ts';"],
    ]) {
      const target=path.join(root,file);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,source);
    }
    const result=run(root);
    expect(result.status,result.stderr).toBe(0);
    const classification={
      productionFiles:5,productionFilesReferencingKit:4,productionReferenced:['engine-core'],
      testFiles:4,testFilesReferencingKit:4,testReferenced:['card-harness','screens'],
    };
    expect.soft(JSON.parse(result.stdout).games[0],'ordinary').toMatchObject(classification);
    for(const parent of ['game.test.checkout','game.spec.checkout','__tests__']) {
      const next=path.join(tmp,parent,'game');
      fs.mkdirSync(path.dirname(next));
      fs.renameSync(root,next);
      root=next;
      const relocated=run(root);
      expect(relocated.status,relocated.stderr).toBe(0);
      expect.soft(JSON.parse(relocated.stdout).games[0],parent).toMatchObject(classification);
      expect.soft(relocated.stdout,parent).toBe(result.stdout);
    }
  });
  it('counts game references once and does not turn missing costs into zero',()=>{
    const a=measureGame(fixture('two'),build({inputTokens:measured(100),cachedInputTokens:measured(20),costUsd:measured(1.25)}));
    const b=measureGame(fixture('three'));
    const result=summarize([a,b]);
    expect(result.componentsReferencedAcrossGames).toEqual([{component:'card-harness',games:2},{component:'engine-core',games:2}]);
    expect(result.telemetry.costUsd.measured).toEqual({reportedGames:1,sum:1.25});
    expect(result.telemetry.costUsd.missingGames).toBe(1);
    expect(result.telemetry.failedCiRuns.measured).toEqual({reportedGames:0,sum:null});
  });
  it('fails when safe input counters aggregate above MAX_SAFE_INTEGER',()=>{
    const a=measureGame(fixture('max-count'),build({inputTokens:measured(Number.MAX_SAFE_INTEGER)}));
    const b=measureGame(fixture('more-count'),build({inputTokens:measured(2)}));
    expect(()=>summarize([a,b])).toThrow('aggregate inputTokens exceeds the safe integer range');
  });
  it('fails on floating-point overflow before JSON serialization',()=>{
    const a=measureGame(fixture('large-cost'),build({costUsd:measured(1e308)}));
    const b=measureGame(fixture('more-cost'),build({costUsd:measured(1e308)}));
    expect(()=>JSON.stringify(summarize([a,b]))).toThrow('aggregate costUsd is not finite');
  });
  it('requires a provenance label for every present measurement',()=>{
    const root=fixture('unattributed');
    expect(()=>measureGame(root,{inputTokens:10})).toThrow('telemetry sourceRevision');
    expect(()=>measureGame(root,build({inputTokens:{kind:'measured',value:10}}))).toThrow('inputTokens provenance');
  });
  it('requires a source revision and the actual locked kit revision',()=>{
    const root=fixture('revisions');
    expect(()=>measureGame(root,build({}, {sourceRevision:undefined}))).toThrow('telemetry sourceRevision');
    expect(()=>measureGame(root,build({}, {kitRevision:undefined}))).toThrow('telemetry kitRevision');
    expect(()=>measureGame(root,build({}, {kitRevision:'3'.repeat(40)}))).toThrow('does not match the kit lock');
  });
  it('reports missing and incompatible baselines without a savings figure',()=>{
    const root=fixture('baseline');
    const metrics={minutesToPlayable:measured(10)};
    expect(measureGame(root,build(metrics)).comparison).toEqual({status:'missing-baseline',savings:{}});
    const baseline=build({minutesToPlayable:measured(20)}, {window:{...window,end:'2026-01-03T00:00:00.000Z'}});
    expect(measureGame(root,build(metrics,{baseline})).comparison).toEqual({status:'incompatible-window',savings:{}});
    const differentMethod=build({minutesToPlayable:measured(20)}, {window:{...window,protocol:'different-task'}});
    expect(measureGame(root,build(metrics,{baseline:differentMethod})).comparison).toEqual({status:'incompatible-window',savings:{}});
  });
  it('classifies static type-only and value references separately from observed adoption',()=>{
    const root=fixture('adoption');
    fs.writeFileSync(path.join(root,'src/type.ts'),"import { type Screen } from '../kit/screens/index.ts';\nexport type { Harness } from '../kit/card-harness/index.ts';");
    const staticReport=measureGame(root);
    expect(staticReport.productionReferenced).toEqual(['card-harness','engine-core','screens']);
    expect(staticReport.productionTypeOnlyReferenced).toEqual(['card-harness','screens']);
    expect(staticReport.productionRuntimeReferenced).toEqual(['engine-core']);
    expect(staticReport.runtimeAdoption).toBeNull();
    expect(staticReport.evidence).toEqual({productionReferences:'static-application-source',runtimeAdoption:'missing'});
    const runtimeAdoption={'engine-core':'synthetic-runtime-trace'};
    const observed=measureGame(root,build({}, {runtimeAdoption}));
    expect(observed.runtimeAdoption).toEqual(runtimeAdoption);
    expect(observed.evidence).toEqual({productionReferences:'static-application-source',runtimeAdoption:'operator-reported'});
    const summary=summarize([staticReport,observed]);
    expect(summary.evidence).toEqual({componentReferences:'static-source',runtimeAdoption:'operator-reported'});
    expect(summary.gamesWithRuntimeObservations).toBe(1);
    expect(summary.componentsObservedAcrossGames).toEqual([{component:'engine-core',games:1}]);
    expect(()=>measureGame(root,build({}, {runtimeAdoption:{unknown:'synthetic-runtime-trace'}}))).toThrow('unlocked adoption');
  });
  it('reports savings only for comparable measured pairs and serializes valid results',()=>{
    const root=fixture('comparable');
    const metrics={minutesToPlayable:measured(10),costUsd:{kind:'estimated',value:3,provenance:'synthetic-estimate'},ruleDefects:{kind:'inferred',value:2,provenance:'synthetic-review-inference'}};
    const baseline=build({minutesToPlayable:measured(20),costUsd:measured(4),ruleDefects:measured(3)}, {sourceRevision:'4'.repeat(40),kitRevision:'none'});
    const game=measureGame(root,build(metrics,{baseline}));
    const json=JSON.parse(JSON.stringify({game,summary:summarize([game])}));
    expect(json.game.measurement).toEqual({sourceRevision,kitRevision,window});
    expect(json.game.baseline.sourceRevision).toBe('4'.repeat(40));
    expect(json.game.comparison).toEqual({status:'comparable',savings:{minutesToPlayable:10}});
    expect(json.game.telemetry.inputTokens).toEqual({kind:'missing'});
    expect(json.summary.telemetry.costUsd.estimated).toEqual({reportedGames:1,sum:3});
    expect(json.summary.telemetry.ruleDefects.inferred).toEqual({reportedGames:1,sum:2});
    expect(json.summary.telemetry.inputTokens.missingGames).toBe(1);
  });
  it('validates telemetry and refuses duplicate game roots on the CLI',()=>{
    const root=fixture('four');
    expect(()=>measureGame(root,build({inputTokens:measured(1),cachedInputTokens:measured(2)}))).toThrow('cached tokens');
    expect(()=>measureGame(root,build({costUsd:measured(-1)}))).toThrow('invalid');
    expect(()=>measureGame(root,build({secret:'not a metric'}))).toThrow('unknown');
    rejected(run(root,root),'duplicate game directory');
    const alias=path.join(tmp,'same-root-alias');
    fs.symlinkSync(root,alias,'junction');
    rejected(run(root,alias),'duplicate game directory');
    const result=run(root);
    expect(result.status,result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).summary.games).toBe(1);
    expect(result.stdout).not.toContain(root);
    const {games,summary}=JSON.parse(result.stdout);
    expect(games[0]).toMatchObject({productionRuntimeReferenced:['engine-core'],runtimeAdoption:null,telemetry:{costUsd:{kind:'missing'}}});
    expect(summary.telemetry.costUsd.measured).toEqual({reportedGames:0,sum:null});
  });
  it('refuses invalid measurement evidence and values without writing a report',()=>{
    const root=fixture('invalid-evidence');
    for(const [input,message] of [
      [build({inputTokens:{kind:'measured',value:10}}),'inputTokens provenance'],
      [build({}, {sourceRevision:undefined}),'telemetry sourceRevision'],
      [build({}, {kitRevision:'3'.repeat(40)}),'kitRevision does not match the kit lock'],
      [build({inputTokens:measured(1.5)}),'invalid telemetry field: inputTokens'],
      [build({costUsd:{kind:'unknown'}}),'invalid costUsd kind'],
      [build({}, {runtimeAdoption:{unknown:'synthetic-runtime-trace'}}),'unlocked adoption: unknown'],
    ]) {
      measurementFile(root,input);
      rejected(run(root),message);
    }
    fs.writeFileSync(path.join(root,'kit-reuse-metrics.json'),JSON.stringify(build({costUsd:measured('nonfinite')})).replace('"nonfinite"','1e309'));
    rejected(run(root),'invalid telemetry field: costUsd');
  });
  it('refuses unrepresentable measurement aggregates without writing a report',()=>{
    const first=fixture('aggregate-first'),second=fixture('aggregate-second');
    measurementFile(first,build({inputTokens:measured(Number.MAX_SAFE_INTEGER),costUsd:measured(1e308)}));
    measurementFile(second,build({inputTokens:measured(2)}));
    rejected(run(first,second),'aggregate inputTokens exceeds the safe integer range');
    measurementFile(second,build({costUsd:measured(1e308)}));
    rejected(run(first,second),'aggregate costUsd is not finite');
  });
  it('reports copied unidentified measurements as unverified submissions without inferring identity',()=>{
    const root=fixture('legacy-measurement');
    measurementFile(root,build({inputTokens:measured(100),costUsd:measured(2)}));
    const copy=path.join(tmp,'legacy-measurement-copy');
    fs.cpSync(root,copy,{recursive:true});
    const result=run(root,copy);
    expect(result.status,result.stderr).toBe(0);
    const {summary}=JSON.parse(result.stdout);
    expect(summary.telemetry.inputTokens.measured).toEqual({reportedGames:2,sum:200});
    expect(summary.telemetry.costUsd.measured).toEqual({reportedGames:2,sum:4});
    expect(summary.identity).toMatchObject({status:'unverified',unidentifiedMeasurementInputs:[1,2]});
  });
  it('rejects a known repeated observation across distinct roots before emitting totals',()=>{
    const root=fixture('one-observation');
    measurementFile(root,identified('project-a','observation-a'));
    const copy=path.join(tmp,'one-observation-copy');
    fs.cpSync(root,copy,{recursive:true});
    const result=run(root,copy);
    rejected(result,'duplicate observation in inputs 1 and 2');
    expect(result.stderr).not.toContain(root);
    measurementFile(copy,identified('project-a','observation-a',{metrics:{costUsd:measured(3)}}));
    rejected(run(root,copy),'conflicting observation identity in inputs 1 and 2');
  });
  it('rejects conflicting claims for the same observation ID',()=>{
    const root=fixture('conflicting-observation');
    const first=measureGame(root,identified('project-a','observation-a'));
    const otherProject=measureGame(root,identified('project-b','observation-a'));
    const otherValue=measureGame(root,identified('project-a','observation-a',{metrics:{costUsd:measured(3)}}));
    for(const other of [otherProject,otherValue])
      expect(()=>summarize([first,other])).toThrow('conflicting observation identity in inputs 1 and 2');
  });
  it('counts distinct games with identical contents and distinct observations of one project',()=>{
    const root=fixture('identified-a');
    const copy=path.join(tmp,'identified-b');
    fs.cpSync(root,copy,{recursive:true});
    const distinct=path.join(tmp,'identified-a-later');
    fs.cpSync(root,distinct,{recursive:true});
    const laterWindow={...window,start:window.end,end:'2026-01-03T00:00:00.000Z'};
    const a=measureGame(root,identified('project-a','observation-a'));
    const b=measureGame(copy,identified('project-b','observation-b'));
    const later=measureGame(distinct,identified('project-a','observation-a-later',{window:laterWindow}));
    const summary=summarize([a,b,later]);
    expect(summary.telemetry.inputTokens.measured).toEqual({reportedGames:3,sum:300});
    expect(summary.identity).toEqual({
      status:'identified',identifiedProjects:2,identifiedObservations:3,unidentifiedMeasurementInputs:[],
      componentsObservedAcrossIdentifiedProjects:[{component:'engine-core',projects:2}],
    });
  });
  it('keeps static-only and partial identity information explicit',()=>{
    const root=fixture('partial-identity');
    expect(summarize([measureGame(root)]).identity.status).toBe('no-measurements');
    expect(()=>measureGame(root,identified('project-a',undefined))).toThrow('telemetry identity observationId');
    expect(()=>measureGame(root,identified('https://private.example','observation-a'))).toThrow('telemetry identity projectId');
    const a=measureGame(root,identified('project-a','observation-a'));
    const b=measureGame(root,build());
    expect(summarize([a,b,measureGame(root)]).identity).toMatchObject({
      status:'unverified',identifiedProjects:1,identifiedObservations:1,unidentifiedMeasurementInputs:[2],
    });
  });
});
