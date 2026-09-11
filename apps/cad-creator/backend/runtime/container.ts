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
import { NativeCadRuntime } from './native';

/**
 * ContainerCadRuntime
 *
 * Communicates with an isolated containerized CAD daemon (e.g. `agentsam dockerize cad` or Docker worker).
 * When running inside a CAD container itself, delegates to NativeCadRuntime.
 * When running in orchestrator mode, forwards HTTP requests to container endpoint (e.g. http://localhost:8080).
 */
export class ContainerCadRuntime implements CadRuntime {
  public readonly id = 'container-cad-runtime';
  public readonly lane: ExecutionLane = 'cad-container';

  private containerEndpoint: string;
  private fallbackNative: NativeCadRuntime;

  constructor(endpoint = process.env.CAD_CONTAINER_URL || 'http://127.0.0.1:8080') {
    this.containerEndpoint = endpoint;
    this.fallbackNative = new NativeCadRuntime();
  }

  public async status(): Promise<BlenderStatusResponse> {
    try {
      const res = await fetch(`${this.containerEndpoint}/api/cad/blender/status`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        return {
          ...data,
          execution_lane: 'cad-container',
        };
      }
    } catch {
      // Container not running or unreachable -> fallback gracefully
    }
    const nativeStatus = await this.fallbackNative.status();
    return {
      ...nativeStatus,
      execution_lane: 'cad-container',
      install_info: {
        help: 'To start the isolated CAD container run: agentsam dockerize cad --run',
        download_url: 'https://docs.agentsam.dev/cad/docker',
        env_variable: 'Set CAD_CONTAINER_URL=http://localhost:8080',
      },
    };
  }

  public async inspect(req: BlenderInspectRequest): Promise<BlenderInspectResponse> {
    try {
      const res = await fetch(`${this.containerEndpoint}/api/cad/blender/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return await res.json();
    } catch {}
    return this.fallbackNative.inspect(req);
  }

  public async build(req: BlenderBuildRequest): Promise<BlenderBuildResponse> {
    try {
      const res = await fetch(`${this.containerEndpoint}/api/cad/blender/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
    } catch {}
    return this.fallbackNative.build(req);
  }

  public async renderPreview(req: BlenderRenderPreviewRequest): Promise<BlenderRenderPreviewResponse> {
    try {
      const res = await fetch(`${this.containerEndpoint}/api/cad/blender/render-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(45000),
      });
      if (res.ok) return await res.json();
    } catch {}
    return this.fallbackNative.renderPreview(req);
  }

  public async export(req: BlenderExportRequest): Promise<BlenderExportResponse> {
    try {
      const res = await fetch(`${this.containerEndpoint}/api/cad/blender/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
    } catch {}
    return this.fallbackNative.export(req);
  }
}
