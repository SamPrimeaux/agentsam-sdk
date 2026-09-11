/**
 * Docker Container Runtime Adapter Scaffold
 *
 * Provides container environment detection, health probe endpoints, and non-root execution wrappers.
 */

export class DockerRuntimeAdapter {
  public static isContainerized(): boolean {
    return Boolean(process.env.CONTAINER || process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST);
  }

  public static getContainerInfo() {
    return {
      containerized: this.isContainerized(),
      cadRoot: process.env.CAD_STORAGE_ROOT || '/storage/cad',
      user: process.env.USER || 'caduser',
      blenderInstalled: Boolean(process.env.BLENDER_PATH),
    };
  }
}
