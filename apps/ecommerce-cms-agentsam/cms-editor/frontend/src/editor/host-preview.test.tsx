import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CmsEditorPage, CmsEditorSection, CmsEditorSite } from '../../../shared/cms/src/editor-types';
import { CmsEditorProvider } from './CmsEditorProvider';
import { PreviewCanvas, type CmsEditorPreviewRenderContext } from './canvas/PreviewCanvas';
import type { CmsEditorController } from './useCmsEditorController';

const section: CmsEditorSection = {
  id: 'section_hero',
  name: 'Hero',
  type: 'hero',
  zone: 'BODY',
  visible: true,
  color: '#111111',
  fields: { heading: 'Legendary preview' },
  blocks: [],
};

const page: CmsEditorPage = {
  id: 'page_home',
  title: 'Home',
  slug: '/',
  status: 'draft',
  type: 'home',
  sections: [section],
  metaTitle: '',
  metaDescription: '',
};

const site: CmsEditorSite = {
  id: 'site_legendary',
  name: 'Legendary',
  initials: 'L',
  domain: 'legendary.example',
  edited: 'now',
  color: '#111111',
  pages: [page],
};

function controller(selectSection = () => {}): CmsEditorController {
  return {
    adapter: {} as CmsEditorController['adapter'],
    site,
    page,
    section,
    block: null,
    ui: {
      rail: 'sections',
      viewport: 'desktop',
      dirty: false,
      saving: false,
      publishing: false,
      error: null,
      temporaryAdapterNotice: null,
    },
    published: null,
    lastDraft: null,
    selectPage: () => {},
    selectSection,
    selectBlock: () => {},
    setRail: () => {},
    setViewport: () => {},
    updateSectionField: () => {},
    saveDraft: async () => {},
    publish: async () => {},
    reload: async () => {},
    navigateHost: () => {},
  };
}

describe('CMS host preview integration', () => {
  it('lets the embedding host render the real site while preserving editor selection context', () => {
    const received: { current?: CmsEditorPreviewRenderContext } = {};
    const markup = renderToStaticMarkup(
      <CmsEditorProvider value={controller()}>
        <PreviewCanvas
          renderPreview={(context) => {
            received.current = context;
            return <article data-real-preview>{context.page.title}:{context.section?.name}</article>;
          }}
        />
      </CmsEditorProvider>,
    );

    expect(markup).toContain('data-cms-preview="host-renderer"');
    expect(markup).toContain('data-real-preview="true"');
    expect(markup).toContain('Home:Hero');
    expect(received.current?.site.id).toBe('site_legendary');
    expect(received.current?.selectedSectionId).toBe('section_hero');
    expect(received.current?.viewport).toBe('desktop');
  });

  it('retains the package structural preview when the host does not provide a renderer', () => {
    const markup = renderToStaticMarkup(
      <CmsEditorProvider value={controller()}>
        <PreviewCanvas />
      </CmsEditorProvider>,
    );

    expect(markup).toContain('data-cms-preview="draft-model"');
    expect(markup).toContain('Legendary preview');
  });
});
