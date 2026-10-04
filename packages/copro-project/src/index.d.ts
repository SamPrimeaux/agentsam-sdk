export declare const COPRO_PROJECT_SCHEMA: "copro.project.v1";
export declare const COPRO_TIMEBASE: Readonly<{ unit: "microsecond"; ticksPerSecond: 1000000 }>;

export type CoProClip = {
  id: string;
  assetId: string;
  startUs: number;
  durationUs: number;
  inUs: number;
  layer: number;
  muted: boolean;
  metadata: Record<string, unknown>;
};

export type CoProTrack = {
  id: string;
  kind: "video" | "audio" | "overlay" | "captions";
  name?: string;
  clips: CoProClip[];
};

export type CoProProject = {
  schema: "copro.project.v1";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  timebase: { unit: "microsecond"; ticksPerSecond: 1000000 };
  canvas: { width: number; height: number; frameRate: number };
  tracks: CoProTrack[];
  metadata: Record<string, unknown>;
};

export declare function createCoProProject(input?: {
  id?: string;
  title?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  now?: string | number | Date;
}): CoProProject;

export declare function createTrack(input?: {
  id?: string;
  kind?: CoProTrack["kind"];
  name?: string;
}): CoProTrack;

export declare function createClip(input?: {
  id?: string;
  assetId?: string;
  startUs?: number;
  durationUs?: number;
  inUs?: number;
  layer?: number;
  muted?: boolean;
  metadata?: Record<string, unknown>;
}): CoProClip;

export declare function validateCoProProject(project: unknown): { ok: boolean; errors: string[] };
export declare function serializeCoProProject(project: CoProProject): string;
export declare function parseCoProProject(serialized: string | CoProProject): CoProProject;
export declare function cloneCoProProject(project: CoProProject): CoProProject;
