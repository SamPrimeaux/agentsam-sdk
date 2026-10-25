import { describe, expect, it, vi } from 'vitest';
import { saveHostedProject } from './hosted-project-source';

const project = { id: 'p', walls: [], rooms: [] } as never;
const receipt = { revisionId: 'd1', projectId: 'p1', revisionNumber: 1, timestamp: 1, message: 'm', wallsCount: 0, roomsCount: 0, parametricCount: 0, assetId: 'a', sha256: 's', bytes: 1, verified: true };

describe('saveHostedProject', () => {
  it('PUTs the document against its base revision and returns the receipt', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, receipt }, { status: 201 }));
    expect(await saveHostedProject('p1', project, 'v1.2', fetcher as never)).toEqual(receipt);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/work/projects/p1/cad/documents?base=v1.2');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ id: 'p', walls: [], rooms: [] });
  });
  it('reports the server error and claims nothing changed', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: false, error: 'cad_document_shape_invalid' }, { status: 400 }));
    await expect(saveHostedProject('p1', project, 'v1.2', fetcher as never)).rejects.toThrow(/cad_document_shape_invalid.*Nothing was changed/);
  });
  it('asks the user to sign in on 401', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 401 }));
    await expect(saveHostedProject('p1', project, 'v1.2', fetcher as never)).rejects.toThrow(/Sign in/);
  });
});
