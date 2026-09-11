import {
  BlenderStatusResponse,
  BlenderInspectRequest,
  BlenderInspectResponse,
  BlenderBuildRequest,
  BlenderBuildResponse,
  BlenderRenderPreviewRequest,
  BlenderRenderPreviewResponse,
  BlenderExportRequest,
  BlenderExportResponse,
  ExecutionLane,
} from '../../shared/cad';

/**
 * CadRuntime Adapter Interface
 *
 * Defines the unified contract for CAD runtime executors.
 * Implementations include NativeCadRuntime (local binary), ContainerCadRuntime (Docker/Cloud),
 * and FallbackMockCadRuntime.
 */
export interface CadRuntime {
  readonly id: string;
  readonly lane: ExecutionLane;

  /**
   * Checks the status and availability of the CAD runtime
   */
  status(): Promise<BlenderStatusResponse>;

  /**
   * Inspects a scene file (.blend) and extracts structured room, object, material data
   */
  inspect(req: BlenderInspectRequest): Promise<BlenderInspectResponse>;

  /**
   * Deterministically executes a declarative JSON CAD recipe to build a .blend file
   */
  build(req: BlenderBuildRequest): Promise<BlenderBuildResponse>;

  /**
   * Renders a preview image from a .blend file
   */
  renderPreview(req: BlenderRenderPreviewRequest): Promise<BlenderRenderPreviewResponse>;

  /**
   * Exports a .blend scene into GLB, STL, or OBJ
   */
  export(req: BlenderExportRequest): Promise<BlenderExportResponse>;
}
