function projectOwner(owner, actorById) {
  if (!owner) return null;
  if (typeof owner === 'object') return owner;
  const actor = actorById.get(owner);
  return actor ? { id: actor.id, name: actor.name, role: actor.role } : owner;
}

export function createGanttModel(graph) {
  const items = graph?.items ?? graph?.workItems ?? [];
  const actorById = new Map((graph?.actors ?? []).map((actor) => [actor.id, actor]));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    kind: item.type ?? 'task',
    status: item.status,
    owner: projectOwner(item.owner, actorById),
    start: item.start ?? null,
    end: item.end ?? null,
    baselineStart: item.baselineStart ?? null,
    baselineEnd: item.baselineEnd ?? null,
    progress: typeof item.progress === 'number' ? item.progress : null,
    parentId: item.parentId ?? null,
    dependencies: [...(item.dependencies ?? [])],
    blockedReason: item.blockedReason ?? null,
    estimateMinutes: item.estimateMinutes ?? null,
    actualMinutes: item.actualMinutes ?? null,
    executionRef: item.executionRef ?? null,
    goapRef: item.goapRef ?? null,
    version: item.version ?? 1,
    artifactCount: item.artifacts?.length ?? 0,
    evidenceCount: item.evidence?.length ?? 0,
    metadata: { ...(item.metadata ?? {}) },
  }));
}
