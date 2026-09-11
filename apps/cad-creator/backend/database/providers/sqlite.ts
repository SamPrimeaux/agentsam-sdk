import fs from 'fs';
import path from 'path';
import { DatabaseProvider } from './types';
import { ProjectState } from '../../../shared/cad';
import { CadPathSandbox } from '../../security/paths';

/**
 * Local / File-based Database Provider (SQLite-compatible file persistence)
 */
export class SqliteDatabaseProvider implements DatabaseProvider {
  public readonly name = 'sqlite';
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(CadPathSandbox.getRootDir(), 'projects.json');
  }

  public async init(): Promise<void> {
    CadPathSandbox.ensureDirectoriesExist();
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({}), 'utf8');
    }
  }

  private readStore(): Record<string, ProjectState> {
    try {
      if (!fs.existsSync(this.dbPath)) return {};
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private writeStore(store: Record<string, ProjectState>): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(store, null, 2), 'utf8');
  }

  public async getProject(id: string): Promise<ProjectState | null> {
    const store = this.readStore();
    return store[id] || null;
  }

  public async saveProject(project: ProjectState): Promise<ProjectState> {
    const store = this.readStore();
    const updated: ProjectState = {
      ...project,
      updatedAt: Date.now(),
      version: (project.version || 0) + 1,
    };
    store[project.id] = updated;
    this.writeStore(store);
    return updated;
  }

  public async listProjects(): Promise<{ id: string; name: string; updatedAt: number; version: number }[]> {
    const store = this.readStore();
    return Object.values(store).map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      version: p.version,
    }));
  }

  public async deleteProject(id: string): Promise<boolean> {
    const store = this.readStore();
    if (store[id]) {
      delete store[id];
      this.writeStore(store);
      return true;
    }
    return false;
  }
}
