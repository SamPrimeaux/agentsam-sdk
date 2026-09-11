import { CadCapabilitiesResponse, ExecutionLane } from '../../../shared/cad';
import { BlenderDiscoveryService } from './blender/discover';
import { DockerRuntimeAdapter } from '../../runtime/docker/adapter';

export async function getCadCapabilities(): Promise<CadCapabilitiesResponse> {
  const blender = await BlenderDiscoveryService.discover();
  const isDocker = DockerRuntimeAdapter.isContainerized();

  const availableLanes: ExecutionLane[] = ['local-mock'];
  if (blender.available) {
    availableLanes.push('native-blender');
  }
  if (isDocker || process.env.CAD_CONTAINER_URL) {
    availableLanes.push('cad-container');
  }

  const activeLane: ExecutionLane = process.env.CAD_RUNTIME_LANE as ExecutionLane
    || (blender.available ? 'native-blender' : 'local-mock');

  return {
    schema_version: 1,
    available_lanes: availableLanes,
    active_lane: activeLane,
    blender: {
      available: blender.available,
      version: blender.version || undefined,
      binary: blender.binaryPath || undefined,
      execution_lane: blender.available ? 'native-blender' : 'local-mock',
      capabilities: ['build', 'render_preview', 'inspect', 'export'],
      install_guide: !blender.available
        ? 'Download Blender 4.x from https://www.blender.org/download/ to enable native GPU/CPU CAD builds and Cycles rendering.'
        : undefined,
    },
    openscad: {
      available: true,
      version: '2026.04 (Wasm/CSG)',
      capabilities: ['csg', 'render', 'export'],
    },
    freecad: {
      available: false,
      capabilities: ['step_import', 'fem_analysis'],
    },
    formats: {
      import: ['dxf', 'svg', 'json', 'sketch', 'png'],
      export: ['glb', 'gltf', 'stl', 'obj', 'dxf', 'blend', 'scad', 'json'],
    },
  };
}
