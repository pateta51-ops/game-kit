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
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).flatMap(e =>
    e.isDirectory() && !['node_modules','.git'].includes(e.name) ? walk(path.join(dir,e.name)) :
      e.isFile() ? [path.join(dir,e.name)] : []);
}
function readRules(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === '## Rules for agents');
  if (start < 0) return [];
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
  const manifest = JSON.parse(fs.readFileSync(path.join(dir,'component.json'),'utf8'));
  if (manifest.name!==component) throw new Error('manifest does not match component');
  if (!code.test(entry)||path.isAbsolute(entry)||entry.split(/[\\/]/).includes('..')) throw new Error('invalid entry');
  const file = fs.realpathSync(path.join(dir,entry));
  if (!inside(dir,file)||test.test(file)) throw new Error('entry escapes component or is a test');
  const program = ts.createProgram([file], {
    target:ts.ScriptTarget.ESNext, module:ts.ModuleKind.ESNext,
    moduleResolution:ts.ModuleResolutionKind.Bundler, jsx:ts.JsxEmit.ReactJSX,
    allowJs:true, skipLibCheck:true, noEmit:true, types:[],
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(file);
  const module = sf && checker.getSymbolAtLocation(sf);
  if (!module) throw new Error('entry is not an exported module');
  const exports = checker.getExportsOfModule(module).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  if (symbol!==undefined&&!exports.some(x=>x.name===symbol)) throw new Error('symbol is not exported by '+entry+': '+symbol);
  const packet = {
    component,entry,symbol:symbol??null,needs:manifest.needs??[],packages:manifest.packages??[],
    exports:[],contracts:[],rules:[],testEvidence:[],omitted:0,
  };
  const bytes = () => JSON.stringify(packet).length;
  if(bytes()>maxChars)throw new Error('budget too small for metadata');
  const add = (field, item) => {
    packet[field].push(item);
    if (bytes()>maxChars-20) { packet[field].pop();packet.omitted++; }
  };
  const focus = symbol===undefined?exports:exports.filter(x=>x.name===symbol);
  // A symbol query prioritizes the actual declaration and its matching rules over a full export list.
  if(symbol===undefined) for(const x of exports)add('exports',x.name);
  for(const x of focus) {
    const target = x.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(x) : x;
    const declarations = target.getDeclarations()??[];
    for(const d of declarations) {
      const f = d.getSourceFile();
      if(!inside(dir,f.fileName)||test.test(f.fileName))continue;
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
      add('contracts',{symbol:x.name,file:relative(dir,f.fileName),line,signature});
      if(symbol===undefined)break;
    }
  }
  const rules=readRules(path.join(dir,'README.md'));
  const re=symbol===undefined?null:new RegExp('(?<![\\w$])'+symbol.replace(/[$]/g,'\\$&')+'(?![\\w$])');
  const relevant=re?rules.filter(r=>re.test(r.text)):rules;
  for(const item of relevant)add('rules',item);
  if(re) {
    for(const f of walk(dir).filter(f=>test.test(f))) {
      const lines=fs.readFileSync(f,'utf8').split(/\r?\n/);
      const matches=lines.map((text,i)=>({text,i})).filter(x=>re.test(x.text)&&!/^\s*(?:import|export)\b/.test(x.text));
      if(!matches.length)continue;
      const m=matches[0];
      const from=Math.max(0,m.i-2),to=Math.min(lines.length,m.i+4);
      add('testEvidence',{file:relative(dir,f),line:from+1,text:lines.slice(from,to).join('\n')});
    }
  }
  if(bytes()>maxChars)throw new Error('budget too small for omission metadata');
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
  console.log(JSON.stringify(contextPacket(o)));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch(e) { console.error(e.message);process.exitCode=1; }
}
