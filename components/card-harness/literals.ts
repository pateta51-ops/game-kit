// Pieces read from the game's types with the TypeScript compiler: the string literals of a type, or of one property
// of each member of a union (`literalsOf(file, 'Step', 'op')`). Feeds the inventory's piece list; any shape works.
import ts from 'typescript';

export function literalsOf(file: string, typeName: string, prop?: string): string[] {
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
