import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const kit = path.dirname(path.dirname(import.meta.dirname));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-spec-'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:kit,encoding:'utf8'}).trim();
afterAll(() => fs.rmSync(tmp,{recursive:true,force:true}));
const run = (...args:string[]) => spawnSync('node',[path.join(kit,'kit.mjs'),'spec',...args,'--ref',head],{cwd:kit,encoding:'utf8'});
const write = (name:string, data:unknown) => { const f=path.join(tmp,name+'.json'); fs.writeFileSync(f,JSON.stringify(data)); return f; };
const basic = {version:1,id:'demo',name:'Demo'};
type Result = {commit:string;components:{name:string;reasons:string[]}[];unresolved:string[];mechanics:{status:string;buildOwn?:string}[]};
describe('K551 declarative starter',()=>{
  it('resolves a pinned revision, profiles, mechanics and dependencies deterministically',()=>{
    const file=write('resolve',{...basic,profiles:['deck-builder'],mechanics:['draw a card'],opponent:'automa'});
    const a=run('resolve',file), b=run('resolve',file);
    expect(a.status,a.stderr).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    const result=JSON.parse(a.stdout) as Result;
    expect(result.commit).toBe(head);
    expect(result.components.map(c=>c.name)).toEqual(expect.arrayContaining(['engine-core','card-zones','card-language','automa','market-row']));
    expect(result.components.find(c=>c.name==='card-language')?.reasons).toContain('mechanic: draw a card');
    expect(result.unresolved).toEqual([]);
  });
  it('reports missing mechanics and refuses generation before writing files',()=>{
    const file=write('missing',{...basic,mechanics:['not a real mechanic']});
    const out=path.join(tmp,'missing-game');
    const r=run('resolve',file);
    expect(r.status).toBe(1);
    expect((JSON.parse(r.stdout) as Result).unresolved).toEqual(['not a real mechanic']);
    expect(run('generate',file,'--dir',out,'--no-install').status).toBe(1);
    expect(fs.existsSync(out)).toBe(false);
  });
  it('requires explicit build-own reasons for partial mechanics',()=>{
    const f=write('partial',{...basic,mechanics:['all or nothing block of effects']});
    expect(run('resolve',f).status).toBe(1);
    const ok=run('resolve',write('partial-ok',{...basic,mechanics:['all or nothing block of effects'],buildOwn:{'all or nothing block of effects':'Implement the missing transaction in game code.'}}));
    expect(ok.status,ok.stderr).toBe(0);
    expect((JSON.parse(ok.stdout) as Result).mechanics[0]?.status).toBe('partial');
  });
  it('rejects unknown fields, unsafe component names and unknown profiles',()=>{
    for (const [i,s] of [{...basic,typo:true},{...basic,components:['../../bad']},{...basic,profiles:['unknown']}].entries()) {
      const r=run('resolve',write('invalid-'+i,s)); expect(r.status).toBe(1); expect(r.stderr).not.toBe('');
    }
  });
  it('generates a locked scaffold and assembly record using the existing port registry',()=>{
    const file=write('generate',{...basic,profiles:['campaign'],mechanics:['draw a card']});
    const ports=write('ports',{games:{demo:{name:'Demo',block:6990,serve:{local:4199}}}});
    const dir=path.join(tmp,'generated');
    const r=run('generate',file,'--dir',dir,'--ports',ports,'--no-install');
    expect(r.status,r.stdout+r.stderr).toBe(0);
    const result=JSON.parse(fs.readFileSync(path.join(dir,'docs/kit-assembly.json'),'utf8')) as Result;
    expect(result.commit).toBe(head);
    expect(fs.existsSync(path.join(dir,'kit/campaign/component.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir,'docs/game-spec.json'))).toBe(true);
    expect(spawnSync('node',['kit/kit.mjs','check'],{cwd:dir,encoding:'utf8'}).status).toBe(0);
    expect(run('generate',file,'--dir',dir,'--ports',ports,'--no-install').status).toBe(1);
  },60000);
});
