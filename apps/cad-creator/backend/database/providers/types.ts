import { ProjectState } from '../../../shared/cad';

export interface DatabaseProvider {
  readonly name: string;
  init(): Promise<void>;
  getProject(id: string): Promise<ProjectState | null>;
  saveProject(project: ProjectState): Promise<ProjectState>;
  listProjects(): Promise<{ id: string; name: string; updatedAt: number; version: number }[]>;
  deleteProject(id: string): Promise<boolean>;
}
