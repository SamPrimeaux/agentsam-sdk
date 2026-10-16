import { DesignProject, DesignArtifact, PublishResult } from '@inneranimalmedia/agentsam-cad-shared';
import { DesignPublisher, PublishCredentials, PublishOptions } from './types';

export class GitHubPublisher implements DesignPublisher {
  id = 'github' as const;
  displayName = 'GitHub CAD Repository';
  description = 'Publish spatial BIM geometry, OpenSCAD source, and DXF/SVG packages to a GitHub repository.';
  iconName = 'Github';

  capabilities = {
    supportsPrivatePublish: true,
    supportsReleases: true,
    supportsDirectArtifacts: true,
    requiresAuthToken: true,
    authFields: [
      { key: 'repoOwner', label: 'Repository Owner / Org', type: 'text' as const, placeholder: 'e.g. your-username', required: true },
      { key: 'repoName', label: 'Repository Name', type: 'text' as const, placeholder: 'e.g. agentsam-cad-project', required: true },
      { key: 'branch', label: 'Branch', type: 'text' as const, placeholder: 'main' },
    ],
  };

  async validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }> {
    if (!credentials?.repoOwner || !credentials?.repoName) {
      return { valid: false, error: 'Repository owner and name are required.' };
    }
    return { valid: false, error: 'GitHub publishing requires a verified host connection.' };
  }

  async publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult> {
    // Remote publishing is executed by an authenticated host using its GitHub
    // App installation, never by a browser-entered personal access token.
    throw new Error('cad_publish_requires_authorized_github_host');
  }
}
