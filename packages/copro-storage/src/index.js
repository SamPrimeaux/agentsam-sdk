import { parseCoProProject, serializeCoProProject } from "@inneranimalmedia/copro-project";

function clone(value) {
  return structuredClone(value);
}

export class MemoryProjectStore {
  #projects = new Map();

  async save(project) {
    const parsed = parseCoProProject(project);
    this.#projects.set(parsed.id, clone(parsed));
    return clone(parsed);
  }

  async load(id) {
    const project = this.#projects.get(id);
    return project ? clone(project) : null;
  }

  async list() {
    return [...this.#projects.values()].map(clone);
  }

  async remove(id) {
    return this.#projects.delete(id);
  }
}

export class BrowserLocalStorageProjectStore {
  constructor({ storage, prefix = "copro.project.v1:" } = {}) {
    this.storage = storage ?? globalThis.localStorage;
    this.prefix = prefix;
    if (!this.storage) throw new Error("copro_storage_local_unavailable");
  }

  key(id) {
    return this.prefix + id;
  }

  async save(project) {
    const serialized = serializeCoProProject(project);
    this.storage.setItem(this.key(project.id), serialized);
    this.storage.setItem(this.prefix + "__recent__", project.id);
    return parseCoProProject(serialized);
  }

  async load(id) {
    const value = this.storage.getItem(this.key(id));
    return value ? parseCoProProject(value) : null;
  }

  async loadRecent() {
    const id = this.storage.getItem(this.prefix + "__recent__");
    return id ? this.load(id) : null;
  }

  async list() {
    const projects = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key || !key.startsWith(this.prefix) || key.endsWith("__recent__")) continue;
      const value = this.storage.getItem(key);
      if (value) projects.push(parseCoProProject(value));
    }
    return projects;
  }

  async remove(id) {
    this.storage.removeItem(this.key(id));
  }
}
