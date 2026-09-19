// WorkGraph -> Timeline runtime helpers
// Keeps the UI renderer independent from mission data shape.

export function buildAgentLanes(graph) {
  return (graph.actors || [])
    .filter(actor => actor.type === 'agent' || actor.type === 'human')
    .map(actor => ({
      id: actor.id,
      name: actor.name,
      items: (graph.workItems || []).filter(item => item.owner === actor.id),
    }));
}

export function buildTimelineBars(graph) {
  return (graph.workItems || []).map(item => ({
    id: item.id,
    label: item.title,
    owner: item.owner,
    status: item.status,
    start: item.start,
    end: item.end,
    artifacts: item.artifacts || [],
    evidence: item.evidence || [],
  }));
}

export function buildEventMarkers(graph) {
  return (graph.timelineEvents || []).map(event => ({
    id: event.id || `${event.type}-${event.timestamp}`,
    type: event.type,
    label: event.label,
    timestamp: event.timestamp,
  }));
}

export function getWorkItemDetails(graph, id) {
  return (graph.workItems || []).find(item => item.id === id) || null;
}
