import type { CoProProject } from "@inneranimalmedia/copro-project";

export declare class MemoryProjectStore {
  save(project: CoProProject): Promise<CoProProject>;
  load(id: string): Promise<CoProProject | null>;
  list(): Promise<CoProProject[]>;
  remove(id: string): Promise<boolean>;
}

export declare class BrowserLocalStorageProjectStore {
  constructor(options?: { storage?: Storage; prefix?: string });
  save(project: CoProProject): Promise<CoProProject>;
  load(id: string): Promise<CoProProject | null>;
  loadRecent(): Promise<CoProProject | null>;
  list(): Promise<CoProProject[]>;
  remove(id: string): Promise<void>;
}
export type CoProStoredMedia = {
  id: string;
  file: File | Blob;
  name: string;
  type: string;
  size: number;
  lastModified: number;
};
export declare class BrowserIndexedDbMediaStore {
  constructor(options?: { indexedDB?: IDBFactory; databaseName?: string });
  open(): Promise<IDBDatabase>;
  save(id: string, file: File | Blob): Promise<{id: string;name: string;size: number}>;
  load(id: string): Promise<CoProStoredMedia | null>;
  loadMany(ids: Iterable<string>): Promise<CoProStoredMedia[]>;
  remove(id: string): Promise<void>;
}
