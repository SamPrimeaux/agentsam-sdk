// Theme project content is owned by the authenticated CMS v2 API (D1 pointers + R2 revisions).
// IndexedDB remains only for active-view preference and one-time migration of older local drafts.
// @ts-ignore Public portable JavaScript theme project contract has no bundled TS declaration.
import { validateThemeProject } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
export const THEME_PROJECTS_CHANGED = 'agentsam:theme-projects-changed';
const API = '/api/admin/cms/theme-projects';
let database: Promise<IDBDatabase> | undefined;

function db() {
  return database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('agentsam-theme-projects-v1', 2);
    request.onupgradeneeded = () => {
      for (const name of ['projects', 'preferences']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function operation<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction('projects', mode);
    const request = run(transaction.objectStore('projects'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('theme_project_transaction_aborted'));
  });
}
async function jsonRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { credentials: 'include', ...init });
  let data: any = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data || {};
}
function summaryOf(project: any) {
  return {
    id: project.id, name: project.name, sourceThemeId: project.sourceThemeId || null,
    packageName: project.sourcePackage || null, sourcePackageVersion: project.sourcePackageVersion || null,
    sourcePreviewUrl: project.sourcePreviewUrl || null, revision: Number(project.revision || 0),
    version: project.version || '0.1.0', createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null, pages: (project.pages || []).map((page: any) => ({ slug: page.slug, title: page.title })),
  };
}
async function legacyProjects() {
  return operation<any[]>('readonly', (store) => store.getAll());
}
async function removeLegacy(id: string) {
  await operation('readwrite', (store) => store.delete(id));
}
async function createRemote(value: unknown) {
  const project = validateThemeProject(value);
  const candidate = { ...project, revision: 0 };
  const data = await jsonRequest(API, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: candidate }),
  });
  return data.project;
}

export const themeProjectStore = {
  async list() {
    const data = await jsonRequest(API);
    const summaries: any[] = [...(data.projects || [])];
    const known = new Set(summaries.map((project) => project.id));
    // Migrate existing browser-only drafts into the CMS before displaying the inventory.
    // Keep the local copy until the server confirms the migration.
    for (const old of await legacyProjects().catch(() => [])) {
      if (known.has(old.id)) {
        await removeLegacy(old.id).catch(() => {});
        continue;
      }
      try {
        const migrated = await createRemote(old);
        summaries.push(summaryOf(migrated));
        known.add(migrated.id);
        await removeLegacy(old.id);
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status === 409) {
          const existing = await this.get(old.id);
          if (existing) {
            summaries.push(summaryOf(existing));
            known.add(existing.id);
            await removeLegacy(old.id);
            continue;
          }
        }
        throw error;
      }
    }
    const projects = await Promise.all(summaries.map((summary) => this.get(summary.id)));
    return projects.filter(Boolean);
  },
  async get(id: string) {
    try {
      const data = await jsonRequest(`${API}/${encodeURIComponent(id)}`);
      return data.project || undefined;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status !== 404) throw error;
      const legacy = await operation<any>('readonly', (store) => store.get(id)).catch(() => undefined);
      if (!legacy) return undefined;
      const migrated = await createRemote(legacy);
      await removeLegacy(id).catch(() => {});
      return migrated;
    }
  },
  async save(value: unknown, options: { expectedVersion?: number } = {}) {
    const project = validateThemeProject(value);
    const expectedVersion = options.expectedVersion ?? Math.max(0, Number(project.revision || 0) - 1);
    const updating = expectedVersion > 0;
    const path = updating ? `${API}/${encodeURIComponent(project.id)}` : API;
    const data = await jsonRequest(path, {
      method: updating ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updating ? { project, expected_version: expectedVersion } : { project: { ...project, revision: 0 } }),
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return data.project;
  },
  async install(slug: string, project: unknown, metadata: { packageName: string; packageVersion: string; previewUrl?: string }) {
    const data = await jsonRequest(`/api/admin/cms/themes/${encodeURIComponent(slug)}/install`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: validateThemeProject(project),
        package_name: metadata.packageName,
        package_version: metadata.packageVersion,
        preview_url: metadata.previewUrl || null,
      }),
    });
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return data.project;
  },
};

export async function getActiveThemeId(): Promise<string | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('preferences').objectStore('preferences').get('active-theme');
    request.onsuccess = () => resolve(request.result?.themeId);
    request.onerror = () => reject(request.error);
  });
}
export async function setActiveThemeId(themeId: string) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('preferences', 'readwrite');
    tx.objectStore('preferences').put({ id: 'active-theme', themeId });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
}
