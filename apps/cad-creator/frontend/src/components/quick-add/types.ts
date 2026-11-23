import type { FurnitureCategory } from '@inneranimalmedia/agentsam-cad-shared';

export type QuickAddTab = 'templates' | 'objects' | 'scenes';
export type QuickAddStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface QuickAddItem {
  id: string;
  tab: QuickAddTab;
  kind: string;
  app: string;
  category: string;
  pack: string | null;
  title: string;
  description: string;
  specs: Record<string, unknown>;
  compatibleApps: string[];
  renderer: string | null;
  ref: string | null;
  previewUrl: string | null;
  payloadUrl: string | null;
  assetUrl: string | null;
}

export interface FurniturePreset {
  type: string;
  name: string;
  category: FurnitureCategory;
  w: number;
  d: number;
  h: number;
  color?: string;
  description: string;
}
