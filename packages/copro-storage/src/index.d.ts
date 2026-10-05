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
