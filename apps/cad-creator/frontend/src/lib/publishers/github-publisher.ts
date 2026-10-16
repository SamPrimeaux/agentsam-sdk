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
      { key: 'token', label: 'Personal Access Token', type: 'password' as const, placeholder: 'ghp_...', required: true },
    ],
  };

  async validateCredentials(credentials?: PublishCredentials): Promise<{ valid: boolean; error?: string }> {
    if (!credentials?.repoOwner || !credentials?.repoName) {
      return { valid: false, error: 'Repository owner and name are required.' };
    }
    if (!credentials?.token) {
      return { valid: false, error: 'GitHub Personal Access Token is required.' };
    }
    return { valid: true };
  }

  async publishProject(
    _project: DesignProject,
    _artifacts: DesignArtifact[],
    _options: PublishOptions,
  ): Promise<PublishResult> {
    // Publishing must use the existing host's authenticated GitHub App session.
    // Browser PAT fields are not an acceptable substitute; never fabricate a receipt.
    throw new Error('GitHub publishing requires the authenticated AgentSam host adapter. Export locally until that connected publishing route is available.');
  }
}
