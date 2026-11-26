import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const checkout=path.resolve(import.meta.dirname,'../..');
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

export function contextTool() {
  let commit=null,modified=null;
  try {
    if(fs.realpathSync(git(checkout,'rev-parse','--show-toplevel'))===fs.realpathSync(checkout)) {
      const head=git(checkout,'rev-parse','HEAD');
      const required=['kit.mjs','tools/kit-context/provenance.mjs'];
      const tracked=git(checkout,'ls-tree','--name-only',head,'--',...required).split(/\r?\n/);
      if(required.every(file=>tracked.includes(file))) {
        commit=head;
        const files=['kit.mjs','tools/kit-context/*.mjs'];
        if(git(checkout,'status','--porcelain','--untracked-files=all','--',...files)) modified=true;
        else if(!/^[a-zS] /m.test(git(checkout,'ls-files','-v','--',...files))) modified=false;
      }
    }
  } catch { /* A copied tool has no checkout revision to report. */ }
  return {name:'kit-context',commit,modified};
}

export function sourceProvenance({root,component,source}) {
  if(source===undefined) return {status:'unverified',method:null};
  if(typeof source!=='string'||!source.trim()) throw new Error('source must name a game-kit checkout');
  if(path.basename(root)!=='kit') throw new Error('--source requires --root to name a game\'s vendored kit directory');
  if(fs.lstatSync(root).isSymbolicLink()) throw new Error('cannot verify a linked kit directory');
  const file=path.join(root,'kit.lock.json');
  const bytes=fs.readFileSync(file);
  let lock;
  try { lock=JSON.parse(bytes.toString('utf8')); } catch { throw new Error('invalid kit/kit.lock.json'); }
  if(!lock || typeof lock.ref!=='string' || !lock.ref || typeof lock.commit!=='string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(lock.commit) || !Object.hasOwn(lock.components??{},component)) {
    throw new Error('kit/kit.lock.json must record the target ref, commit and component');
  }
  const src=fs.realpathSync(source);
  // Execute this checkout's verifier, never the installed CLI or code in the supplied source.
  const check=spawnSync(process.execPath,[path.join(checkout,'kit.mjs'),'check','--source',src],{
    cwd:path.dirname(root),encoding:'utf8',maxBuffer:4*1024*1024,
  });
  if(check.error || check.status!==0) throw new Error('source verification failed: '+(check.error?.message||check.stderr.trim()||'kit check did not succeed'));
  if(!fs.readFileSync(file).equals(bytes)) throw new Error('kit/kit.lock.json changed during source verification; retry');
  const warnings=check.stderr.trim().split(/\r?\n/).filter(Boolean);
  return {
    status:lock.support?'verified':'partial',method:'kit.mjs check --source',
    scope:lock.support?'installed-kit-against-source':'recorded-files-against-source',
    ...(warnings.length?{warnings}:{}),
    target:{ref:lock.ref,commit:lock.commit},
    // This digest identifies the checked lock bytes; verification is the existing command above.
    lock:{file:'kit/kit.lock.json',sha256:createHash('sha256').update(bytes).digest('hex')},
    content:{componentTree:git(src,'rev-parse','--verify',lock.commit+':components/'+component),lockPointer:'/components/'+component+'/files'},
  };
}
