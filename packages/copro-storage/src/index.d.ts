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

export type CoProStoredMediaItem = {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  file: File;
  durationUs?: number;
  waveform?: number[];
  savedAt?: string;
};

export declare class BrowserIndexedDbMediaStore {
  constructor(options?: { indexedDB?: IDBFactory; name?: string; storeName?: string });
  open(): Promise<IDBDatabase>;
  put(item: CoProStoredMediaItem): Promise<CoProStoredMediaItem>;
  get(id: string): Promise<CoProStoredMediaItem | null>;
  list(): Promise<CoProStoredMediaItem[]>;
  remove(id: string): Promise<void>;
}
