import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { TEMPLATES } from './templates';

export type CadAccessMode = 'owner' | 'public-demo';

export function isTrustedLocalCadHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Owner access is enabled only by an explicit local-shell request on loopback. */
export function resolveCadAccessMode(requested: string | null, hostname: string): CadAccessMode {
  return requested === 'owner' && isTrustedLocalCadHost(hostname) ? 'owner' : 'public-demo';
}

function newPublicProjectId(): string {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `demo_${randomId}`;
}

/**
 * A public user gets a private in-memory copy with a new project identity.
 * Never mutate the catalog template or reuse the owner's DreamHouse project ID.
 */
export function cloneProjectForPublicUser(source: ProjectState, name: string): ProjectState {
  const project = JSON.parse(JSON.stringify(source)) as ProjectState;
  project.id = newPublicProjectId();
  project.name = name;
  project.updatedAt = Date.now();
  return project;
}

export function createPublicExampleProject(): ProjectState {
  return cloneProjectForPublicUser(TEMPLATES.modern_villa, 'Example Home');
}
