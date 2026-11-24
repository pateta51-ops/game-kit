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
function typeOnly(node) {
  if(ts.isImportDeclaration(node)) {
    const clause=node.importClause;
    const bindings=clause?.namedBindings;
    return clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) &&
      bindings.elements.length>0 && bindings.elements.every(element=>element.isTypeOnly));
  }
  const clause=node.exportClause;
  return node.isTypeOnly || (clause && ts.isNamedExports(clause) && clause.elements.length>0 &&
    clause.elements.every(element=>element.isTypeOnly));
}
function partReferences(file, text, kitDir) {
  const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const parts=new Map();
  for(const node of sf.statements) {
    if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
    const spec=node.moduleSpecifier;
    if(!spec||!ts.isStringLiteral(spec)||!/^\.\.?\//.test(spec.text))continue;
    const dest=path.resolve(path.dirname(file),spec.text);
    if(!within(kitDir,dest))continue;
    const segments=path.relative(kitDir,dest).split(path.sep);
    const part=segments[0]==='components'?segments[1]:segments[0];
    if(segments.length<=(segments[0]==='components'?2:1)||!validName.test(part??''))continue;
    parts.set(part,!typeOnly(node)||parts.get(part)===true);
  }
  return parts;
}
/** Resolve only literal relative static imports and re-exports. No module is executed. */
export function referencedParts(file, text, kitDir) {
  return [...partReferences(file,text,kitDir).keys()].sort(compare);
}
const telemetryKeys=['inputTokens','outputTokens','cachedInputTokens','costUsd','minutesToPlayable','failedCiRuns','ruleDefects'];
const kinds=['measured','estimated','inferred'];
const integerMetric=key=>key!=='costUsd'&&key!=='minutesToPlayable';
function record(value,label) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(label+' must be an object');
  return value;
}
function checkKeys(value,allowed,label) {
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error('unknown '+label+' field: '+key);
}
function revision(value,label) {
  if(typeof value!=='string'||!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value))throw new Error(label+' must be a full Git SHA');
  return value.toLowerCase();
}
function evidenceLabel(value,label) {
  if(typeof value!=='string'||!/^[a-z\d][a-z\d._-]*$/i.test(value))throw new Error(label+' must be a nonempty label with letters, digits, dots, underscores or hyphens');
  return value;
}
function utcTimestamp(value,label) {
  const date=typeof value==='string'?new Date(value):new Date(NaN);
  if(!Number.isFinite(date.getTime()))throw new Error(label+' must be a UTC ISO timestamp');
  const iso=date.toISOString();
  if(value!==iso&&value!==iso.replace('.000Z','Z'))throw new Error(label+' must be a UTC ISO timestamp');
  return iso;
}
function telemetryOf(value) {
  const metrics=record(value,'metrics');
  checkKeys(metrics,telemetryKeys,'telemetry');
  const result=Object.fromEntries(telemetryKeys.map(key=>{
    if(!Object.hasOwn(metrics,key))return [key,{kind:'missing'}];
    const metric=record(metrics[key],key);
    checkKeys(metric,['kind','value','provenance'],key);
    const {kind,value:n}=metric;
    if(!kinds.includes(kind))throw new Error('invalid '+key+' kind');
    if(typeof n!=='number'||!Number.isFinite(n)||n<0||(integerMetric(key)&&!Number.isSafeInteger(n)))throw new Error('invalid telemetry field: '+key);
    return [key,{kind,value:n,provenance:evidenceLabel(metric.provenance,key+' provenance')}];
  }));
  if(result.cachedInputTokens.value!==undefined&&result.inputTokens.value!==undefined&&result.cachedInputTokens.value>result.inputTokens.value) {
    throw new Error('cached tokens exceed total input tokens');
  }
  return result;
}
function measurementOf(value,label,baseline=false) {
  const input=record(value,label);
  const sourceRevision=revision(input.sourceRevision,label+' sourceRevision');
  const kitRevision=baseline&&input.kitRevision==='none'?'none':revision(input.kitRevision,label+' kitRevision');
  const fields=['sourceRevision','kitRevision','window','metrics'];
  checkKeys(input,baseline?fields:[...fields,'baseline','runtimeAdoption'],label);
  const raw=record(input.window,label+' window');
  checkKeys(raw,['start','end','protocol'],label+' window');
  const start=utcTimestamp(raw.start,label+' window start'),end=utcTimestamp(raw.end,label+' window end');
  if(Date.parse(start)>=Date.parse(end))throw new Error(label+' window end must be after start');
  const window={start,end,protocol:evidenceLabel(raw.protocol,label+' window protocol')};
  return {sourceRevision,kitRevision,window,metrics:telemetryOf(input.metrics===undefined?{}:input.metrics)};
}
function compareMeasurement(measurement,baseline,metrics) {
  const savings={};
  if(measurement===null||baseline===null)return {status:'missing-baseline',savings};
  const {start,end,protocol}=measurement.window;
  if(start!==baseline.window.start||end!==baseline.window.end||protocol!==baseline.window.protocol) {
    return {status:'incompatible-window',savings};
  }
  for(const key of telemetryKeys) {
    const current=metrics[key],reference=baseline.metrics[key];
    if(current.kind==='measured'&&reference.kind==='measured')savings[key]=reference.value-current.value;
  }
  return {status:Object.keys(savings).length?'comparable':'no-measured-pairs',savings};
}
function adoptionOf(value,locked) {
  if(value===undefined)return null;
  const observed=record(value,'runtimeAdoption');
  return Object.fromEntries(Object.keys(observed).sort(compare).map(part=>{
    if(!locked.has(part))throw new Error('unlocked adoption: '+part);
    return [part,evidenceLabel(observed[part],part+' adoption provenance')];
  }));
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
  const productionRuntime=new Set(),testRuntime=new Set();
  let productionFiles=0,productionFilesReferencingKit=0,testFiles=0,testFilesReferencingKit=0;
  for(const folder of ['src','tests']) {
    const from=path.join(root,folder);
    if(!fs.existsSync(from))continue;
    if(fs.realpathSync(from)!==from)throw new Error('source folder is a symlink');
    for(const file of sourceFiles(from)) {
      const isTest=folder==='tests'||/\.(?:test|spec)\./.test(file)||file.split(path.sep).includes('__tests__');
      const parts=partReferences(file,fs.readFileSync(file,'utf8'),kit);
      const referencesLocked=[...parts.keys()].some(part=>locked.has(part));
      const target=isTest?tests:production;
      const runtime=isTest?testRuntime:productionRuntime;
      if(isTest){testFiles++;if(referencesLocked)testFilesReferencingKit++;}
      else{productionFiles++;if(referencesLocked)productionFilesReferencingKit++;}
      for(const [part,hasRuntime] of parts) {
        if(!locked.has(part))unlocked.add(part);
        else {
          target.add(part);
          if(hasRuntime)runtime.add(part);
        }
      }
    }
  }
  const input=record(telemetry,'telemetry');
  const measured=Object.keys(input).length?measurementOf(input,'telemetry'):null;
  const {metrics,...context}=measured??{};
  const commit=typeof lock.commit==='string'?lock.commit:null;
  if(measured&&measured.kitRevision!==commit?.toLowerCase())throw new Error('telemetry kitRevision does not match the kit lock');
  const baseline=input.baseline===undefined?null:measurementOf(input.baseline,'baseline',true);
  const values=metrics??telemetryOf({});
  return {
    ref:typeof lock.ref==='string'?lock.ref:null,
    commit,
    installedComponents:installed.length,
    productionReferenced:[...production].sort(compare),testReferenced:[...tests].sort(compare),
    productionRuntimeReferenced:[...productionRuntime].sort(compare),testRuntimeReferenced:[...testRuntime].sort(compare),
    productionTypeOnlyReferenced:[...production].filter(part=>!productionRuntime.has(part)).sort(compare),
    testTypeOnlyReferenced:[...tests].filter(part=>!testRuntime.has(part)).sort(compare),
    noStaticReference:installed.filter(p=>!production.has(p)&&!tests.has(p)),
    unlockedReferences:[...unlocked].sort(compare),
    productionFiles,productionFilesReferencingKit,testFiles,testFilesReferencingKit,
    measurement:measured?context:null,
    runtimeAdoption:adoptionOf(input.runtimeAdoption,locked),
    telemetry:values,
    baseline,
    comparison:compareMeasurement(measured,baseline,values),
  };
}
export function summarize(games) {
  const parts=new Map(),observed=new Map();
  let gamesWithRuntimeObservations=0;
  for(const game of games) {
    for(const part of new Set([...game.productionReferenced,...game.testReferenced]))parts.set(part,(parts.get(part)??0)+1);
    if(game.runtimeAdoption===null)continue;
    gamesWithRuntimeObservations++;
    for(const part of Object.keys(game.runtimeAdoption))observed.set(part,(observed.get(part)??0)+1);
  }
  const metrics=Object.fromEntries(telemetryKeys.map(key=>{
    const totals=Object.fromEntries(kinds.map(kind=>[kind,{reportedGames:0,sum:null}]));
    let missingGames=0;
    for(const game of games) {
      const metric=game.telemetry[key];
      if(metric.kind==='missing'){missingGames++;continue;}
      const group=totals[metric.kind];
      const sum=(group.sum??0)+metric.value;
      if(!Number.isFinite(sum))throw new Error('aggregate '+key+' is not finite ('+metric.kind+')');
      if(integerMetric(key)&&!Number.isSafeInteger(sum))throw new Error('aggregate '+key+' exceeds the safe integer range ('+metric.kind+')');
      group.sum=sum;
      group.reportedGames++;
    }
    return [key,{...totals,missingGames}];
  }));
  const counts=entries=>[...entries].sort((a,b)=>b[1]-a[1]||compare(a[0],b[0])).map(([component,games])=>({component,games}));
  return {games:games.length,componentsReferencedAcrossGames:counts(parts),gamesWithRuntimeObservations,
    componentsObservedAcrossGames:counts(observed),telemetry:metrics};
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
