import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const validName = /^[a-z][a-z0-9-]*$/;
const compare = (a,b) => a<b?-1:a>b?1:0;
const within = (root,file) => {
  const p=path.relative(root,file);
  return p!=='' && p!=='..' && !p.startsWith('..'+path.sep) && !path.isAbsolute(p);
};
function sourceFiles(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>compare(a.name,b.name)).flatMap(e=>{
    const f=path.join(dir,e.name);
    if(e.isDirectory()&&!['node_modules','.git','dist','coverage'].includes(e.name))return sourceFiles(f);
    return e.isFile()&&/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(e.name)&&!e.name.endsWith('.d.ts')?[f]:[];
  });
}
/** Resolve only literal relative static imports and re-exports. No module is executed. */
export function referencedParts(file, text, kitDir) {
  const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const parts=new Set();
  for(const node of sf.statements) {
    if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
    const spec=node.moduleSpecifier;
    if(!spec||!ts.isStringLiteral(spec)||!/^\.\.?\//.test(spec.text))continue;
    const dest=path.resolve(path.dirname(file),spec.text);
    if(!within(kitDir,dest))continue;
    const segments=path.relative(kitDir,dest).split(path.sep);
    const part=segments[0]==='components'?segments[1]:segments[0];
    if(segments.length>(segments[0]==='components'?2:1)&&validName.test(part??''))parts.add(part);
  }
  return [...parts].sort(compare);
}
const telemetryKeys=['inputTokens','outputTokens','cachedInputTokens','costUsd','minutesToPlayable','failedCiRuns','ruleDefects'];
function telemetryOf(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('telemetry must be an object');
  for(const k of Object.keys(value)) {
    if(!telemetryKeys.includes(k))throw new Error('unknown telemetry field: '+k);
    const n=value[k];
    if(typeof n!=='number'||!Number.isFinite(n)||n<0||(!['costUsd','minutesToPlayable'].includes(k)&&!Number.isSafeInteger(n)))throw new Error('invalid telemetry field: '+k);
  }
  if(value.cachedInputTokens!==undefined&&value.inputTokens!==undefined&&value.cachedInputTokens>value.inputTokens)throw new Error('cached tokens exceed total input tokens');
  return Object.fromEntries(telemetryKeys.map(k=>[k,value[k]??null]));
}
/** A lock measures availability, and imports measure references, not delivered features or labor savings. */
export function measureGame(dir, telemetry={}) {
  const root=fs.realpathSync(dir);
  const kit=path.join(root,'kit');
  const lock=JSON.parse(fs.readFileSync(path.join(kit,'kit.lock.json'),'utf8'));
  if(!lock.components||typeof lock.components!=='object'||Array.isArray(lock.components))throw new Error('invalid kit lock');
  const installed=Object.keys(lock.components).sort(compare);
  if(installed.some(k=>!validName.test(k)))throw new Error('invalid locked component name');
  const locked=new Set(installed),production=new Set(),tests=new Set(),unlocked=new Set();
  let productionFiles=0,productionFilesReferencingKit=0,testFiles=0,testFilesReferencingKit=0;
  for(const folder of ['src','tests']) {
    const from=path.join(root,folder);
    if(!fs.existsSync(from))continue;
    if(fs.realpathSync(from)!==from)throw new Error('source folder is a symlink');
    for(const file of sourceFiles(from)) {
      const isTest=folder==='tests'||/\.(?:test|spec)\./.test(file)||file.split(path.sep).includes('__tests__');
      const parts=referencedParts(file,fs.readFileSync(file,'utf8'),kit);
      const target=isTest?tests:production;
      if(isTest){testFiles++;if(parts.some(p=>locked.has(p)))testFilesReferencingKit++;}
      else{productionFiles++;if(parts.some(p=>locked.has(p)))productionFilesReferencingKit++;}
      for(const p of parts)if(locked.has(p))target.add(p);else unlocked.add(p);
    }
  }
  return {
    ref:typeof lock.ref==='string'?lock.ref:null,
    commit:typeof lock.commit==='string'?lock.commit:null,
    installedComponents:installed.length,
    productionReferenced:[...production].sort(compare),testReferenced:[...tests].sort(compare),
    noStaticReference:installed.filter(p=>!production.has(p)&&!tests.has(p)),
    unlockedReferences:[...unlocked].sort(compare),
    productionFiles,productionFilesReferencingKit,testFiles,testFilesReferencingKit,
    telemetry:telemetryOf(telemetry),
  };
}
export function summarize(games) {
  const parts=new Map();
  for(const game of games)for(const p of new Set([...game.productionReferenced,...game.testReferenced]))parts.set(p,(parts.get(p)??0)+1);
  const metrics=Object.fromEntries(telemetryKeys.map(k=>{
    const values=games.flatMap(g=>g.telemetry[k]===null?[]:[g.telemetry[k]]);
    return [k,{reportedGames:values.length,sum:values.length?values.reduce((a,b)=>a+b,0):null}];
  }));
  return {games:games.length,componentsReferencedAcrossGames:[...parts].sort((a,b)=>b[1]-a[1]||compare(a[0],b[0])).map(([component,games])=>({component,games})),telemetry:metrics};
}
export function main(args) {
  if(!args.length)throw new Error('usage: node tools/reuse-metrics/report.mjs <game-dir> [<game-dir> ...]');
  const roots=args.map(d=>fs.realpathSync(d));
  if(new Set(roots).size!==roots.length)throw new Error('duplicate game directory');
  const games=roots.map(d=>{
    const f=path.join(d,'kit-reuse-metrics.json');
    return measureGame(d,fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{});
  });
  console.log(JSON.stringify({games,summary:summarize(games)},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
