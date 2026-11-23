import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { createEmptyCadProject } from './create-empty-project';

export type CadAccessMode = 'owner' | 'public-demo' | 'hosted-project';

export function isTrustedLocalCadHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Owner access is enabled only by an explicit local-shell request on loopback. */
export function resolveCadAccessMode(requested: string | null, hostname: string): CadAccessMode {
  if (requested === 'owner' && isTrustedLocalCadHost(hostname)) return 'owner';
  if (requested === 'project') return 'hosted-project';
  return 'public-demo';
}

function newPublicProjectId(): string {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `demo_${randomId}`;
}

/** A public user receives a private in-memory copy; registered studio starters are fetched separately. */
export function cloneProjectForPublicUser(source: ProjectState, name: string): ProjectState {
  const project = JSON.parse(JSON.stringify(source)) as ProjectState;
  project.id = newPublicProjectId();
  project.name = name;
  project.version = 1;
  project.updatedAt = Date.now();
  return project;
}

/** The public editor starts empty; project content comes only from registered studio_templates payloads. */
export function createPublicExampleProject(): ProjectState {
  const project = createEmptyCadProject();
  project.id = newPublicProjectId();
  project.name = 'Untitled CAD project';
  project.updatedAt = Date.now();
  return project;
}
