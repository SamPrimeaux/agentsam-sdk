export function buildTimelineModel(workGraph) {
  return {
    title: workGraph.title,
    lanes: workGraph.actors.map(actor => ({
      id: actor.id,
      name: actor.name,
      type: actor.type,
      items: workGraph.workItems.filter(item => item.owner === actor.id)
    })),
    events: workGraph.timelineEvents ?? []
  };
}

export function getStatusClass(status) {
  return {
    complete: "green",
    running: "blue",
    blocked: "red",
    queued: "gray"
  }[status] ?? "gray";
}
