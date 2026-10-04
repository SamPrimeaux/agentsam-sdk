// IndexedDB is durable per installation. It stores authoring projects, never shell localStorage.
// @ts-ignore Portable JavaScript module shipped by the ecommerce CMS package.
import { validateThemeProject } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';
export const THEME_PROJECTS_CHANGED = 'agentsam:theme-projects-changed';
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('agentsam-theme-projects-v1', 2);
    request.onupgradeneeded = () => { for (const name of ['projects', 'preferences']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' }); };
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
export const themeProjectStore = {
  list: () => operation<any[]>('readonly', (store) => store.getAll()),
  get: (id: string) => operation<any>('readonly', (store) => store.get(id)),
  async save(value: unknown) {
    const project = validateThemeProject(value);
    await operation('readwrite', (store) => store.put(project));
    window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
    return project;
  },
};

export async function getActiveThemeId(): Promise<string | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => { const request = database.transaction('preferences').objectStore('preferences').get('active-theme'); request.onsuccess = () => resolve(request.result?.themeId); request.onerror = () => reject(request.error); });
}
export async function setActiveThemeId(themeId: string) {
  const database = await db();
  await new Promise<void>((resolve, reject) => { const tx = database.transaction('preferences', 'readwrite'); tx.objectStore('preferences').put({ id: 'active-theme', themeId }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  window.dispatchEvent(new Event(THEME_PROJECTS_CHANGED));
}
