#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../components');
const code = /\.(?:ts|tsx|mts|js|mjs)$/;
const test = /\.test\.(?:ts|tsx|mts|js|mjs)$/;
const namePattern = /^[a-z][a-z0-9-]*$/;
const identifier = /^[A-Za-z_$][\w$]*$/;
const relative = (dir, f) => path.relative(dir, f).split(path.sep).join('/');
const inside = (dir, f) => {
  const rel = path.relative(dir, f);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};
const ignored = new Set(['.git','node_modules']);
const local = (dir, f) => inside(dir,f) && !relative(dir,f).split('/').some(part=>ignored.has(part));
function real(file) {
  try { return fs.realpathSync(file); } catch { return null; }
}
function componentFile(dir, name) {
  const file=real(path.join(dir,name));
  if(file && !local(dir,file)) throw new Error(name+' escapes component');
  if(!file || !fs.statSync(file,{throwIfNoEntry:false})?.isFile()) throw new Error(name+' is missing or unreadable');
  return file;
}
function readComponentFile(dir, name) {
  const file=componentFile(dir,name);
  try { return fs.readFileSync(file,'utf8'); } catch { throw new Error(name+' is missing or unreadable'); }
}
function compilerHost(dir, options) {
  const host=ts.createCompilerHost(options);
  const libDir=real(path.dirname(host.getDefaultLibFileName(options)));
  const libFile=f=>libDir && path.dirname(f)===libDir && /^lib(?:\.[\w.-]+)?\.d\.ts$/.test(path.basename(f));
  const file=f=>{
    const candidate=path.resolve(f);
    const allowed=local(dir,candidate)?f=>local(dir,f)&&!test.test(f):libFile;
    if(!allowed(candidate)) return null;
    const target=real(candidate);
    return target&&allowed(target)&&ts.sys.fileExists(target)?target:null;
  };
  host.fileExists=f=>file(f)!==null;
  host.readFile=f=>{const target=file(f);return target?ts.sys.readFile(target):undefined;};
  host.realpath=f=>file(f)??f;
  host.directoryExists=f=>{
    const candidate=path.resolve(f);
    if(candidate===libDir) return true;
    const target=local(dir,candidate)?real(candidate):null;
    return !!target&&local(dir,target)&&ts.sys.directoryExists(target);
  };
  host.getDirectories=()=>[];
  host.readDirectory=()=>[];
  return host;
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).flatMap(e =>
    e.isDirectory() && !ignored.has(e.name) ? walk(path.join(dir,e.name)) :
      e.isFile() ? [path.join(dir,e.name)] : []);
}
function readRules(dir) {
  const lines = readComponentFile(dir,'README.md').split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === '## Rules for agents');
  if (start < 0) throw new Error('README.md is missing its Rules for agents section');
  let end = lines.findIndex((l,i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1,end).map((text,i)=>({file:'README.md',line:start+i+2,text})).filter(x=>x.text.trim()&&!x.text.startsWith('<!--'));
}

