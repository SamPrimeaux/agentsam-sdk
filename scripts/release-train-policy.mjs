const DEFAULT_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** Return public-workspace dependency edges that terminate at private workspaces. */
export function findPrivateWorkspaceDependencyEdges(workspaces, sections = DEFAULT_SECTIONS) {
  const byName = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest]));
  const edges = [];
  for (const { file, manifest } of workspaces) {
    if (!manifest.name || manifest.private === true) continue;
    for (const section of sections) {
      for (const dependency of Object.keys(manifest[section] || {})) {
        if (byName.get(dependency)?.private === true) {
          edges.push({ consumer: manifest.name, dependency, section, file });
        }
      }
    }
  }
  return edges;
}

/** npm CLI may serialize a single version query as a one-item JSON array. */
export function registryVersionMatches(value, expected) {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}

/** npm view wraps object fields in a one-element array; unwrap for manifest comparison. */
export function unwrapSingleNpmViewValue(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}
