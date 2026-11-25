#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'commonmark';
import ts from 'typescript';
import { collectContracts } from './contracts.mjs';

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
function compilerHost(dir, options, projection) {
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
  const allowed = target => !projection || !local(dir, target) || projection.has(target);
  host.fileExists=f=>{const target=file(f);return target!==null&&allowed(target);};
  host.readFile=f=>{
    const target=file(f);
    if(!target||!allowed(target))return undefined;
    return projection?.get(target)??ts.sys.readFile(target);
  };
  if(projection) host.getSourceFile=(f,languageVersion)=>{
    const text=host.readFile(f);
    if(text!==undefined) return ts.createSourceFile(f,text,languageVersion,true,ts.ScriptKind.TS);
  };
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
function readDocumentation(dir) {
  const lines = readComponentFile(dir,'README.md').split(/\r?\n/);
  const markdown=lines.join('\n');
  const document=new Parser().parse(markdown);
  const headings=[];
  for(let block=document.firstChild;block;block=block.next) {
    if(block.type==='heading') headings.push(block.sourcepos[0][0]-1);
  }
  const start=headings.find(index=>lines[index].trim()==='## Rules for agents');
  if(start===undefined) throw new Error('README.md is missing its Rules for agents section');
  const end=headings.find(index=>index>start&&/^##\s/.test(lines[index]))??lines.length;
  const sourceLines = (from,to) => lines.slice(from,to).map((text,i)=>({file:'README.md',line:from+i+1,text}));
  const rules=sourceLines(start+1,end);
  const walker=document.walker();
  for(let event;(event=walker.next());) {
    const {node,entering}=event;
    if(!entering||node.type!=='html_block') continue;
    const index=node.sourcepos[0][0]-start-2;
    if(index<0||index>=rules.length) continue;
    // CommonMark keeps the rest of a comment block's closing line as HTML.
    const comment=/^[ \t]*(?:<!--[\s\S]*?(?:-->|$)[ \t]*)+/.exec(node.literal)?.[0];
    if(!comment) continue;
    const count=comment.split('\n').length;
    for(let offset=0;offset<count;offset++) {
      rules[index+offset].text=offset===count-1?node.literal.slice(comment.length):'';
    }
  }
  const usage=[];
  function addUsage(from,to) {
    const section=sourceLines(from,to).filter(x=>x.line!==1||!/^#\s/.test(x.text));
    const first=section.findIndex(x=>x.text.trim());
    if(first===-1)return;
    usage.push({file:'README.md',line:section[first].line,text:section.slice(first).map(x=>x.text).join('\n').trimEnd()});
  }
  addUsage(0,start);
  for(let from=end;from<lines.length;) {
    const next=lines.findIndex((line,i)=>i>from&&/^##\s/.test(line));
    const to=next===-1?lines.length:next;
    addUsage(from,to);
    from=to;
  }
  return {rules:rules.filter(row=>row.text.trim()),usage,markdown};
}

function* guideDocuments(markdown) {
  const parser=new Parser();
  const document=parser.parse(markdown);
  yield document;
  const lines=markdown.split(/\r?\n/);
  let separated=false;
  // Also accept trailing stand-alone definitions in top-level prose paragraphs.
  for(let block=document.firstChild;block;block=block.next) {
    if(block.type!=='paragraph') continue;
    const [[start],[end]]=block.sourcepos;
    if(start===end) continue;
    const plainLines=[''];
    for(let inline=block.firstChild;inline;inline=inline.next) {
      if(inline.type==='softbreak' || inline.type==='linebreak') plainLines.push('');
      else plainLines[plainLines.length-1]+=inline.type==='text'?inline.literal:'\0';
    }
    for(let index=end-1, prose=plainLines.length-1;index>=start && prose>0;index--,prose--) {
      const definition=lines[index];
      // Match only direct text. Line breaks hidden inside links or code are absent from plainLines.
      if(!/^ {0,3}\[[^\]\n]+\]:[ \t]+\S/.test(definition) ||
        plainLines[prose].trim()!==definition.trim() || parser.parse(definition).firstChild) break;
      lines[index]='\n'+definition;
      separated=true;
    }
  }
  if(separated) yield parser.parse(lines.join('\n'));
}

function* markdownLinks(markdown) {
  for(const document of guideDocuments(markdown)) {
    const walker=document.walker();
    for(let event;(event=walker.next());) {
      const {node,entering}=event;
      if(!entering) continue;
      if(node.type==='image') walker.resumeAt(node,false);
      if(node.type==='link') yield node.destination;
    }
  }
}

function readLinkedGuides(dir, markdown) {
  const visited=new Set([componentFile(dir,'README.md')]);
  const guides=[];
  const pending=[{file:'README.md',text:markdown}];
  const decoder=new TextDecoder('utf-8',{fatal:true});
  for(const row of pending) {
    for(const href of markdownLinks(row.text)) {
      const destination=href.split(/[?#]/,1)[0];
      if(/^[A-Za-z][\w+.-]*:|^[\\/]/.test(destination)) continue;
      let guide;
      try { guide=decodeURIComponent(destination); } catch { guide=destination; }
      if(!guide.endsWith('.md') || /^[A-Za-z][\w+.-]*:|^[\\/]|\\/.test(guide)) continue;
      const name=path.posix.join(path.posix.dirname(row.file),guide);
      if(name.split('/').some(part=>part==='..'||ignored.has(part))) continue;
      const target=componentFile(dir,name);
      if(visited.has(target)) continue;
      visited.add(target);
      let bytes;
      try { bytes=fs.readFileSync(target); } catch { throw new Error(name+' is missing or unreadable'); }
      let text;
      try { text=decoder.decode(bytes).trimEnd(); } catch { throw new Error(name+' is not valid UTF-8 Markdown'); }
      guides.push({file:name,line:1,text});
      // Relative links belong to the canonical guide location, including
      // when the guide was reached through a permitted symbolic link.
      pending.push({file:relative(dir,target),text});
    }
  }
  return guides.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
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
  const {rules,usage,markdown}=readDocumentation(dir);
  const guides=readLinkedGuides(dir,markdown);
  const options={
    target:ts.ScriptTarget.ESNext, module:ts.ModuleKind.ESNext,
    moduleResolution:ts.ModuleResolutionKind.Bundler, jsx:ts.JsxEmit.ReactJSX,
    allowJs:true, checkJs:true, allowImportingTsExtensions:true, skipLibCheck:true, strict:true, types:[],
    declaration:true, emitDeclarationOnly:true, removeComments:true, rootDir:dir,
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
    status:'incomplete',requiredReads:[entry,'README.md'],exports:[],contracts:[],rules:[],usage:[],testEvidence:[],omitted:0,
  };
  const size = () => JSON.stringify(packet).length;
  // Reserve space for both continuation paths and the largest possible omitted count.
  const limit=maxChars-String(Number.MAX_SAFE_INTEGER).length+1;
  if(size()>limit)throw new Error('budget too small for packet metadata and required reads');
  const projection = texts => {
    const projectedOptions={...options,declaration:false,emitDeclarationOnly:false,noEmit:true,skipLibCheck:false};
    return ts.createProgram([file],projectedOptions,compilerHost(dir,projectedOptions,texts));
  };
  const { rows, reads: required } = collectContracts({
    program,file,
    focus: symbol===undefined?exports.map(x=>x.name):[symbol],
    projection,relativePath:f=>relative(dir,f),allExports:symbol===undefined,
  });
  const included = [];
  const add = (field, item, read) => {
    packet[field].push(item);
    if (size()>limit) {
      packet[field].pop();
      packet.omitted++;
      if(read) required.add(read);
    } else if(read) {
      included.push({field,read});
    }
  };
  for(const row of rows)add('contracts',row,row.file);
  const re=symbol===undefined?null:new RegExp('(?<![\\w$])'+symbol.replace(/[$]/g,'\\$&')+'(?![\\w$])');
  for(const item of guides)add('usage',item,item.file);
  for(const item of rules)add('rules',item,'README.md');
  for(const item of usage)add('usage',item,'README.md');
  packet.requiredReads=[...required].sort();
  while(size()>limit&&included.length) {
    const {field,read}=included.pop();
    packet[field].pop();
    packet.omitted++;
    required.add(read);
    packet.requiredReads=[...required].sort();
  }
  // When many local paths compete with material already included, direct
  // the reader to the public entrypoint and its referenced declarations.
  if(size()>limit) packet.requiredReads=[
    ...([...required].some(read=>!read.endsWith('.md'))?[entry]:[]),
    ...([...required].some(read=>read.endsWith('.md'))?['README.md']:[]),
  ];
  if(!packet.requiredReads.length) packet.status='complete';
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
