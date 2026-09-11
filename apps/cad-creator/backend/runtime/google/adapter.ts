/**
 * Google Cloud Run & GCP Runtime Adapter Scaffold
 *
 * Provides integration helpers for running AgentSam CAD in Cloud Run with Cloud Storage or Cloud SQL.
 */

export class GoogleCloudRuntimeAdapter {
  public static isCloudRun(): boolean {
    return Boolean(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT);
  }

  public static getGcpInfo() {
    return {
      service: process.env.K_SERVICE || 'cad-studio-service',
      revision: process.env.K_REVISION || 'v1',
      region: process.env.REGION || 'us-central1',
      project: process.env.GOOGLE_CLOUD_PROJECT || 'local-dev',
    };
  }
}
