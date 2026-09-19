export function createTimelineModel(graph) {
  const items = graph?.items ?? graph?.workItems ?? [];
  const events = graph?.events ?? graph?.timelineEvents ?? [];
  const actors = graph?.actors ?? [];
  return {
    title: graph?.name ?? graph?.title ?? 'Untitled Work Graph',
    lanes: actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      type: actor.type ?? actor.role ?? 'worker',
      items: items.filter((item) => item.owner === actor.id),
    })),
    items,
    events: [...events].sort((a, b) => new Date(a.at ?? a.timestamp) - new Date(b.at ?? b.timestamp)),
  };
}
