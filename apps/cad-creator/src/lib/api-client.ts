/**
 * AgentSam CAD Studio Frontend API Client
 *
 * Clean interface separating browser UI from backend execution, Blender runtime,
 * storage boundaries, and process execution.
 */

import {
  CadHealthResponse,
  CadCapabilitiesResponse,
  BlenderStatusResponse,
  BlenderInspectRequest,
  BlenderInspectResponse,
  BlenderBuildRequest,
  BlenderBuildResponse,
  BlenderRenderPreviewRequest,
  BlenderRenderPreviewResponse,
  BlenderExportRequest,
  BlenderExportResponse,
  StudioProjectResponse,
  StudioSceneResponse,
  StudioDesignCompileResponse,
  StudioDesignRenderResponse,
  StudioDesignExportResponse,
  ProjectState,
  CadRecipe,
  ExportFormat,
} from '../../shared/cad';

export class CadStudioApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      let errorMessage = `API Error ${res.status}: ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson.error) errorMessage = errorJson.error;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  }

  // 1. Health & Capabilities
  public async getHealth(): Promise<CadHealthResponse> {
    return this.fetchJson<CadHealthResponse>('/api/cad/health');
  }

  public async getCapabilities(): Promise<CadCapabilitiesResponse> {
    return this.fetchJson<CadCapabilitiesResponse>('/api/cad/capabilities');
  }

  public async getScene(): Promise<StudioSceneResponse> {
    return this.fetchJson<StudioSceneResponse>('/api/cad/scene');
  }

  // 2. Blender Capability Primitives
  public async getBlenderStatus(): Promise<BlenderStatusResponse> {
    return this.fetchJson<BlenderStatusResponse>('/api/cad/blender/status');
  }

  public async inspectBlender(req: BlenderInspectRequest): Promise<BlenderInspectResponse> {
    return this.fetchJson<BlenderInspectResponse>('/api/cad/blender/inspect', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  public async buildBlender(req: BlenderBuildRequest): Promise<BlenderBuildResponse> {
    return this.fetchJson<BlenderBuildResponse>('/api/cad/blender/build', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  public async renderBlenderPreview(req: BlenderRenderPreviewRequest): Promise<BlenderRenderPreviewResponse> {
    return this.fetchJson<BlenderRenderPreviewResponse>('/api/cad/blender/render-preview', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  public async exportBlender(req: BlenderExportRequest): Promise<BlenderExportResponse> {
    return this.fetchJson<BlenderExportResponse>('/api/cad/blender/export', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  // 3. Studio High-Level Contracts
  public async getProject(id = 'default_project'): Promise<StudioProjectResponse> {
    return this.fetchJson<StudioProjectResponse>(`/api/cad/project?id=${encodeURIComponent(id)}`);
  }

  public async saveProject(project: ProjectState): Promise<StudioProjectResponse> {
    return this.fetchJson<StudioProjectResponse>('/api/cad/project', {
      method: 'POST',
      body: JSON.stringify({ project }),
    });
  }

  public async patchProject(id: string, updates: Partial<ProjectState>): Promise<StudioProjectResponse> {
    return this.fetchJson<StudioProjectResponse>('/api/cad/project', {
      method: 'PATCH',
      body: JSON.stringify({ id, updates }),
    });
  }

  public async compileDesign(project: ProjectState): Promise<StudioDesignCompileResponse> {
    return this.fetchJson<StudioDesignCompileResponse>('/api/cad/design/compile', {
      method: 'POST',
      body: JSON.stringify({ project }),
    });
  }

  public async renderDesign(options: {
    project?: ProjectState;
    recipe?: CadRecipe;
    width?: number;
    height?: number;
    engine?: 'EEVEE' | 'CYCLES' | 'PREVIEW';
  }): Promise<StudioDesignRenderResponse> {
    return this.fetchJson<StudioDesignRenderResponse>('/api/cad/design/render', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  public async exportDesign(options: {
    project?: ProjectState;
    recipe?: CadRecipe;
    format: ExportFormat;
  }): Promise<StudioDesignExportResponse> {
    return this.fetchJson<StudioDesignExportResponse>('/api/cad/design/export', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }
}

export const cadClient = new CadStudioApiClient();
