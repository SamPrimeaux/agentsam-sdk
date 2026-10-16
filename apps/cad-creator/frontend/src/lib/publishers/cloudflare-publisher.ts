import { DesignProject, DesignArtifact, PublishResult } from '@inneranimalmedia/agentsam-cad-shared';
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
    _project: DesignProject,
    _artifacts: DesignArtifact[],
    _options: PublishOptions,
  ): Promise<PublishResult> {
    throw new Error('Cloudflare publishing requires an authorized host R2 upload with verified object receipts. No upload was performed.');
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
    _project: DesignProject,
    _artifacts: DesignArtifact[],
    _options: PublishOptions,
  ): Promise<PublishResult> {
    throw new Error('A trusted host-managed publishing endpoint is required. No Docker upload was performed.');
  }
}
