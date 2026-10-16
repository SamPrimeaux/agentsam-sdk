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
    ],
  };

  async validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }> {
    return { valid: false, error: 'Cloudflare R2 publishing requires a verified OAuth host connection.' };
  }

  async publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult> {
    // R2 selection, token exchange and object writes belong to the connected
    // user's Cloudflare OAuth authority on the server, not this browser module.
    throw new Error('cad_publish_requires_authorized_cloudflare_host');
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
    ],
  };

  async validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }> {
    return { valid: false, error: 'A verified host executor is required for Docker publishing.' };
  }

  async publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult> {
    throw new Error('cad_publish_requires_authorized_docker_host');
  }
}
