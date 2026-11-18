// Pieces read from the game's types with the TypeScript compiler: the string literals of a type, or of one property
// of each member of a union (`literalsOf(file, 'Step', 'op')`). Feeds the inventory's piece list; any shape works.
import ts from 'typescript';

export function literalsOf(file: string, typeName: string, prop?: string | { keys: true | 'first' }): string[] {
  if (typeof prop === 'object') return keysOf(file, typeName, { first: prop.keys === 'first' });
  const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const src = program.getSourceFile(file);
  if (src === undefined) throw new Error(`literalsOf: cannot read ${file}`);
  let decl: ts.Node | undefined;
  src.forEachChild((n) => {
    if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === typeName) decl = n;
  });
  if (decl === undefined) throw new Error(`literalsOf: ${file} has no type ${typeName}`);
  const out = new Set<string>();
  const add = (t: ts.Type): void => {
    if (t.isUnion()) return t.types.forEach(add);
    if (prop === undefined) {
      if (t.isStringLiteral()) out.add(t.value);
      return;
    }
    const p = t.getProperty(prop);
    if (p !== undefined) add(checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, decl as ts.Node)));
  };
  const top = checker.getTypeAtLocation(decl);
  if (prop === undefined) add(top);
  else (top.isUnion() ? top.types : [top]).forEach((m) => {
    const p = m.getProperty(prop);
    if (p === undefined) return;
    const pt = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(p, decl as ts.Node));
    (pt.isUnion() ? pt.types : [pt]).forEach((x) => x.isStringLiteral() && out.add(x.value));
  });
  return [...out].sort();
}

/** Property names of each member of an untagged union (`{ gain: number } | { draw: Draw }` gives gain, draw), sorted; a member with several keys contributes all of them (`{ first: true }`: only its first declared key); primitive members are skipped. */
export function keysOf(file: string, typeName: string, opt?: { first?: boolean }): string[] {
  const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const src = program.getSourceFile(file);
  if (src === undefined) throw new Error(`keysOf: cannot read ${file}`);
  let decl: ts.Node | undefined;
  src.forEachChild((n) => {
    if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === typeName) decl = n;
  });
  if (decl === undefined) throw new Error(`keysOf: ${file} has no type ${typeName}`);
  const top = checker.getTypeAtLocation(decl);
  return [...new Set((top.isUnion() ? top.types : [top]).filter((m) => (m.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) !== 0).flatMap((m) => m.getProperties().slice(0, opt?.first === true ? 1 : undefined).map((p) => p.name)))].sort();
}

/** Node kinds of a union read from the engine's types (K97): per value of `tag`, its other keys and the required ones.
 * Throws when the file, type or tag is gone, so a generated grammar fails loudly when its anchor is renamed. */
export function nodesOf(file: string, typeName: string, tag = 'op'): Record<string, { keys: string[]; required: string[] }> {
  const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const src = program.getSourceFile(file);
  if (src === undefined) throw new Error(`nodesOf: cannot read ${file}`);
  let decl: ts.Node | undefined;
  src.forEachChild((n) => {
    if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === typeName) decl = n;
  });
  if (decl === undefined) throw new Error(`nodesOf: ${file} has no type ${typeName}`);
  const d = decl;
  const top = checker.getTypeAtLocation(d);
  const out: Record<string, { keys: string[]; required: string[] }> = {};
  for (const m of top.isUnion() ? top.types : [top]) {
    const t = m.getProperty(tag);
    const tt = t === undefined ? undefined : checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(t, d));
    for (const lit of tt === undefined ? [] : tt.isUnion() ? tt.types : [tt]) {
      if (!lit.isStringLiteral()) continue;
      const ps = m.getProperties().filter((p) => p.name !== tag);
      out[lit.value] = { keys: ps.map((p) => p.name).sort(), required: ps.filter((p) => (p.flags & ts.SymbolFlags.Optional) === 0).map((p) => p.name).sort() };
    }
  }
  if (Object.keys(out).length === 0) throw new Error(`nodesOf: ${typeName} has no member with a string ${tag}`);
  return out;
}
