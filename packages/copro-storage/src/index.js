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
 * Durable browser-local source-media bytes. Projects remain portable CoPro documents:
 * source files are stored independently and referenced by their stable assetId.
 * No Cloudflare/IAM/account identity is introduced in this portable adapter.
 */
export class BrowserIndexedDbMediaStore {
  constructor({ indexedDB = globalThis.indexedDB, databaseName, name, storeName } = {}) {
    if (storeName && !["media","sources"].includes(storeName)) throw new Error("copro_media_store_invalid");
    if (!indexedDB || typeof indexedDB.open !== "function") throw new Error("copro_media_indexeddb_unavailable");
    this.factory = indexedDB;
    this.databaseName = databaseName ?? name ?? "copro.media.v1";
    this.dbPromise = null;
  }

  async open() {
    if (!this.factory) throw new Error("copro_media_indexeddb_unavailable");
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.factory.open(this.databaseName, 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          const media = db.objectStoreNames.contains("media")
            ? request.transaction?.objectStore("media")
            : db.createObjectStore("media", { keyPath: "id" });
          // Move legacy MovieMode files into the canonical store without dropping originals.
          if (request.transaction && media && db.objectStoreNames.contains("sources")) {
            const cursor = request.transaction.objectStore("sources").openCursor();
            cursor.onsuccess = () => {
              if (!cursor.result) return;
              const source = cursor.result.value;
              if (source?.id && source?.file) media.put(source);
              cursor.result.continue();
            };
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("copro_media_open_failed"));
        request.onblocked = () => reject(new Error("copro_media_open_blocked"));
      }).catch((error) => { this.dbPromise = null; throw error; });
    }
    return this.dbPromise;
  }

  // Preserve the original File bytes alongside MovieMode timeline metadata.
  async put(item) {
    if (typeof item?.id !== "string" || !item.id || !(item.file instanceof Blob)) throw new Error("copro_media_invalid_source");
    const db = await this.open();
    const record = {
      ...item, name: item.name ?? item.file.name ?? item.id,
      type: item.file.type || "application/octet-stream",
      size: item.file.size, lastModified: item.file.lastModified ?? Date.now(),
      savedAt: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("media", "readwrite");
      transaction.objectStore("media").put(record);
      transaction.oncomplete = () => resolve(record);
      transaction.onabort = () => reject(transaction.error ?? new Error("copro_media_put_aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("copro_media_put_failed"));
    });
  }
  async get(id) { return (await this.load(id)) ?? null; }
  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction("media", "readonly").objectStore("media").getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error ?? new Error("copro_media_list_failed"));
    });
  }

  async save(id, file) {
    if (typeof id !== "string" || !id) throw new Error("copro_media_id_required");
    if (!(file instanceof Blob)) throw new Error("copro_media_blob_required");
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("media", "readwrite");
      transaction.objectStore("media").put({
        id, file,
        name: typeof file.name === "string" ? file.name : id,
        type: file.type || "application/octet-stream",
        size: file.size, lastModified: file.lastModified ?? Date.now(),
      });
      // Success means the write transaction has committed, not merely been queued.
      transaction.oncomplete = () => resolve({ id, name: file.name ?? id, size: file.size });
      transaction.onabort = () => reject(transaction.error ?? new Error("copro_media_save_aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("copro_media_save_failed"));
    });
  }

  async load(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction("media", "readonly").objectStore("media").get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("copro_media_load_failed"));
    });
  }

  async loadMany(ids) {
    const unique = [...new Set(ids)].filter((id) => typeof id === "string" && id);
    const found = await Promise.all(unique.map((id) => this.load(id)));
    return found.filter(Boolean);
  }

  async remove(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("media", "readwrite");
      transaction.objectStore("media").delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("copro_media_remove_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("copro_media_remove_aborted"));
    });
  }
}
