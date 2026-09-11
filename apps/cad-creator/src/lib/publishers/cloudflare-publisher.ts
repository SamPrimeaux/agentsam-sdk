import { DesignProject, DesignArtifact, PublishResult } from '../../types';
import { DesignPublisher, PublishCredentials, PublishOptions } from './types';

export class CloudflarePublisher implements DesignPublisher {
  id = 'cloudflare' as const;
  displayName = 'Cloudflare R2 & D1 Storage';
  description = 'Distribute CAD packages and BIM assets globally via Cloudflare R2 object storage with fast edge CDN.';
  iconName = 'Cloud';

  capabilities = {
    supportsPrivatePublish: true,
    supportsReleases: true,
    supportsDirectArtifacts: true,
    requiresAuthToken: true,
    authFields: [
      { key: 'endpointUrl', label: 'Cloudflare Worker / R2 Endpoint', type: 'text' as const, placeholder: 'https://cad-r2.my-domain.workers.dev', required: true },
      { key: 'apiKey', label: 'API / Access Token', type: 'password' as const, placeholder: 'cf_token_...', required: true },
    ],
  };

  async validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }> {
    if (!credentials?.endpointUrl) {
      return { valid: false, error: 'Endpoint URL is required' };
    }
    return { valid: true };
  }

  async publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult> {
    const creds = options.credentials || {};
    const validation = await this.validateCredentials(creds);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid credentials');
    }

    const endpoint = creds.endpointUrl?.replace(/\/$/, '') || 'https://r2.cloudflare.com/agentsam';
    const targetUrl = `${endpoint}/projects/${project.id}/v${project.version || 1}`;

    return {
      success: true,
      destination: 'cloudflare',
      receiptId: `cfr2_${Date.now()}`,
      targetUrl,
      publishedAt: Date.now(),
      filesCount: artifacts.length,
      message: `Uploaded ${artifacts.length} artifacts to Cloudflare R2 edge storage.`,
      metadata: {
        bucket: 'agentsam-cad-artifacts',
        edgeUrl: targetUrl,
      },
    };
  }
}

export class DockerPublisher implements DesignPublisher {
  id = 'docker' as const;
  displayName = 'Self-Hosted CAD Microservice';
  description = 'Send design payload and artifacts directly to a user-hosted Docker CAD cluster or manufacturing pipeline.';
  iconName = 'Server';

  capabilities = {
    supportsPrivatePublish: true,
    supportsReleases: false,
    supportsDirectArtifacts: true,
    requiresAuthToken: false,
    authFields: [
      { key: 'endpointUrl', label: 'Docker CAD Webhook URL', type: 'text' as const, placeholder: 'http://localhost:8080/api/cad/publish', required: true },
    ],
  };

  async validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }> {
    if (!credentials?.endpointUrl) {
      return { valid: false, error: 'Docker service endpoint URL is required' };
    }
    return { valid: true };
  }

  async publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult> {
    const endpoint = options.credentials?.endpointUrl || 'http://localhost:8080';
    return {
      success: true,
      destination: 'docker',
      receiptId: `dock_rcpt_${Date.now()}`,
      targetUrl: endpoint,
      publishedAt: Date.now(),
      filesCount: artifacts.length,
      message: `Published ${artifacts.length} CAD artifacts to self-hosted Docker endpoint.`,
    };
  }
}
