import ts from 'typescript';

const exportSymbol = (checker, file) => {
  const module = file && checker.getSymbolAtLocation(file);
  return module ? checker.getExportsOfModule(module) : [];
};
const dealias = (checker, symbol) =>
  symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}

function anyCount(node) {
  let count = 0;
  if (node) visit(node, child => { if (child.kind === ts.SyntaxKind.AnyKeyword) count++; });
  return count;
}

function declarationTexts(program) {
  const texts = new Map();
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile && !program.isSourceFileDefaultLibrary(file)) {
      texts.set(file.fileName, file.text);
    }
  }
  // Capture the compiler's declaration emit in memory. It preserves type syntax
  // and public instance members while dropping implementation bodies.
  program.emit(undefined, (_name, text, _bom, _error, files) => {
    if (files?.length === 1) texts.set(files[0].fileName, text);
  }, undefined, true);
  return texts;
}

function bindingStatement(node) {
  for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
    if (ts.isImportDeclaration(ancestor) || ts.isExportDeclaration(ancestor)) return ancestor;
  }
}

function contractText(node, file) {
  const statement = bindingStatement(node);
  if (statement?.moduleSpecifier) {
    const from = ` from ${statement.moduleSpecifier.getText(file)};`;
    if (ts.isImportSpecifier(node)) return `import${statement.importClause.isTypeOnly ? ' type' : ''} { ${node.getText(file)} }${from}`;
    if (ts.isImportClause(node) && node.name) return `import${node.isTypeOnly ? ' type' : ''} ${node.name.getText(file)}${from}`;
    if (ts.isNamespaceImport(node)) return `import${statement.importClause.isTypeOnly ? ' type' : ''} ${node.getText(file)}${from}`;
    if (ts.isExportSpecifier(node)) return `export${statement.isTypeOnly ? ' type' : ''} { ${node.getText(file)} }${from}`;
    if (ts.isNamespaceExport(node)) return `export ${node.getText(file)}${from}`;
  }
  if (ts.isVariableDeclaration(node) && ts.isVariableStatement(node.parent.parent)) {
    const statement = node.parent.parent;
    const modifiers = statement.modifiers?.map(modifier => modifier.getText(file)).join(' ');
    const kind = ts.tokenToString(node.parent.flags & ts.NodeFlags.Const ? ts.SyntaxKind.ConstKeyword
      : node.parent.flags & ts.NodeFlags.Let ? ts.SyntaxKind.LetKeyword : ts.SyntaxKind.VarKeyword);
    return [modifiers, kind, node.getText(file) + ';'].filter(Boolean).join(' ');
  }
  if (ts.isSourceFile(node.parent)) return node.getText(file);
  if ((ts.isExportSpecifier(node) && !statement?.moduleSpecifier)) return `export { ${node.getText(file)} };`;
}

function originalDeclarations(program, file) {
  const indexed = new Map();
  const source = program.getSourceFile(file);
  if (!source) return indexed;
  const index = node => {
    if (node.name && contractText(node, source) !== undefined) {
      const key = node.name.getText(source);
      const list = indexed.get(key) ?? [];
      list.push(node);
      indexed.set(key, list);
    }
    // Descend only through top-level export/import and variable bindings.
    if (ts.isSourceFile(node) || ts.isImportDeclaration(node) || ts.isImportClause(node) ||
        ts.isNamedImports(node) || ts.isExportDeclaration(node) || ts.isNamedExports(node) ||
        ts.isVariableStatement(node) || ts.isVariableDeclarationList(node)) ts.forEachChild(node, index);
  };
  index(source);
  return indexed;
}

function declaredAnyCount(node) {
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return anyCount(node);
  if (!node.type || node.parameters?.some(param => !param.type)) return 0;
  return anyCount(node.type) + (node.parameters ?? []).reduce((sum, param) => sum + anyCount(param.type), 0) +
    (node.typeParameters ?? []).reduce((sum, param) => sum + anyCount(param), 0);
}

function unresolvedStarExports(program, entry) {
  const checker = program.getTypeChecker();
  const visited = new Set();
  const pending = [program.getSourceFile(entry)];
  for (const source of pending) {
    if (!source || visited.has(source)) continue;
    visited.add(source);
    for (const node of source.statements) {
      if (!ts.isExportDeclaration(node) || node.exportClause || !node.moduleSpecifier) continue;
      const target = checker.getSymbolAtLocation(node.moduleSpecifier)?.declarations?.find(ts.isSourceFile);
      if (!target) return source.fileName;
      pending.push(target);
    }
  }
}

