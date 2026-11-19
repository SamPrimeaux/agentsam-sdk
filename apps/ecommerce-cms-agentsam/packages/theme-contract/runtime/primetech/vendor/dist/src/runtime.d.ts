import * as THREE from 'three';
import { type ThreeViewportHandle } from '@inneranimalmedia/agentsam-3d-viewer';
import type { SceneAsset, SceneDocument } from './types.js';
type AssetSource = string | URL | ArrayBuffer | ArrayBufferView | Blob;
export interface SceneRuntimeOptions {
    container: HTMLElement;
    document: SceneDocument;
    assetBaseUrl?: string | URL;
    resolveAsset?: (asset: SceneAsset) => AssetSource | Promise<AssetSource>;
    autoPlay?: string | false;
    playbackRate?: number;
    controls?: boolean;
    onAnimationChange?: (animationId: string | null, time: number) => void;
    onNodeEvent?: (nodeId: string, event: 'pointerenter' | 'pointerleave' | 'click') => void;
}
export interface SceneRuntimeHandle {
    readonly viewport: ThreeViewportHandle;
    readonly scene: THREE.Scene;
    readonly camera: THREE.Camera;
    readonly currentAnimation: string | null;
    readonly currentTime: number;
    play(animationId: string, options?: {
        restart?: boolean;
        time?: number;
    }): void;
    pause(): void;
    seek(time: number): void;
    /** Select and sample an animation at an exact time without starting playback. */
    seekAnimation(animationId: string, time: number, options?: {
        wrap?: boolean;
    }): void;
    /** Drive a mesh's authored radial reveal from UI, scroll, or pointer interaction. */
    setRevealRadius(nodeId: string, radius: number): void;
    setPlaybackRate(rate: number): void;
    render(): void;
    dispose(): void;
}
export declare function createSceneRuntime(options: SceneRuntimeOptions): Promise<SceneRuntimeHandle>;
export {};
