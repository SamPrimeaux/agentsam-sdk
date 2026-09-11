import { DesignProject, ProjectRevisionReceipt } from '../../types';

export interface ProjectSummary {
  id: string;
  name: string;
  units: string;
  wallsCount: number;
  roomsCount: number;
  parametricCount: number;
  updatedAt: number;
  version: number;
}

export interface ProjectRepository {
  getProject(id: string): Promise<DesignProject | null>;
  saveProject(project: DesignProject, message?: string): Promise<ProjectRevisionReceipt>;
  listRevisions(projectId: string): Promise<ProjectRevisionReceipt[]>;
  restoreRevision(projectId: string, revisionId: string): Promise<DesignProject>;
  listProjects(): Promise<ProjectSummary[]>;
  deleteProject(id: string): Promise<void>;
}
