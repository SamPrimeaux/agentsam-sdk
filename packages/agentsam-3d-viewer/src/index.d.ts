export type ModelFormat = 'glb' | 'gltf' | 'stl';

/** The host passes its own Three.js runtime to avoid bundling a second copy. */
export interface ThreeRuntime {
  THREE: any;
  OrbitControls: new (camera: any, element: HTMLElement) => any;
  GLTFLoader?: new () => any;
  STLLoader?: new () => any;
}

export interface ThreeViewportOptions {
  ariaLabel?: string;
  role?: string;
  background?: string | number;
  wrapper?: boolean;
  insertCanvasFirst?: boolean;
  minHeight?: string;
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
  controls: any;
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

export function inferModelFormat(source: unknown, explicitFormat?: string): ModelFormat;
export const SUPPORTED_MODEL_FORMATS: readonly ModelFormat[];
