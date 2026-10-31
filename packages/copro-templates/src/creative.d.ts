export type CoProCreativeTemplate = {
  id: string; name: string; description: string;
  canvas: { width: number; height: number; frameRate: number };
  metadata: { creative: { category: string; durationUs: number; scene: string } };
};
export const CREATIVE_TEMPLATES: CoProCreativeTemplate[];
export function createCreativeProject(id: string, options?: { projectId?: string; slotValues?: Record<string, unknown>; parameters?: Record<string, unknown>; canvas?: { width: number; height: number; frameRate: number }; now?: string | Date }): any;
export function renderCreativeProjectFrame(project: any, timeUs: number, options?: Record<string, unknown>): string | null;
