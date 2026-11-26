export const PACKAGE_ROLES = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

export function packageDeclarations(manifest, name, roles = PACKAGE_ROLES) {
  return roles.filter(role => Object.hasOwn(manifest[role] ?? {}, name))
    .map(role => ({ role, range: manifest[role][name] }))
}

export function collectPackages(manifests, packageJson, roles) {
  const sources = new Map()
  for (const [component, manifest] of manifests) {
    for (const name of manifest.packages ?? []) {
      if (!sources.has(name)) sources.set(name, new Set())
      sources.get(name).add(component)
    }
  }
  return [...sources.keys()].sort().map(name => ({
    name,
    components: [...sources.get(name)].sort(),
    declarations: packageDeclarations(packageJson, name, roles),
  }))
}
