// surfaceRegistry.ts — Add surfaces here. No hardcoding elsewhere.

export type SurfaceId = 'calendar' | 'tasks' | 'mail' | 'artifacts' | string;

export interface Surface {
  id: SurfaceId;
  label: string;
  icon?: string; // lucide or custom icon name
  href?: string; // optional deep-link override
}

const registry: Map<SurfaceId, Surface> = new Map([
  ['calendar', { id: 'calendar', label: 'Calendar', icon: 'calendar' }],
  ['tasks',    { id: 'tasks',    label: 'Tasks',    icon: 'check-square' }],
  ['mail',     { id: 'mail',     label: 'Mail',     icon: 'mail' }],
  ['artifacts',{ id: 'artifacts',label: 'Artifacts',icon: 'file-text' }],
]);

export function registerSurface(surface: Surface): void {
  registry.set(surface.id, surface);
}

export function getSurface(id: SurfaceId): Surface | undefined {
  return registry.get(id);
}

export function getAllSurfaces(): Surface[] {
  return Array.from(registry.values());
}
