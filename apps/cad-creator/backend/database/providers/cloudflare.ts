import { DatabaseProvider } from './types';
import { ProjectState } from '../../../shared/cad';

/**
 * Cloudflare D1 SQL Database Provider
 *
 * Implements persistent project storage against Cloudflare D1 SQL.
 * Schema:
 * CREATE TABLE IF NOT EXISTS cad_projects (
 *   id TEXT PRIMARY KEY,
 *   name TEXT NOT NULL,
 *   data JSON NOT NULL,
 *   version INTEGER NOT NULL DEFAULT 1,
 *   updated_at INTEGER NOT NULL
 * );
 */
export class CloudflareD1DatabaseProvider implements DatabaseProvider {
  public readonly name = 'cloudflare-d1';
  private d1Instance: any;

  constructor(d1Binding?: any) {
    this.d1Instance = d1Binding || (globalThis as any).DB;
  }

  public async init(): Promise<void> {
    if (!this.d1Instance) {
      console.warn('[CloudflareD1DatabaseProvider] No D1 binding detected. Operating in simulated D1 mode.');
      return;
    }

    await this.d1Instance.exec(`
      CREATE TABLE IF NOT EXISTS cad_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  public async getProject(id: string): Promise<ProjectState | null> {
    if (!this.d1Instance) {
      return null;
    }

    const stmt = this.d1Instance.prepare('SELECT data FROM cad_projects WHERE id = ?').bind(id);
    const result = await stmt.first();
    if (!result || !result.data) {
      return null;
    }

    try {
      return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
    } catch {
      return null;
    }
  }

  public async saveProject(project: ProjectState): Promise<ProjectState> {
    const updatedProject: ProjectState = {
      ...project,
      updatedAt: Date.now(),
      version: (project.version || 0) + 1,
    };

    if (!this.d1Instance) {
      return updatedProject;
    }

    const jsonStr = JSON.stringify(updatedProject);
    const stmt = this.d1Instance.prepare(`
      INSERT INTO cad_projects (id, name, data, version, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        data = excluded.data,
        version = excluded.version,
        updated_at = excluded.updated_at;
    `).bind(updatedProject.id, updatedProject.name, jsonStr, updatedProject.version, updatedProject.updatedAt);

    await stmt.run();
    return updatedProject;
  }

  public async listProjects(): Promise<{ id: string; name: string; updatedAt: number; version: number }[]> {
    if (!this.d1Instance) return [];

    const stmt = this.d1Instance.prepare('SELECT id, name, updated_at, version FROM cad_projects ORDER BY updated_at DESC');
    const { results } = await stmt.all();
    return (results || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updated_at,
      version: r.version,
    }));
  }

  public async deleteProject(id: string): Promise<boolean> {
    if (!this.d1Instance) return false;

    const stmt = this.d1Instance.prepare('DELETE FROM cad_projects WHERE id = ?').bind(id);
    const res = await stmt.run();
    return Boolean(res.success);
  }
}
