import { execFile, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const kit = path.dirname(path.dirname(import.meta.dirname));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-spec-'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:kit,encoding:'utf8'}).trim();
afterAll(() => fs.rmSync(tmp,{recursive:true,force:true}));
const run = (...args:string[]) => spawnSync('node',[path.join(kit,'kit.mjs'),'spec',...args,'--ref',head],{cwd:kit,encoding:'utf8'});
const write = (name:string, data:unknown) => { const f=path.join(tmp,name+'.json'); fs.writeFileSync(f,JSON.stringify(data)); return f; };
const basic = {version:1,id:'demo',name:'Demo'};
function fixture(name: string) {
  const dir = path.join(tmp, name);
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', kit, dir]);
  const git = (...args: string[]) => execFileSync('git', args, {cwd:dir, encoding:'utf8'}).trim();
  git('sparse-checkout','set','--no-cone','/kit.mjs','/components/scaffold/','/tools/game-server/','/ports.json','/docs/PORTS.md');
  git('checkout', '--quiet', '--detach', head);
  for (const file of ['kit.mjs', 'components/scaffold/spec.mjs', 'tools/game-server/server.mjs']) fs.copyFileSync(path.join(kit,file),path.join(dir,file));
  return {dir, git};
}
const generate = (source: string, ref: string, file: string, dest: string, flags: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath,[path.join(source,'kit.mjs'),'spec','generate',file,'--ref',ref,'--dir',dest,...flags],
    {cwd:source,encoding:'utf8',env:{...process.env,...env}});
type Result = {commit:string;components:{name:string;reasons:string[]}[];unresolved:string[];mechanics:{status:string;buildOwn?:string}[]};
function expectPinnedAssembly(dir: string, ref: string, commit: string) {
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'kit/kit.lock.json'), 'utf8')) as { ref: string; commit: string; components: Record<string, unknown> };
  const assembly = JSON.parse(fs.readFileSync(path.join(dir, 'docs/kit-assembly.json'), 'utf8')) as Result;
  expect(lock).toMatchObject({ ref, commit });
  expect(assembly.commit).toBe(commit);
  expect(Object.keys(lock.components).sort()).toEqual(assembly.components.map(component => component.name).sort());
}
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
    for (const [i,s] of [{...basic,typo:true},{...basic,components:[path.join(String.fromCharCode(46,46), String.fromCharCode(46,46), 'bad')]},{...basic,profiles:['unknown']}].entries()) {
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
    const check=spawnSync(process.execPath,['kit/kit.mjs','check','--source',kit],{cwd:dir,encoding:'utf8'});
    expect(check.status,check.stdout+check.stderr).toBe(0);
    expect(run('generate',file,'--dir',dir,'--ports',ports,'--no-install').status).toBe(1);
  },180_000);
  it('uses the older kit tag template even when the current checkout template changes',()=>{
    const {dir:source,git}=fixture('tag-source');
    const previous=git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit-tree',head+'^{tree}','-m','Older starter');
    git('tag','older-starter',previous);
    const template=path.join(source,'components/scaffold/template/index.html.tpl');
    fs.appendFileSync(template,'\n<!-- checkout-only template -->\n');
    const dir=path.join(tmp,'earlier-game');
    const ports=write('earlier-ports',{games:{demo:{block:6990,serve:{local:4199}}}});
    const r=generate(source,'older-starter',write('earlier-spec',basic),dir,['--ports',ports,'--no-install']);
    expect(r.status,r.stdout+r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dir,'index.html'),'utf8')).not.toContain('checkout-only template');
    expect((JSON.parse(fs.readFileSync(path.join(dir,'docs/kit-assembly.json'),'utf8')) as Result).commit).toBe(previous);
    const lock=JSON.parse(fs.readFileSync(path.join(dir,'kit/kit.lock.json'),'utf8')) as {ref:string;commit:string};
    expect(lock).toMatchObject({ref:'older-starter',commit:previous});
  },60000);
  it('keeps linked dependencies untracked when staging a game pinned to an older tag', () => {
    const { dir: source } = fixture('linked-source');
    const ref = 'v0.272.0';
    const file = write('linked-spec', basic);
    const ports = write('linked-ports', { games: { demo: { block: 6990, serve: { local: 4199 } } } });
    const dir = path.join(tmp, 'linked-game');
    const modules = path.join(kit, 'node_modules');
    const result = generate(source, ref, file, dir, ['--ports', ports, '--link', modules]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('add', '-A');
    expect.soft(git('ls-files', '--', 'node_modules')).toBe('');
    expect(fs.realpathSync(path.join(dir, 'node_modules'))).toBe(fs.realpathSync(modules));
    const commit = execFileSync('git', ['rev-parse', `${ref}^{commit}`], { cwd: source, encoding: 'utf8' }).trim();
    expectPinnedAssembly(dir, ref, commit);
    const gate = spawnSync(process.execPath, ['kit/repo-gate/repo-gate.ts'], { cwd: dir, encoding: 'utf8' });
    expect(gate.status, gate.stdout + gate.stderr).toBe(0);
  }, 60_000);
  it('publishes only one complete scaffold when two attempts share a destination', async () => {
    const file = write('concurrent-spec', basic);
    const ports = write('concurrent-ports', { games: { demo: { block: 6990, serve: { local: 4199 } } } });
    const dir = path.join(tmp, 'concurrent-game');
    const modules = path.join(kit, 'node_modules');
    const runAsync = promisify(execFile);
    const attempt = () => runAsync(process.execPath, [path.join(kit, 'kit.mjs'), 'spec', 'generate', file, '--ref', head, '--dir', dir, '--ports', ports, '--link', modules], { cwd: kit });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expectPinnedAssembly(dir, head, head);
    expect(fs.realpathSync(path.join(dir, 'node_modules'))).toBe(fs.realpathSync(modules));
    expect(fs.readdirSync(tmp).filter(file => file.startsWith('.kit-spec-'))).toEqual([]);
  }, 60_000);
  it('reads the tagged profile definitions instead of uncommitted checkout definitions',()=>{
    const {dir:source,git}=fixture('profile-source');
    git('tag','profile-starter',head);
    const program=path.join(source,'components/scaffold/spec.mjs');
    const code=fs.readFileSync(program,'utf8');
    const modified=code.replace('"campaign": [','"unreleased-profile": [');
    expect(modified).not.toBe(code);
    fs.writeFileSync(program,modified);
    const file=write('tagged-profile',{...basic,profiles:['campaign']});
    const result=spawnSync(process.execPath,[path.join(source,'kit.mjs'),'spec','resolve',file,'--ref','profile-starter'],{cwd:source,encoding:'utf8'});
    expect(result.status,result.stdout+result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as Result).components.map(c=>c.name)).toContain('campaign');
  });
  it.each(['pull','lock','installation'] as const)('leaves the destination untouched after %s failure and can retry', kind=>{
    const source=kind==='lock' ? fixture('failure-lock').dir : kit;
    const file=write('failed-'+kind,basic);
    const ports=write('failure-ports-'+kind,{games:{demo:{block:6990,serve:{local:4199}}}});
    const dir=path.join(tmp,'retry-'+kind);
    fs.mkdirSync(dir);
    const env: NodeJS.ProcessEnv={};
    const flags=['--ports',ports];
    if (kind==='pull') env['KIT_TEST_FAULT']='swap';
    if (kind==='lock') {
      const runner=path.join(source,'kit.mjs');
      const code=fs.readFileSync(runner,'utf8');
      const updated=code.replace("fs.writeFileSync(NEW + '/kit.lock.json'","if (!process.env.KIT_SPEC_FIXTURE_NO_LOCK) fs.writeFileSync(NEW + '/kit.lock.json'");
      expect(updated).not.toBe(code);
      fs.writeFileSync(runner,updated);
      env['KIT_SPEC_FIXTURE_NO_LOCK']='1';
    }
    if (kind==='installation') {
      const bin=fs.mkdtempSync(path.join(tmp,'fake-npm-'));
      const windows=process.platform==='win32';
      fs.writeFileSync(path.join(bin,windows?'npm.cmd':'npm'),windows?'@echo injected install failure\r\n@exit /b 42\r\n':'#!/bin/sh\necho injected install failure >&2\nexit 42\n',{mode:0o755});
      env['PATH']=bin+path.delimiter+(process.env['PATH']??'');
    } else flags.push('--no-install');
    const failed=generate(source,head,file,dir,flags,env);
    expect(failed.status,failed.stdout+failed.stderr).toBe(1);
    expect(failed.stderr).toContain({pull:'pull failed',lock:'kit.lock.json',installation:'injected install failure'}[kind]);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(fs.readdirSync(tmp).filter(file=>file.startsWith('.kit-spec-'))).toEqual([]);
    const retry=generate(source,head,file,dir,['--ports',ports,'--no-install']);
    expect(retry.status,retry.stdout+retry.stderr).toBe(0);
    expect(fs.existsSync(path.join(dir,'docs/kit-assembly.json'))).toBe(true);
  },60000);
  it.each([
    ['wrong ref', 'lock.ref = "wrong-tag"'],
    ['wrong commit', 'lock.commit = "0".repeat(40)'],
    ['missing component', 'delete lock.components["engine-core"]'],
    ['extra component', 'lock.components["unexpected-component"] = {}'],
  ])('rejects a generated lock with %s before publishing and can retry', (fault, change) => {
    const { dir: source } = fixture(`bad-${fault.replaceAll(' ', '-')}`);
    const file = write(`bad-lock-${fault}`, basic);
    const ports = write(`bad-lock-ports-${fault}`, { games: { demo: { block: 6990, serve: { local: 4199 } } } });
    const registries = [ports, path.join(source, 'ports.json'), path.join(source, 'docs/PORTS.md')];
    const readRegistries = () => registries.map(file => fs.readFileSync(file, 'utf8'));
    const before = readRegistries();
    const dir = path.join(tmp, `retry-lock-${fault}`);
    fs.mkdirSync(dir);
    // The production pull still runs. Corrupt only the lock it is about to write.
    const runner = path.join(source, 'kit.mjs');
    const marker = "  fs.writeFileSync(NEW + '/kit.lock.json'";
    const code = fs.readFileSync(runner, 'utf8');
    expect(code).toContain(marker);
    fs.writeFileSync(runner, code.replace(marker, `  if (process.env.KIT_SPEC_FIXTURE_BAD_LOCK === '1') { ${change} }\n${marker}`));
    const flags = ['--ports', ports, '--no-install'];
    const original = fs.statSync(dir);
    const failed = generate(source, head, file, dir, flags, { KIT_SPEC_FIXTURE_BAD_LOCK: '1' });
    expect(failed.status, failed.stdout + failed.stderr).toBe(1);
    expect(failed.stderr).toContain('generated kit.lock.json does not match resolved assembly');
    expect(fs.statSync(dir).ino).toBe(original.ino);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(fs.readdirSync(tmp).filter(file => file.startsWith('.kit-spec-'))).toEqual([]);
    expect(readRegistries()).toEqual(before);
    const retry = generate(source, head, file, dir, flags);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    expectPinnedAssembly(dir, head, head);
    expect(readRegistries()).toEqual(before);
  }, 60_000);
  it('leaves an unregistered game and developer-owned files untouched',()=>{
    const {dir:source}=fixture('ports-source');
    const registry=path.join(source,'ports.json');
    const doc=path.join(source,'docs/PORTS.md');
    const before=[fs.readFileSync(registry,'utf8'),fs.readFileSync(doc,'utf8')];
    const file=write('unregistered',{...basic,id:'synthetic-transaction'});
    const dir=path.join(tmp,'no-ports-game');
    const failed=generate(source,head,file,dir,['--no-install'],{KIT_TEST_FAULT:'swap'});
    expect(failed.status,failed.stdout+failed.stderr).toBe(1);
    expect([fs.readFileSync(registry,'utf8'),fs.readFileSync(doc,'utf8')]).toEqual(before);
    expect(fs.existsSync(dir)).toBe(false);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir,'keep.txt'),'developer-owned');
    expect(generate(source,head,file,dir,['--no-install']).status).toBe(1);
    expect(fs.readdirSync(dir)).toEqual(['keep.txt']);
    expect(fs.readFileSync(path.join(dir,'keep.txt'),'utf8')).toBe('developer-owned');
  },60000);
  it('uses the official registry for a deliberately pre-registered destination',()=>{
    const {dir:source}=fixture('pending-source');
    const id='pending-synthetic';
    const dir=path.join(tmp,'pending-game');
    const command=spawnSync(process.execPath,['tools/game-server/server.mjs','add',id,'Pending Synthetic',dir,'--pending'],{cwd:source,encoding:'utf8'});
    expect(command.status,command.stdout+command.stderr).toBe(0);
    expect(fs.existsSync(dir)).toBe(false);
    const result=generate(source,head,write('pending-spec',{...basic,id}),dir,['--no-install']);
    expect(result.status,result.stdout+result.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dir,'vite.config.ts'),'utf8')).toContain('port:');
  },60000);
});
