import { useEffect, useState } from 'react';
import {
  DEFAULT_RUNTIME_CAPABILITIES,
  RuntimeCapabilityStatus,
} from '../../app/workspaceRegistry';

export interface CadToolReceipt {
  tool: string;
  name: string;
  category: string;
  available: boolean;
  binary: string | null;
  version: string | null;
  source: string;
  execution_lane: string;
  supportedFormats: string[];
  error?: string | null;
}

export interface CadToolsReport {
  schema_version: number;
  timestamp: string;
  total_tools: number;
  available_tools: number;
  all_systems_ready: boolean;
  tools: CadToolReceipt[];
}

export function useCadTools() {
  const [capabilities, setCapabilities] = useState<RuntimeCapabilityStatus[]>(DEFAULT_RUNTIME_CAPABILITIES);
  const [report, setReport] = useState<CadToolsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function discover() {
      try {
        const res = await fetch('/api/cad/tools');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data: CadToolsReport = await res.json();
        if (cancelled) return;

        setReport(data);

        if (Array.isArray(data.tools) && data.tools.length > 0) {
          const mapped: RuntimeCapabilityStatus[] = data.tools.map((t) => {
            const lane: RuntimeCapabilityStatus['lane'] =
              t.execution_lane === 'cloud_byok'
                ? 'cloud_byok'
                : t.execution_lane === 'browser_wasm'
                  ? 'browser'
                  : 'local_native';

            const status: RuntimeCapabilityStatus['status'] = t.available
              ? t.tool === 'freecad'
                ? 'connected'
                : 'ready'
              : 'unavailable';

            let description = '';
            if (t.tool === 'openscad') {
              description = 'Constructive Solid Geometry (CSG), OpenSCAD compilation, and dynamic variables.';
            } else if (t.tool === 'freecad') {
              description = 'Precision B-Rep solid boundary modeling with ISO 10303 STEP/IGES interchange.';
            } else if (t.tool === 'blender') {
              description = 'Photorealistic PBR rendering, camera baking, and GLTF/GLB production pipeline.';
            } else if (t.tool === 'meshy') {
              description = 'AI-driven text/image-to-3D generation for custom manipulation targets.';
            } else if (t.tool === 'mujoco') {
              description = 'MuJoCo physics WASM simulation kernel.';
            }

            return {
              id: t.tool as any,
              name: t.name,
              available: t.available,
              version: t.version || undefined,
              lane,
              source: t.source || 'runtime',
              binary: t.binary || undefined,
              status,
              description: description || `${t.name} engine`,
            };
          });

          setCapabilities(mapped);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Discovery failed');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void discover();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    capabilities,
    report,
    loading,
    error,
  };
}
