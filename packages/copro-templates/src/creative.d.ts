export type CoProCreativeTemplate = {
  id: string; name: string; description: string;
  canvas: { width: number; height: number; frameRate: number };
  metadata: { creative: {
    category: string; durationUs: number; scene: string;
    resourceKind?: "project_template"; featured?: boolean;
  } };
};
export type CoProProjectTemplateSummary = {
  id: string; name: string; description: string; category: string;
  durationUs: number; featured: boolean; resourceKind: "project_template";
  aspectRatio: string;
};
export const CREATIVE_TEMPLATES: CoProCreativeTemplate[];
export function listProjectTemplates(options?: { featuredOnly?: boolean }): CoProProjectTemplateSummary[];
export function createCreativeProject(id: string, options: { projectId: string; slotValues?: Record<string, unknown>; parameters?: Record<string, unknown>; canvas?: { width: number; height: number; frameRate: number }; now?: string | Date }): any;
export function renderCreativeProjectFrame(project: any, timeUs: number, options?: Record<string, unknown>): string | null;