/** Source-grounded, bounded context. Never include source outside the requested component. */
export function contextPacket({root=defaultRoot,component,symbol,entry='index.ts',maxChars=6000}) {
  if (!namePattern.test(component??'') || (symbol!==undefined&&!identifier.test(symbol))) throw new Error('invalid component or symbol');
  if (!Number.isSafeInteger(maxChars)||maxChars<500||maxChars>100000) throw new Error('maxChars must be 500..100000');
  const base = fs.realpathSync(root);
  const dir = fs.realpathSync(path.join(base,component));
  if (!inside(base,dir)||dir===base) throw new Error('component escapes root');
  const manifestText=readComponentFile(dir,'component.json');
  let manifest;
  try { manifest=JSON.parse(manifestText); } catch { throw new Error('invalid component.json'); }
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
    [manifest.needs,manifest.packages].some(list=>list!==undefined&&(!Array.isArray(list)||list.some(item=>typeof item!=='string')))) throw new Error('invalid component.json');
  if (manifest.name!==component) throw new Error('manifest does not match component');
  if (typeof entry!=='string'||!code.test(entry)||path.isAbsolute(entry)||entry.split(/[\\/]/).some(part=>part==='..'||ignored.has(part))) throw new Error('invalid entry');
  const file=componentFile(dir,entry);
  if (!code.test(file)||test.test(entry)||test.test(file)) throw new Error('entry must be a public source file and not a test');
  const rules=readRules(dir);
  const options={
    target:ts.ScriptTarget.ESNext, module:ts.ModuleKind.ESNext,
    moduleResolution:ts.ModuleResolutionKind.Bundler, jsx:ts.JsxEmit.ReactJSX,
    allowJs:true, skipLibCheck:true, noEmit:true, types:[],
  };
  const program=ts.createProgram([file],options,compilerHost(dir,options));
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(file);
  const module = sf && checker.getSymbolAtLocation(sf);
  if (!module) throw new Error('entry is not an exported module');
  const exports = checker.getExportsOfModule(module).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  if (symbol!==undefined&&!exports.some(x=>x.name===symbol)) throw new Error('symbol is not exported by '+entry+': '+symbol);
  const packet = {
    component,entry,symbol:symbol??null,needs:manifest.needs??[],packages:manifest.packages??[],
    status:'incomplete',requiredReads:[entry,'README.md'],exports:[],contracts:[],rules:[],testEvidence:[],omitted:0,
  };
  const size = () => JSON.stringify(packet).length;
  // Reserve space for both continuation paths and the largest possible omitted count.
  const limit=maxChars-String(Number.MAX_SAFE_INTEGER).length+1;
  if(size()>limit)throw new Error('budget too small for packet metadata and required reads');
  const required=new Set();
  const add = (field, item, read) => {
    packet[field].push(item);
    if (size()>limit) {
      packet[field].pop();
      packet.omitted++;
      if(read) required.add(read);
    }
  };
  const focus = symbol===undefined?exports:exports.filter(x=>x.name===symbol);
  for(const x of focus) {
    const target = x.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(x) : x;
    const declarations = target.getDeclarations()??[];
    const signatures=new Set();
    for(const d of declarations) {
      const f = d.getSourceFile();
      const source=real(f.fileName);
      if(!source||!local(dir,source)||test.test(source))continue;
      const line = f.getLineAndCharacterOfPosition(d.getStart(f)).line+1;
      let signature;
      if(ts.isInterfaceDeclaration(d)||ts.isTypeAliasDeclaration(d)||ts.isEnumDeclaration(d)) signature=d.getText(f);
      else {
        const t=checker.getTypeOfSymbolAtLocation(target,d);
        const sigs=checker.getSignaturesOfType(t,ts.SignatureKind.Call);
        const ctor=checker.getSignaturesOfType(t,ts.SignatureKind.Construct);
        const ss=sigs.length?sigs:ctor;
        signature=ss.length?ss.map(s=>checker.signatureToString(s,d,ts.TypeFormatFlags.NoTruncation)).join('\n'):checker.typeToString(t,d,ts.TypeFormatFlags.NoTruncation);
      }
      if(signature==='any'||signatures.has(signature)) continue;
      signatures.add(signature);
      add('contracts',{symbol:x.name,file:relative(dir,source),line,signature},entry);
    }
    if(!signatures.size) required.add(entry);
  }
  const re=symbol===undefined?null:new RegExp('(?<![\\w$])'+symbol.replace(/[$]/g,'\\$&')+'(?![\\w$])');
  for(const item of rules)add('rules',item,'README.md');
  if(symbol===undefined) for(const x of exports)add('exports',x.name);
  if(re) {
    for(const f of walk(dir).filter(f=>test.test(f))) {
      const name=relative(dir,f);
      const lines=readComponentFile(dir,name).split(/\r?\n/);
      const matches=lines.map((text,i)=>({text,i})).filter(x=>re.test(x.text)&&!/^\s*(?:import|export)\b/.test(x.text));
      if(!matches.length)continue;
      const m=matches[0];
      const from=Math.max(0,m.i-2),to=Math.min(lines.length,m.i+4);
      add('testEvidence',{file:name,line:from+1,text:lines.slice(from,to).join('\n')});
    }
  }
  packet.requiredReads=packet.requiredReads.filter(read=>required.has(read));
  if(!packet.requiredReads.length) packet.status='complete';
  return packet;
}
export function main(args) {
  const [component,symbolOrFlag,...tail]=args;
  if(!component)throw new Error('usage: node tools/kit-context/context.mjs <component> [symbol] [--entry index.ts] [--root components] [--max-chars 6000]');
  const symbol=symbolOrFlag&&!symbolOrFlag.startsWith('--')?symbolOrFlag:undefined;
  const flags=symbol===undefined&&symbolOrFlag?[symbolOrFlag,...tail]:tail;
  const o={component,symbol};
  for(let i=0;i<flags.length;i+=2) {
    const key=flags[i],value=flags[i+1];
    if(!value||value.startsWith('--')||!['--entry','--root','--max-chars'].includes(key))throw new Error('invalid context flag: '+key);
    const prop=key==='--max-chars'?'maxChars':key.slice(2);
    if(Object.hasOwn(o,prop))throw new Error('duplicate flag: '+key);
    o[prop]=key==='--max-chars'?Number(value):value;
  }
  const packet=contextPacket(o);
  console.log(JSON.stringify(packet));
  return packet.status==='complete'?0:2;
}
if(import.meta.main) {
  try { process.exitCode=main(process.argv.slice(2)); } catch(e) { console.error(e.message);process.exitCode=1; }
}
