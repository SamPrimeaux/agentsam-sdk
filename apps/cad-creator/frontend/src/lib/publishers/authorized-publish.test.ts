import { describe, it, expect, vi } from 'vitest';
import type { DesignArtifact, DesignProject } from '@inneranimalmedia/agentsam-cad-shared';
import { getCadPublishConnections, publishCadProject } from './authorized-publish';
import { GitHubPublisher } from './github-publisher';
import { CloudflarePublisher, DockerPublisher } from './cloudflare-publisher';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const project = { id: 'project_test', name: 'Villa', version: 4 } as DesignProject;
const artifacts = [{ filename: 'villa.scad', format: 'scad', mimeType: 'text/plain',
  content: 'cube([1,1,1]);' }] as DesignArtifact[];

describe('CAD publication requires real authorized host evidence', () => {
  it('fails closed when there is no OAuth publishing route', async () => {
    const request = vi.fn(async () => new Response('Not Found', {status: 404}));
    await expect(getCadPublishConnections(request as typeof fetch)).rejects.toThrow(/not installed/);
    expect(request).toHaveBeenCalledWith('/api/cad/publish/connections', {credentials: 'same-origin'});
  });
  it('derives connection states only from a verified host response', async () => {
    const request = vi.fn(async () => json({providers: [
      { provider: 'github', status: 'connected', label: 'SAM GitHub installation' },
      { provider: 'cloudflare', status: 'unknown' },
      { provider: 'other', status: 'connected' },
    ]}));
    expect(await getCadPublishConnections(request as typeof fetch)).toEqual([
      {provider: 'github', status: 'connected', label: 'SAM GitHub installation'},
      {provider: 'cloudflare', status: 'unavailable', label: 'Cloudflare OAuth'},
    ]);
  });
  it('rejects fabricated or incomplete publication receipts', async () => {
    const request = vi.fn(async () => json({ok:true, receipt:{
      id:'fake',status:'completed',provider:'github',files_written:0,
    }}));
    await expect(publishCadProject({
      provider:'github', project, artifacts,
    }, request as typeof fetch)).rejects.toThrow('cad_publish_no_verified_receipt');
  });
  it('passes content to the same-origin host without browser OAuth credentials', async () => {
    const request = vi.fn(async () => json({ok:true, receipt:{
      id:'verified_123',status:'completed',provider:'cloudflare',files_written:1,
      target_url:'https://example.com/villa',
    }}));
    const result = await publishCadProject({provider:'cloudflare',project,artifacts}, request as typeof fetch);
    expect(result.id).toBe('verified_123');
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cad/publish');
    expect(options.credentials).toBe('same-origin');
    const data = JSON.parse(String(options.body));
    expect(data.project_id).toBe('project_test');
    expect(data.artifacts[0].content_base64).toBe(btoa('cube([1,1,1]);'));
    expect(JSON.stringify(data)).not.toMatch(/token|api_key|secret/);
  });
  it('old browser publishers cannot fake success or accept raw token authority', async () => {
    await expect(new GitHubPublisher().publishProject(project, artifacts, {
      destination:'github', commitMessage:'test', credentials:{token:'ghp_test',repoOwner:'x',repoName:'y'},
    })).rejects.toThrow('cad_publish_requires_authorized_github_host');
    await expect(new CloudflarePublisher().publishProject(project, artifacts, {
      destination:'cloudflare',commitMessage:'test',credentials:{apiKey:'secret',endpointUrl:'https://x.test'},
    })).rejects.toThrow('cad_publish_requires_authorized_cloudflare_host');
    await expect(new DockerPublisher().publishProject(project, artifacts, {
      destination:'docker',commitMessage:'test',credentials:{endpointUrl:'http://localhost'},
    })).rejects.toThrow('cad_publish_requires_authorized_docker_host');
  });
});
