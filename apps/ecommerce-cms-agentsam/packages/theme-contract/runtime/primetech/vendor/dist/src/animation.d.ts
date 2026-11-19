import type { AnimationTrack, SceneAnimation } from './types.js';
export declare function sampleAnimationTrack(track: AnimationTrack, time: number): unknown;
export declare function normalizeAnimationTime(animation: SceneAnimation, time: number): number;
export interface SampleAnimationOptions {
    /** Set false for scroll scrubbing: a loop must hold its final frame at 100%. */
    wrap?: boolean;
}
export declare function sampleAnimation(animation: SceneAnimation, time: number, options?: SampleAnimationOptions): Array<{
    targetId: string;
    property: string;
    value: unknown;
}>;
