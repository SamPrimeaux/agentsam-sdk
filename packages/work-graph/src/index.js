import { randomUUID } from 'node:crypto';

export class WorkGraph {
  constructor({ id, name, title, items, workItems, events, timelineEvents, actors = [] } = {}) {
    this.id = id ?? randomUUID();
    this.name = name ?? title ?? 'Untitled Work Graph';
    this.items = items ?? workItems ?? [];
    this.events = events ?? timelineEvents ?? [];
    this.actors = actors;
  }

  add(item) {
    this.items.push(item);
    return item;
  }

  timeline() {
    return [...this.events].sort((a, b) => new Date(a.at ?? a.timestamp) - new Date(b.at ?? b.timestamp));
  }
}

export class WorkItem {
  constructor({ id, title, type = 'task', status = 'planned', owner = null, start = null, end = null, dependencies = [], artifacts = [], evidence = [] } = {}) {
    this.id = id ?? randomUUID();
    this.title = title;
    this.type = type;
    this.status = status;
    this.owner = owner;
    this.start = start;
    this.end = end;
    this.dependencies = dependencies;
    this.artifacts = artifacts;
    this.evidence = evidence;
  }
}

export class Dependency {
  constructor({ from, to, relation = 'blocks' } = {}) {
    this.from = from;
    this.to = to;
    this.relation = relation;
  }
}

export class TimelineEvent {
  constructor({ type, at = new Date(), workItemId, metadata = {} } = {}) {
    this.type = type;
    this.at = new Date(at);
    this.workItemId = workItemId;
    this.metadata = metadata;
  }
}

export class Artifact {
  constructor({ name, kind, uri = null } = {}) {
    this.name = name;
    this.kind = kind;
    this.uri = uri;
  }
}

export class Evidence {
  constructor({ type, value, artifact = null } = {}) {
    this.type = type;
    this.value = value;
    this.artifact = artifact;
  }
}

export class Actor {
  constructor({ id, name, role = 'worker' } = {}) {
    this.id = id ?? randomUUID();
    this.name = name;
    this.role = role;
  }
}
