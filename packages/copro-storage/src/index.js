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

/**
 * Browser-owned original media bytes. Project JSON stores stable IDs, never object URLs.
 * No network, tenant IDs, or duplicate project writer. IndexedDB's structured clone
 * preserves File/Blob bytes, which can be reopened after a page or desktop relaunch.
 */
export class BrowserIndexedDbMediaStore {
  #dbPromise = null;

  constructor({ indexedDB = globalThis.indexedDB, name = 'copro.media.v1', storeName = 'sources' } = {}) {
    if (!indexedDB || typeof indexedDB.open !== 'function') throw new Error('copro_media_indexeddb_unavailable');
    this.factory = indexedDB;
    this.name = name;
    this.storeName = storeName;
  }

  open() {
    if (!this.#dbPromise) {
      this.#dbPromise = new Promise((resolve, reject) => {
        const request = this.factory.open(this.name, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName, { keyPath: 'id' });
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); this.#dbPromise = null; };
          resolve(db);
        };
        request.onerror = () => reject(request.error ?? new Error('copro_media_open_failed'));
        request.onblocked = () => reject(new Error('copro_media_upgrade_blocked'));
      }).catch((error) => { this.#dbPromise = null; throw error; });
    }
    return this.#dbPromise;
  }

  async #transaction(mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let result;
      const transaction = db.transaction(this.storeName, mode);
      const request = operation(transaction.objectStore(this.storeName));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('copro_media_transaction_aborted'));
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('copro_media_transaction_failed'));
    });
  }

  async put(item) {
    if (!item?.id || !item?.file || typeof item.name !== 'string') throw new Error('copro_media_invalid_source');
    const stored = {
      id: item.id,
      name: item.name,
      kind: item.kind,
      durationUs: item.durationUs,
      waveform: item.waveform,
      thumbnails: item.thumbnails,
      file: item.file,
      savedAt: new Date().toISOString(),
    };
    await this.#transaction('readwrite', (store) => store.put(stored));
    return stored;
  }

  async get(id) { return (await this.#transaction('readonly', (store) => store.get(id))) ?? null; }
  async list() { return (await this.#transaction('readonly', (store) => store.getAll())) ?? []; }
  async remove(id) { await this.#transaction('readwrite', (store) => store.delete(id)); }
}
