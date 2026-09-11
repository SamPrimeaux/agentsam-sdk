import {
  CadRuntime,
} from './interface';
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
import { getBlenderStatus } from '../services/cad/blender/status';
import { inspectBlenderScene } from '../services/cad/blender/inspect';
import { buildBlenderScene } from '../services/cad/blender/build';
import { renderBlenderPreview } from '../services/cad/blender/render';
import { exportBlenderModel } from '../services/cad/blender/export';

/**
 * NativeCadRuntime
 *
 * Direct execution against the host system's native Blender binary,
 * or simulated fallback if binary is not installed.
 */
export class NativeCadRuntime implements CadRuntime {
  public readonly id = 'native-cad-runtime';
  public readonly lane: ExecutionLane = 'native-blender';

  public async status(): Promise<BlenderStatusResponse> {
    return getBlenderStatus();
  }

  public async inspect(req: BlenderInspectRequest): Promise<BlenderInspectResponse> {
    return inspectBlenderScene(req);
  }

  public async build(req: BlenderBuildRequest): Promise<BlenderBuildResponse> {
    return buildBlenderScene(req);
  }

  public async renderPreview(req: BlenderRenderPreviewRequest): Promise<BlenderRenderPreviewResponse> {
    return renderBlenderPreview(req);
  }

  public async export(req: BlenderExportRequest): Promise<BlenderExportResponse> {
    return exportBlenderModel(req);
  }
}
