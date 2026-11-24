import { afterAll,describe,expect,it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureGame,summarize } from './report.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kit-metrics-'));
afterAll(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function fixture(name) {
  const root=path.join(tmp,name);
  for(const d of ['kit','src','tests'])fs.mkdirSync(path.join(root,d),{recursive:true});
  fs.writeFileSync(path.join(root,'kit/kit.lock.json'),JSON.stringify({ref:'v1',components:{'engine-core':{},'card-harness':{},'screens':{}}}));
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
    expect(result.telemetry.costUsd).toBeNull();
  });
  it('counts game references once and does not turn missing costs into zero',()=>{
    const a=measureGame(fixture('two'),{inputTokens:100,cachedInputTokens:20,costUsd:1.25});
    const b=measureGame(fixture('three'));
    const result=summarize([a,b]);
    expect(result.componentsReferencedAcrossGames).toEqual([{component:'card-harness',games:2},{component:'engine-core',games:2}]);
    expect(result.telemetry.costUsd).toEqual({reportedGames:1,sum:1.25});
    expect(result.telemetry.failedCiRuns).toEqual({reportedGames:0,sum:null});
  });
  it('validates telemetry and refuses duplicate game roots on the CLI',()=>{
    const root=fixture('four');
    expect(()=>measureGame(root,{inputTokens:1,cachedInputTokens:2})).toThrow('cached tokens');
    expect(()=>measureGame(root,{costUsd:-1})).toThrow('invalid');
    expect(()=>measureGame(root,{secret:'not a metric'})).toThrow('unknown');
    const cli=fileURLToPath(new URL('./report.mjs',import.meta.url));
    const run=(...args)=>spawnSync('node',[cli,...args],{encoding:'utf8'});
    expect(run(root,root).status).toBe(1);
    const result=run(root);
    expect(result.status,result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).summary.games).toBe(1);
    expect(result.stdout).not.toContain(root);
  });
});
