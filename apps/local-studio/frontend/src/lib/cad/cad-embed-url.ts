/** One CAD guest entrypoint for the focused route and AgentSam Work stage. */
export function cadEmbeddedUrl(selection: { projectId?: string; revision?: string } = {}): string {
  const params = new URLSearchParams({ presentation: 'embedded', access: 'project' });
  if (selection.projectId) params.set('project', selection.projectId);
  if (selection.revision) params.set('revision', selection.revision);
  return `/cad-creator/index.html?${params.toString()}`;
}

/** Keep selected versions when a Work tab was opened before the hosted-project contract. */
export function canonicalCadPreviewUrl(url?: string): string {
  if (!url || url.startsWith('/cad-creator/index.html')) {
    const parsed = new URL(url || '/cad-creator/index.html', 'https://agent.local');
    return cadEmbeddedUrl({ projectId: parsed.searchParams.get('project') || undefined, revision: parsed.searchParams.get('revision') || undefined });
  }
  return url;
}
