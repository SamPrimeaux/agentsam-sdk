import { describe, expect, it } from 'vitest';
import { CloudflarePublisher, DockerPublisher } from './cloudflare-publisher';
import { GitHubPublisher } from './github-publisher';
import { WORKSPACE_REGISTRY } from '../../app/workspaceRegistry';

describe('host-owned CAD publishing', () => {
  it('never claims a GitHub upload without a host-authorized repository writer', async () => {
    await expect(new GitHubPublisher().publishProject({} as never, [], { destination:'github', commitMessage:'test' }))
      .rejects.toThrow(/authenticated AgentSam host adapter/);
  });
  it('never claims an R2 upload without a verified artifact receipt', async () => {
    await expect(new CloudflarePublisher().publishProject({} as never, [], { destination:'cloudflare', commitMessage:'test' }))
      .rejects.toThrow(/No upload was performed/);
  });
  it('never claims a Docker publish without an execution endpoint', async () => {
    await expect(new DockerPublisher().publishProject({} as never, [], { destination:'docker', commitMessage:'test' }))
      .rejects.toThrow(/No Docker upload was performed/);
  });
  it('exposes three primary workspaces without discarding legacy module IDs', () => {
    expect(WORKSPACE_REGISTRY.filter(w => w.isPrimary).map(w => w.id)).toEqual(['plan','model','robotics']);
    expect(WORKSPACE_REGISTRY.map(w => w.id)).toEqual(['plan','model','parametric','robotics','render']);
  });
});
