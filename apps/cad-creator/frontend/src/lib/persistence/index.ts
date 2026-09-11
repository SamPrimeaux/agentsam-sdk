import { DesignProject, ProjectRevisionReceipt } from '@inneranimalmedia/agentsam-cad-shared';
import { ProjectRepository, ProjectSummary } from './types';
import { sanitizeDesignProject } from '@inneranimalmedia/agentsam-cad-shared';

const STORAGE_PREFIX = 'agentsam_cad_project_';
const REVISIONS_PREFIX = 'agentsam_cad_revisions_';
const INDEX_KEY = 'agentsam_cad_projects_index';

export class LocalProjectRepository implements ProjectRepository {
  private getStoredIndex(): string[] {
    try {
      const data = localStorage.getItem(INDEX_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveStoredIndex(ids: string[]) {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
    } catch {}
  }

  async getProject(id: string): Promise<DesignProject | null> {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + id);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return sanitizeDesignProject(parsed);
    } catch {
      return null;
    }
  }

  async saveProject(project: DesignProject, message: string = 'Autosaved edit'): Promise<ProjectRevisionReceipt> {
    const sanitized = sanitizeDesignProject(project);
    sanitized.updatedAt = Date.now();
    sanitized.version = (sanitized.version || 1) + 1;

    try {
      localStorage.setItem(STORAGE_PREFIX + sanitized.id, JSON.stringify(sanitized));

      // Update index
      const index = this.getStoredIndex();
      if (!index.includes(sanitized.id)) {
        index.push(sanitized.id);
        this.saveStoredIndex(index);
      }

      // Append revision
      const revKey = REVISIONS_PREFIX + sanitized.id;
      const existingRevRaw = localStorage.getItem(revKey);
      const revs: ProjectRevisionReceipt[] = existingRevRaw ? JSON.parse(existingRevRaw) : [];

      const receipt: ProjectRevisionReceipt = {
        revisionId: `rev_${sanitized.version}_${Date.now()}`,
        projectId: sanitized.id,
        revisionNumber: sanitized.version,
        timestamp: Date.now(),
        message,
        author: 'Current User',
        wallsCount: sanitized.walls.length,
        roomsCount: sanitized.rooms.length,
        parametricCount: (sanitized.parametricObjects || []).length,
      };

      revs.unshift(receipt);
      // Keep up to 20 revisions
      localStorage.setItem(revKey, JSON.stringify(revs.slice(0, 20)));

      return receipt;
    } catch (err: any) {
      throw new Error(`Failed to save project locally: ${err.message}`);
    }
  }

  async listRevisions(projectId: string): Promise<ProjectRevisionReceipt[]> {
    try {
      const raw = localStorage.getItem(REVISIONS_PREFIX + projectId);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async restoreRevision(projectId: string, revisionId: string): Promise<DesignProject> {
    const proj = await this.getProject(projectId);
    if (!proj) throw new Error(`Project ${projectId} not found`);
    return proj;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const ids = this.getStoredIndex();
    const summaries: ProjectSummary[] = [];

    for (const id of ids) {
      const p = await this.getProject(id);
      if (p) {
        summaries.push({
          id: p.id,
          name: p.name,
          units: p.units || 'in',
          wallsCount: p.walls.length,
          roomsCount: p.rooms.length,
          parametricCount: (p.parametricObjects || []).length,
          updatedAt: p.updatedAt,
          version: p.version,
        });
      }
    }

    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteProject(id: string): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_PREFIX + id);
      localStorage.removeItem(REVISIONS_PREFIX + id);
      const ids = this.getStoredIndex().filter((i) => i !== id);
      this.saveStoredIndex(ids);
    } catch {}
  }
}

let defaultRepository: ProjectRepository = new LocalProjectRepository();

export function getProjectRepository(): ProjectRepository {
  return defaultRepository;
}

export function setProjectRepository(repo: ProjectRepository): void {
  defaultRepository = repo;
}
