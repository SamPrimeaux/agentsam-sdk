import type { CoProProject, CoProClip } from "@inneranimalmedia/copro-project";

export declare function projectDurationUs(project: CoProProject): number;
export declare function sortedTimelineClips(project: CoProProject): Array<{
  trackId: string;
  trackKind: string;
  trackIndex: number;
  clip: CoProClip;
}>;
export declare function timeUsToPixels(timeUs: number, options?: { pixelsPerSecond?: number }): number;
export declare function pixelsToTimeUs(pixels: number, options?: { pixelsPerSecond?: number }): number;
export declare function clampPlayheadUs(project: CoProProject, timeUs: number): number;


export declare function collectSnapPointsUs(project: CoProProject, options?: {
  excludeClipId?: string;
  includeGrid?: boolean;
  gridUs?: number;
  playheadUs?: number;
}): number[];
export declare function snapTimeUs(timeUs: number, snapPointsUs: number[], thresholdUs?: number): number;
