import { describe, expect, it } from 'vitest';
import { HttpCmsAdapter } from './http';

type Call = { url: string; method: string; body: unknown };

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpCmsAdapter composition authoring', () => {
  it('persists groups -> sections -> blocks and stores a composition revision', async () => {
    const calls: Call[] = [];
    const transport: typeof fetch = async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET').toUpperCase();
      let body: unknown = undefined;
      if (typeof init.body === 'string') body = JSON.parse(init.body);
      calls.push({ url, method, body });

      if (url.includes('/api/cms/bootstrap')) {
        return json({
          ok: true,
          tenant: { name: 'Demo' },
          pages: [{ id: 'page_home', slug: 'home', title: 'Home', status: 'draft' }],
          sections_by_page: {
            page_home: [{
              id: 'section_hero',
              section_name: 'Hero',
              section_type: 'hero',
              section_data: JSON.stringify({ group_id: 'intro', group_label: 'Intro' }),
              is_visible: 1,
            }],
          },
          blocks_by_section: {
            section_hero: [{
              id: 'block_title',
              section_id: 'section_hero',
              component_type: 'heading',
              component_data: JSON.stringify({ text: 'Hello' }),
              is_visible: 1,
              sort_order: 10,
            }],
          },
        });
      }

      if (url.includes('/revisions') && method === 'POST') {
        const payload = body as { snapshot?: unknown };
        return json({
          ok: true,
          revision: {
            id: 'rev_1',
            pageId: 'page_home',
            kind: 'draft',
            createdAt: '2026-10-04T18:00:00.000Z',
            snapshot: payload.snapshot,
          },
        }, 201);
      }

      if (url.includes('/api/cms/blocks/block_title') && method === 'PUT') {
        return json({
          ok: true,
          block: {
            id: 'block_title',
            section_id: 'section_hero',
            component_type: 'heading',
            component_data: JSON.stringify({ text: 'Updated' }),
            is_visible: 1,
            sort_order: 10,
          },
        });
      }

      if (url.includes('/api/cms/sections/section_hero') && method === 'PUT') {
        return json({
          ok: true,
          section: {
            id: 'section_hero',
            section_name: 'Hero',
            section_type: 'hero',
            section_data: JSON.stringify({ group_id: 'intro', group_label: 'Intro' }),
            is_visible: 1,
          },
        });
      }

      if (url.includes('/api/cms/pages/page_home') && method === 'PUT') {
        return json({ ok: true, page: { id: 'page_home', slug: 'home', title: 'Home', status: 'draft' } });
      }

      return json({ ok: true });
    };

    const adapter = new HttpCmsAdapter({
      transport,
      sites: [{ id: 'demo', name: 'Demo' }],
    });

    const revision = await adapter.saveDraft('page_home', {
      sections: [{
        id: 'section_hero',
        name: 'Hero',
        type: 'hero',
        zone: 'BODY',
        visible: true,
        color: '#111115',
        fields: { group_id: 'intro', group_label: 'Intro' },
        blocks: [{
          id: 'block_title',
          sectionId: 'section_hero',
          type: 'heading',
          visible: true,
          data: { text: 'Updated' },
          sortOrder: 10,
        }],
      }],
    });

    expect(revision.id).toBe('rev_1');
    const revisionCall = calls.find((call) => call.url.includes('/revisions') && call.method === 'POST');
    expect(revisionCall).toBeTruthy();
    const revisionBody = revisionCall!.body as {
      snapshot: { groups: Array<{ id: string }>; sections: unknown[]; pages?: unknown };
    };
    expect(revisionBody.snapshot.groups.map((group) => group.id)).toEqual(['intro']);
    expect(revisionBody.snapshot.sections).toHaveLength(1);
    expect(revisionBody.snapshot.pages).toBeUndefined();

    expect(calls.some((call) => call.url.includes('/blocks/reorder') && call.method === 'POST')).toBe(true);
    expect(calls.some((call) => call.url.includes('/sections/section_hero/visibility') && call.method === 'POST')).toBe(true);
  });

  it('uses real DELETE routes for sections and blocks', async () => {
    const calls: Call[] = [];
    const transport: typeof fetch = async (input, init = {}) => {
      calls.push({
        url: String(input),
        method: String(init.method || 'GET').toUpperCase(),
        body: undefined,
      });
      return json({ ok: true });
    };

    const adapter = new HttpCmsAdapter({
      transport,
      sites: [{ id: 'demo', name: 'Demo' }],
    });

    await adapter.deleteSection('section_1');
    await adapter.deleteBlock('block_1');

    expect(calls.map(({ url, method }) => [url, method])).toEqual([
      ['/api/cms/sections/section_1?site=demo', 'DELETE'],
      ['/api/cms/blocks/block_1?site=demo', 'DELETE'],
    ]);
  });
});
