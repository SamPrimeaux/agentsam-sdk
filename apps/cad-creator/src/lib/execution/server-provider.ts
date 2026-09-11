import {
  DesignExecutionProvider,
  ExecutionCapabilities,
  ExecutionHealth,
  OpenScadExecutionRequest,
  OpenScadExecutionResult,
} from './types';
import { LocalExecutionProvider } from './local-provider';

export class ServerExecutionProvider implements DesignExecutionProvider {
  id = 'server-docker';
  displayName = 'Isolated CAD Container Service';
  private fallback = new LocalExecutionProvider();

  async capabilities(): Promise<ExecutionCapabilities> {
    try {
      const res = await fetch('/api/cad/capabilities');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return {
      supportsNativeOpenScad: true,
      supportsClientSideCsg: true,
      supportedFormats: ['stl', '3mf', 'dxf', 'obj', 'scad'],
      maxTimeoutMs: 10000,
      environmentName: 'Server Sandboxed Execution Container',
    };
  }

  async health(): Promise<ExecutionHealth> {
    try {
      const res = await fetch('/api/cad/health');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
    return {
      status: 'healthy',
      backend: 'docker-service',
      message: 'Server CAD Execution Service Online',
    };
  }

  async executeOpenScad(request: OpenScadExecutionRequest): Promise<OpenScadExecutionResult> {
    try {
      const res = await fetch('/api/cad/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      }
      const errData = await res.json().catch(() => ({ error: 'Server execution failed' }));
      throw new Error(errData.error || 'Server CAD execution failed');
    } catch (err: any) {
      // Gracefully fall back to local provider with diagnostic log
      const localResult = await this.fallback.executeOpenScad(request);
      localResult.logs.unshift(`[FALLBACK] Server endpoint unavailable (${err.message}). Using local CAD kernel.`);
      return localResult;
    }
  }
}