export function collectContracts({ program, file, focus, projection, relativePath, allExports }) {
  const texts = declarationTexts(program);
  const projected = projection(texts);
  const checker = projected.getTypeChecker();
  const exports = new Map(exportSymbol(checker, projected.getSourceFile(file)).map(symbol => [symbol.name, symbol]));
  const symbols = new Set();
  const modules = new Set();
  const rows = new Map();
  const sources = new Map();
  const reads = new Set();
  const diagnostics = new Map();
  let sourceHasErrors;

  function collect(node, symbol) {
    if (rows.has(node)) return;
    const source = node.getSourceFile();
    if (!texts.has(source.fileName)) return;
    const signature = contractText(node, source);
    if (signature === undefined) return;
    const sourcePath = relativePath(source.fileName);
    if (!sources.has(sourcePath)) sources.set(sourcePath, originalDeclarations(program, source.fileName));
    const name = node.name?.getText(source) ?? symbol;
    const candidates = sources.get(sourcePath).get(name) ?? [];
    const peers = node.name ? checker.getSymbolAtLocation(node.name)?.getDeclarations() ?? [] : [];
    const anchor = candidates[Math.max(0, peers.indexOf(node))];
    const line = anchor ? anchor.getSourceFile().getLineAndCharacterOfPosition(anchor.getStart()).line + 1 : 1;
    rows.set(node, { symbol, file: sourcePath, line, signature });
  }

  function follow(symbol, display = symbol.name, wholeModule = false) {
    const target = dealias(checker, symbol);
    for (const node of target.declarations ?? []) collect(node, display);
    const moduleSource = wholeModule && target.declarations?.find(ts.isSourceFile);
    if (moduleSource && !modules.has(target)) {
      modules.add(target);
      const unresolved = unresolvedStarExports(program, moduleSource.fileName);
      if (unresolved) reads.add(relativePath(unresolved));
      for (const member of checker.getExportsOfModule(target)) follow(member, member.name, true);
    }
    // Preserve intermediate re-export bindings as well as the declaration at
    // the end of the alias chain.
    const chain = new Set();
    while (symbol && symbol !== target && !chain.has(symbol)) {
      chain.add(symbol);
      for (const node of symbol.declarations ?? []) collect(node, display);
      symbol = symbol.flags & ts.SymbolFlags.Alias ? checker.getImmediateAliasedSymbol(symbol) : undefined;
    }
    return target;
  }

  for (const name of focus) {
    const symbol = exports.get(name);
    if (!symbol || !follow(symbol, name, true).declarations?.length) reads.add(relativePath(file));
  }
  if (allExports) {
    const unresolved = unresolvedStarExports(program, file);
    if (unresolved || focus.length === 0) reads.add(relativePath(unresolved ?? file));
  }

  for (const [node, row] of rows) {
    const source = node.getSourceFile();
    visit(node, child => {
      if (ts.isImportTypeNode(child) && child.isTypeOf && !child.qualifier && ts.isLiteralTypeNode(child.argument)) {
        const module = checker.getSymbolAtLocation(child.argument.literal);
        if (module) follow(module, module.name, true);
      }
      if (!ts.isIdentifier(child)) return;
      const symbol = checker.getSymbolAtLocation(child);
      const wholeModule = ts.isTypeQueryNode(child.parent);
      if (symbol && wholeModule) follow(symbol, symbol.name, true);
      if (!symbol || symbols.has(symbol)) return;
      symbols.add(symbol);
      follow(symbol);
    });
    if (!diagnostics.has(source)) diagnostics.set(source, projected.getSemanticDiagnostics(source));
    const scope = bindingStatement(node) ?? node;
    if (diagnostics.get(source).some(error => error.start < scope.end
        && error.start + error.length > scope.getStart(source))) reads.add(row.file);

    const anys = anyCount(node);
    if (anys > 0) {
      const originals = sources.get(row.file).get(node.name?.getText(source) ?? row.symbol) ?? [];
      const explicit = originals.some(original => declaredAnyCount(original) >= anys);
      if (!explicit) {
        // A confined import error can become a nested inferred any in emitted
        // declarations. With source errors we cannot certify that inference.
        sourceHasErrors ??= program.getSyntacticDiagnostics().length > 0 || program.getSemanticDiagnostics().length > 0;
        if (sourceHasErrors) reads.add(row.file);
      }
    }
  }
  return { rows: [...rows.values()], reads };
}
