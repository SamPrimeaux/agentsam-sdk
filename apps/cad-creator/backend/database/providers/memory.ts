import { DatabaseProvider } from './types';
import { ProjectState } from '../../../shared/cad';

/**
 * In-Memory Database Provider
 *
 * Fast volatile store for testing, mock mode, and ephemeral demo sessions.
 */
export class MemoryDatabaseProvider implements DatabaseProvider {
  public readonly name = 'memory';
  private store = new Map<string, ProjectState>();

  public async init(): Promise<void> {
    this.store.clear();
  }

  public async getProject(id: string): Promise<ProjectState | null> {
    return this.store.get(id) || null;
  }

  public async saveProject(project: ProjectState): Promise<ProjectState> {
    const updated: ProjectState = {
      ...project,
      updatedAt: Date.now(),
      version: (project.version || 0) + 1,
    };
    this.store.set(project.id, updated);
    return updated;
  }

  public async listProjects(): Promise<{ id: string; name: string; updatedAt: number; version: number }[]> {
    return Array.from(this.store.values()).map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      version: p.version,
    }));
  }

  public async deleteProject(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}
