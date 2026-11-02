export declare function createCoProTransitionRenderer(canvas:HTMLCanvasElement,options?:{contextAttributes?:WebGLContextAttributes}):{
 compile(type:string):unknown;
 render(options:{transition:{type:string;durationUs:number;parameters?:Record<string,unknown>};from:CanvasImageSource;to:CanvasImageSource;timeUs:number}):unknown;
 dispose():void;
};
export declare const TRANSITIONS: ReadonlyArray<{id:string;name:string;parameters:Record<string,unknown>}>;
export declare function findTransition(type:string):unknown;
export declare function normalizeTransition(input:unknown):unknown;
export declare function transitionProgress(timeUs:number,durationUs:number):number;
export declare function transitionFragmentSource(def:unknown,precision?:string):string;
