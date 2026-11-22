export type ModelFormat = 'glb' | 'gltf' | 'stl';

/** The host passes its own Three.js runtime to avoid bundling a second copy. */
export interface ThreeRuntime {
  THREE: any;
  OrbitControls?: new (camera: any, element: HTMLElement) => any; // required unless controls:false
  GLTFLoader?: new (manager?: any) => any;
  DRACOLoader?: new (manager?: any) => any;
  STLLoader?: new () => any;
}

export interface ThreeViewportOptions {
  ariaLabel?: string;
  role?: string;
  background?: string | number;
  wrapper?: boolean;
  insertCanvasFirst?: boolean;
  minHeight?: string;
  cameraUp?: [number, number, number]; // set before OrbitControls initialization
  cameraProjection?: 'perspective' | 'orthographic';
  orthographicFrustumHeight?: number;
  orthographicZoom?: number;
  fov?: number;
  near?: number;
  far?: number;
  maxPixelRatio?: number;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: WebGLPowerPreference;
  shadowMap?: { enabled?: boolean; type?: any };
  toneMapping?: any;
  toneMappingExposure?: number;
  lights?: boolean;
  showGrid?: boolean;
  gridSize?: number;
  gridDivisions?: number;
  showAxes?: boolean;
  axesSize?: number;
  controls?: boolean; // false for hosts with their own camera controller, e.g. BIM walkthrough
  enableDamping?: boolean;
  dampingFactor?: number;
  minDistance?: number;
  maxDistance?: number;
  autoRender?: boolean;
  onFrame?: (context: { scene: any; camera: any; renderer: ThreeRendererLike; controls: any }) => void;
}

export interface ThreeRendererLike {
  domElement: HTMLCanvasElement;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(value: number): void;
  render(scene: any, camera: any): void;
  dispose(): void;
  shadowMap: any;
  capabilities: { getMaxAnisotropy(): number };
  outputColorSpace: any;
  toneMapping: any;
  toneMappingExposure: number;
}

export interface ThreeViewportHandle {
  root: HTMLElement;
  scene: any;
  camera: any;
  renderer: ThreeRendererLike;
  controls: any | null;
  render(): void;
  fit(object: any, padding?: number): { center: any; size: any; distance: number } | null;
  resize(): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

export interface ModelViewerOptions extends ThreeViewportOptions {
  format?: ModelFormat;
  basePath?: string;
  stlColor?: string;
  fitPadding?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  onLoad?: (model: any) => void;
  onError?: (error: unknown) => void;
  draco?: boolean;
  dracoDecoderPath?: string;
  requireDraco?: boolean;
  withCredentials?: boolean;
  crossOrigin?: string;
}

export interface ModelViewerHandle extends ThreeViewportHandle {
  ready: Promise<any>;
  readonly model: any;
}

export function createThreeViewport(
  container: HTMLElement,
  runtime: ThreeRuntime,
  options?: ThreeViewportOptions,
): ThreeViewportHandle;

export function mountModelViewer(
  container: HTMLElement,
  source: string | ArrayBuffer | ArrayBufferView | Blob,
  runtime: ThreeRuntime,
  options?: ModelViewerOptions,
): ModelViewerHandle;

export function createConfiguredGLTFLoader(runtime: ThreeRuntime, options?: {
  manager?: any; draco?: boolean; decoderPath?: string; requireDraco?: boolean;
  withCredentials?: boolean; crossOrigin?: string;
}): any;
export const DEFAULT_DRACO_DECODER_PATH: string;
export function inferModelFormat(source: unknown, explicitFormat?: string): ModelFormat;
export const SUPPORTED_MODEL_FORMATS: readonly ModelFormat[];

export type ProceduralPbrCategory = 'all' | 'metal' | 'stone' | 'glass' | 'organic';
export type ProceduralPbrPattern = 'brushed-metal' | 'veined-marble' | 'hex-carbon' | 'hammered-copper' | 'frosted-crystal' | 'walnut-grain' | 'iridescent-pearl' | 'lava-basalt' | 'architectural-brick' | 'concrete' | 'wood-panel' | 'clear-glass' | 'ceramic' | 'polished-concrete' | 'anodized-frame' | 'slate';
export interface ProceduralPbrMaterialPreset {
  id:string; label:string; category:Exclude<ProceduralPbrCategory,'all'>; description:string;
  swatchGradient:string; colorHex:string; secondaryHex:string; emissiveHex:string; emissiveIntensity:number;
  metalness:number; roughness:number; clearcoat:number; clearcoatRoughness:number; iridescence:number;
  anisotropy:number; transmission:number; ior:number; patternType:ProceduralPbrPattern; bumpScale:number; opacity?:number; thickness?:number;
}
export interface StudioTextureSet {
  radialShadow:any; brushedRoughness:any; turntableDial:any; studioFloor:any; micGrillBump:any;
  stoneBump:any; waterRippleBump:any; hexDeckBump:any; marbleVeinMap:any; hammeredBump:any;
  walnutGrainMap:any; lavaFissureMap:any; dispose():void;
}
export const PROCEDURAL_PBR_MATERIALS: readonly ProceduralPbrMaterialPreset[];
export const PROCEDURAL_PBR_MATERIAL_MAP: Readonly<Record<string,ProceduralPbrMaterialPreset>>;
export const CAD_MATERIAL_PRESET_MAP: Readonly<Record<string,string>>;
export function createStudioTextures(THREE:any,maxAnisotropy:number):StudioTextureSet;
export function createProceduralPbrMaterial(THREE:any,preset:ProceduralPbrMaterialPreset,textures:StudioTextureSet,isSoftwareGl?:boolean):any;

export function isSoftwareWebGLRenderer(renderer: {getContext():any}|null|undefined): boolean;
