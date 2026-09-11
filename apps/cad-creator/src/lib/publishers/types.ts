import {
  DesignProject,
  DesignArtifact,
  PublisherDestinationId,
  PublisherCapabilities,
  PublishResult,
} from '../../types';

export interface PublishCredentials {
  apiKey?: string;
  token?: string;
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  targetFolder?: string;
  endpointUrl?: string;
  isPrivate?: boolean;
}

export interface PublishOptions {
  destination: PublisherDestinationId;
  commitMessage: string;
  credentials?: PublishCredentials;
  formatsToInclude?: ('json' | 'svg' | 'dxf' | 'obj' | 'scad' | 'stl')[];
  visibility?: 'public' | 'private' | 'unlisted';
}

export interface DesignPublisher {
  id: PublisherDestinationId;
  displayName: string;
  description: string;
  iconName: string;
  capabilities: PublisherCapabilities;
  validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }>;
  publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult>;
}
