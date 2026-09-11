import { DesignProject, DesignArtifact, PublishResult } from '@inneranimalmedia/agentsam-cad-shared';
import { DesignPublisher, PublishCredentials, PublishOptions } from './types';
import { downloadFile } from '../exporters';

export class LocalPublisher implements DesignPublisher {
  id = 'local' as const;
  displayName = 'Local Workspace & Disk';
  description = 'Directly download bundled CAD packages or persist locally to browser storage.';
  iconName = 'HardDrive';

  capabilities = {
    supportsPrivatePublish: true,
    supportsReleases: false,
    supportsDirectArtifacts: true,
    requiresAuthToken: false,
  };

  async validateCredentials(): Promise<{ valid: boolean }> {
    return { valid: true };
  }

  async publishProject(
    project: DesignProject,
    artifacts: DesignArtifact[],
    options: PublishOptions
  ): Promise<PublishResult> {
    const receiptId = `loc_rcpt_${Date.now()}`;
    const safeName = (project.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Trigger download for each artifact
    artifacts.forEach((art) => {
      const contentStr = typeof art.content === 'string' ? art.content : new TextDecoder().decode(art.content);
      downloadFile(contentStr, art.filename, art.mimeType);
    });

    return {
      success: true,
      destination: 'local',
      receiptId,
      publishedAt: Date.now(),
      filesCount: artifacts.length,
      message: `Exported ${artifacts.length} CAD artifacts to your local system disk.`,
      metadata: {
        projectName: project.name,
        revision: project.version || 1,
      },
    };
  }
}
