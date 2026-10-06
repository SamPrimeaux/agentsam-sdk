// Local-first portable campaign project store: durable across app reloads, scoped per account.
// Never masquerades as an FNF account or publishes to external channels.
// @ts-ignore Portable JS domain contract.
import { createCampaignProject, validateCampaignProject } from '@inneranimalmedia/agentsam-campaign/project';

export const CAMPAIGNS_CHANGED = 'agentsam:campaign-projects-changed';
export type CampaignProject = ReturnType<typeof createCampaignProject>;
let handle: Promise<IDBDatabase> | null = null;

function open() {
  return handle ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('agentsam-campaign-projects-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('projects'))
        request.result.createObjectStore('projects', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { handle = null; reject(request.error); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, cb: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const req = cb(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error || new Error('campaign_transaction_aborted'));
    tx.onerror = () => reject(tx.error || new Error('campaign_write_failed'));
  });
}
function announce() { window.dispatchEvent(new Event(CAMPAIGNS_CHANGED)); }

export const campaignProjectStore = {
  async list(accountId: string): Promise<CampaignProject[]> {
    const all = await transaction<CampaignProject[]>('readonly', (store) => store.getAll());
    return all.filter((project) => project.accountId === accountId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(accountId: string, id: string): Promise<CampaignProject | undefined> {
    const project = await transaction<CampaignProject | undefined>('readonly', (store) => store.get(id));
    return project?.accountId === accountId ? project : undefined;
  },
  async create(accountId: string, name: string): Promise<CampaignProject> {
    const project = createCampaignProject({ id: 'campaign_' + crypto.randomUUID(), accountId, name, now: new Date().toISOString() });
    return this.save(accountId, project);
  },
  async save(accountId: string, input: unknown): Promise<CampaignProject> {
    const project = validateCampaignProject(input);
    if (project.accountId !== accountId) throw new Error('campaign_account_mismatch');
    const current = await this.get(accountId, project.id);
    if (current && current.updatedAt !== project.updatedAt) throw new Error('campaign_conflict_reload_required');
    const saved = { ...project, updatedAt: new Date().toISOString() };
    await transaction('readwrite', (store) => store.put(saved));
    announce();
    return saved;
  },
  async remove(accountId: string, id: string) {
    if (!(await this.get(accountId, id))) throw new Error('campaign_not_found');
    await transaction('readwrite', (store) => store.delete(id));
    announce();
  },
  async importDraft(accountId: string, input: unknown) {
    const project = validateCampaignProject(input);
    return this.save(accountId, {
      ...project, id: 'campaign_' + crypto.randomUUID(), accountId, status: 'draft',
      createdAt: new Date().toISOString(), updatedAt: '',
    });
  },
};
