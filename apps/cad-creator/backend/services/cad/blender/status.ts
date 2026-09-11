import { BlenderStatusResponse } from '../../../../shared/cad';
import { BlenderDiscoveryService } from './discover';

export async function getBlenderStatus(): Promise<BlenderStatusResponse> {
  const discovery = await BlenderDiscoveryService.discover();

  return {
    schema_version: 1,
    capability: 'blender.status',
    available: discovery.available,
    binary: discovery.binaryPath,
    version: discovery.version,
    execution_lane: discovery.available ? 'native-blender' : 'local-mock',
    detected_paths: discovery.searchedLocations,
    install_info: !discovery.available
      ? {
          help: 'Blender 4.0+ is recommended for native CAD build, Cycles rendering, and GLB export.',
          download_url: 'https://www.blender.org/download/',
          env_variable: 'Set BLENDER_PATH=/path/to/blender or install in system PATH.',
        }
      : undefined,
  };
}
