import { ProjectState, StudioSceneResponse } from '../../../shared/cad';
import { DatabaseProvider } from '../../database/providers/types';
import { SqliteDatabaseProvider } from '../../database/providers/sqlite';
import { CloudflareD1DatabaseProvider } from '../../database/providers/cloudflare';
import { MemoryDatabaseProvider } from '../../database/providers/memory';

export class CadProjectService {
  private static dbProvider: DatabaseProvider;

  public static getProvider(): DatabaseProvider {
    if (!this.dbProvider) {
      if (process.env.CF_D1_ENABLED) {
        this.dbProvider = new CloudflareD1DatabaseProvider();
      } else if (process.env.STORAGE_PROVIDER === 'memory') {
        this.dbProvider = new MemoryDatabaseProvider();
      } else {
        this.dbProvider = new SqliteDatabaseProvider();
      }
      this.dbProvider.init().catch((err) => console.warn('[CadProjectService] DB init warning:', err));
    }
    return this.dbProvider;
  }

  public static async getProject(id = 'default_project'): Promise<ProjectState | null> {
    const provider = this.getProvider();
    return provider.getProject(id);
  }

  public static async saveProject(project: ProjectState): Promise<ProjectState> {
    const provider = this.getProvider();
    return provider.saveProject(project);
  }

  public static async listProjects() {
    const provider = this.getProvider();
    return provider.listProjects();
  }

  public static calculateScene(project: ProjectState): StudioSceneResponse {
    let minX = 0, minY = 0, minZ = 0;
    let maxX = 360, maxY = 240, maxZ = project.ceilingHeight || 108;

    if (Array.isArray(project.walls) && project.walls.length > 0) {
      const xs = project.walls.flatMap((w) => [w.x1, w.x2]);
      const ys = project.walls.flatMap((w) => [w.y1, w.y2]);
      minX = Math.min(...xs);
      maxX = Math.max(...xs);
      minY = Math.min(...ys);
      maxY = Math.max(...ys);
    }

    return {
      success: true,
      scene_id: project.id || 'active_scene',
      units: project.units || 'in',
      counts: {
        walls: project.walls?.length || 0,
        doors: project.doors?.length || 0,
        windows: project.windows?.length || 0,
        rooms: project.rooms?.length || 0,
        furniture: project.furniture?.length || 0,
        lights: 1,
      },
      bounding_box: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    };
  }
}
