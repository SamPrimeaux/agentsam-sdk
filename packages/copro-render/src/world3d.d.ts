import type { CoProProject } from '@inneranimalmedia/copro-project';
export declare const COPRO_WORLD3D_FRAME_SCHEMA: 'copro.world3d-frame.v1';
export type World3DKeyframe = { timeUs:number; x?:number;y?:number;z?:number;rotationYDeg?:number;scale?:number;opacity?:number };
export type World3DFrameItem = {clipId:string;assetId:string;trackId:string;trackIndex:number;sourceTimeUs:number;sourceSeconds:number;volume:number;animationIndex?:number;animationName?:string;objectId?:string;kind:string;transform:Partial<World3DKeyframe>;visible:boolean};
export type World3DFrame = {schema:'copro.world3d-frame.v1';projectId:string;timeUs:number;objects:World3DFrameItem[];media:World3DFrameItem[];scenes:{clipId:string;trackIndex:number;beat:unknown;sourceTimeUs:number}[];durationUs:number};
export declare function interpolateWorld3DKeyframes(frames:World3DKeyframe[]|undefined,timeUs:number):Partial<World3DKeyframe>;
export declare function evaluateWorld3DFrame(project:CoProProject,timeUs:number):World3DFrame;
export declare function createWorld3DRenderer(options:{applyFrame:(frame:World3DFrame)=>void|Promise<void>;canvas?:HTMLCanvasElement;onFrame?:(frame:World3DFrame)=>void|Promise<void>;mediaRecorderFactory?:(stream:MediaStream,options:MediaRecorderOptions)=>MediaRecorder}):{
 renderFrame(project:CoProProject,timeUs:number):Promise<World3DFrame>;
 captureFrame(project:CoProProject,timeUs:number,format?:string):Promise<{frame:World3DFrame;blob:Blob}>;
 record(project:CoProProject,opts?:{frameRate?:number;mimeType?:string;onProgress?:(progress:number)=>void;signal?:AbortSignal}):Promise<{blob:Blob;mimeType:string;width:number;height:number;frameRate:number;durationUs:number;frameCount?:number;renderBackend?:string}>;
};
