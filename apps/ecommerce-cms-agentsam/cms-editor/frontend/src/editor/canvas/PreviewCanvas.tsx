/**
 * Structural draft canvas — NOT a second pretend website renderer.
 * Shows the same draft model the adapter owns. Schema-driven CmsRenderer replaces this later.
 */
import type { ReactNode } from 'react';
import type { CmsEditorPage, CmsEditorSection, CmsEditorSite } from '../../../../shared/cms/src/editor-types';
import { useCmsEditor } from '../CmsEditorProvider';

export type CmsEditorPreviewRenderContext = {
  site: CmsEditorSite;
  page: CmsEditorPage;
  section: CmsEditorSection | null;
  selectedSectionId: string | null;
  viewport: 'phone' | 'tablet' | 'desktop';
  onSectionSelect: (sectionId: string) => void;
};

export type CmsEditorPreviewRenderer = (context: CmsEditorPreviewRenderContext) => ReactNode;

export function PreviewCanvas({ renderPreview }: { renderPreview?: CmsEditorPreviewRenderer }) {
  const { site, page, section, selectSection, ui } = useCmsEditor();
  if (!page || !site) {
    return <div className="cms-canvas-empty">Open a page to preview the draft model.</div>;
  }

  if (renderPreview) {
    return (
      <div className={`cms-canvas cms-canvas--${ui.viewport} cms-canvas--host`} data-cms-preview="host-renderer">
        {renderPreview({
          site,
          page,
          section,
          selectedSectionId: section?.id ?? null,
          viewport: ui.viewport,
          onSectionSelect: selectSection,
        })}
      </div>
    );
  }

  return (
    <div className={`cms-canvas cms-canvas--${ui.viewport}`} data-cms-preview="draft-model">
      <header className="cms-canvas-meta">
        <strong>{page.title}</strong>
        <span>{page.slug}</span>
        <em>Draft model preview · schema renderer pending</em>
      </header>
      <ol className="cms-canvas-sections">
        {page.sections.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={entry.id === section?.id ? 'is-selected' : ''}
              onClick={() => selectSection(entry.id)}
            >
              <span>{entry.name}</span>
              <small>{entry.type}</small>
              {!entry.visible ? <em>hidden</em> : null}
            </button>
            {entry.id === section?.id ? (
              <dl>
                {Object.entries(entry.fields || {}).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                  </div>
                ))}
                {(entry.blocks || []).length ? (
                  <div>
                    <dt>blocks</dt>
                    <dd>{entry.blocks.map((b) => b.type).join(', ')}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
