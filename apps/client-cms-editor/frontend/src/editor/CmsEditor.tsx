import type { CmsEditorAdapter } from '../../../shared/cms/src/adapter';
import { buildCmsEditorGroups, getCmsSectionGroupId } from '../../../shared/cms/src/editor-types';
import type { CmsEditorHost } from '../../../shared/cms/src/host';
import type { CmsAgentHost } from '../lib/agent-host';
import { CmsEditorProvider } from './CmsEditorProvider';
import { useCmsEditorController } from './useCmsEditorController';
import { PreviewCanvas, type CmsEditorPreviewRenderer } from './canvas/PreviewCanvas';
import { useCmsEditor } from './CmsEditorProvider';
import '../styles/studio.css';

export type CmsEditorProps = {
  adapter: CmsEditorAdapter;
  host?: CmsEditorHost;
  /** Optional agent host slots (render props). */
  agentHost?: CmsAgentHost;
  siteId: string;
  initialPageId?: string | null;
  initialRail?: 'groups' | 'sections' | 'blocks' | 'pages' | 'media' | 'settings';
  /** True when the attached adapter is temporary (e.g. in-memory preview). Pack content is not temporary. */
  temporaryAdapter?: boolean;
  /** Optional real site renderer supplied by the embedding host. Structural preview remains the fallback. */
  renderPreview?: CmsEditorPreviewRenderer;
};

function EditorShell({ renderPreview }: { renderPreview?: CmsEditorPreviewRenderer }) {
  const editor = useCmsEditor();
  const { site, page, section, block, ui, published, lastDraft } = editor;
  const groups = page ? buildCmsEditorGroups(page.sections) : [];

  if (ui.error && !site) {
    return (
      <main className="cms-shell cms-shell--error">
        <h1>CMS failed to load</h1>
        <p>{ui.error}</p>
        <p>A broken adapter must surface the error — never a fake working site.</p>
        <button type="button" onClick={() => void editor.reload()}>
          Retry
        </button>
      </main>
    );
  }

  if (!site || !page) {
    return (
      <main className="cms-shell cms-shell--loading">
        <p>Loading CMS site…</p>
      </main>
    );
  }

  return (
    <main className="cms-shell cms-shell--product" data-cms-authority="adapter">
      {ui.temporaryAdapterNotice ? (
        <div className="cms-ephemeral-banner" role="status">
          {ui.temporaryAdapterNotice}
        </div>
      ) : null}
      <header className="cms-topbar">
        <div>
          <strong>{site.name}</strong>
          <span>{site.domain || site.id}</span>
          <label className="cms-route-select">
            <span>Route</span>
            <select value={page.id} onChange={(event) => editor.selectPage(event.target.value)}>
              {site.pages.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} · {entry.slug}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cms-topbar-actions">
          <span className={ui.dirty ? 'badge draft' : 'badge saved'}>
            {ui.dirty ? 'Unsaved draft' : 'Draft synced'}
          </span>
          <button
            type="button"
            disabled={!ui.dirty || ui.saving}
            onClick={() => void editor.saveDraft()}
          >
            {ui.saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            disabled={ui.publishing}
            onClick={() => void editor.publish()}
          >
            {ui.publishing ? 'Publishing…' : 'Publish'}
          </button>
          <button type="button" onClick={() => void editor.reload()}>
            Reload
          </button>
          {editor.host?.navigate ? (
            <button type="button" onClick={() => editor.navigateHost('/cms')}>
              Host CMS
            </button>
          ) : null}
        </div>
      </header>

      <div className="cms-workspace">
        <aside className="cms-rail">
          {(['groups', 'sections', 'blocks', 'settings'] as const).map((rail) => (
            <button
              key={rail}
              type="button"
              className={ui.rail === rail ? 'active' : ''}
              onClick={() => editor.setRail(rail)}
            >
              {rail}
            </button>
          ))}
        </aside>

        <aside className="cms-sidebar">
          {ui.rail === 'groups' ? (
            <ul>
              {groups.map((group) => {
                const active = section ? getCmsSectionGroupId(section) === group.id : false;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      className={active ? 'active' : ''}
                      onClick={() => group.sectionIds[0] && editor.selectSection(group.sectionIds[0])}
                    >
                      {group.name}
                      <small>{group.sectionIds.length} section{group.sectionIds.length === 1 ? '' : 's'}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {ui.rail === 'sections' ? (
            <ul>
              {page.sections.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={entry.id === section?.id ? 'active' : ''}
                    onClick={() => editor.selectSection(entry.id)}
                  >
                    {entry.name}
                    <small>{getCmsSectionGroupId(entry)} · {entry.type}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {ui.rail === 'blocks' ? (
            <ul>
              {(section?.blocks || []).map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={entry.id === block?.id ? 'active' : ''}
                    onClick={() => editor.selectBlock(entry.id)}
                  >
                    {entry.type}
                    <small>{entry.visible ? 'Visible' : 'Hidden'}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {ui.rail === 'settings' ? (
            <div className="cms-settings">
              <p>Persistence goes only through CmsEditorAdapter.</p>
              <p>Last draft: {lastDraft?.id || '—'}</p>
              <p>Published: {published?.publicationId || '—'}</p>
            </div>
          ) : null}
        </aside>

        <section className="cms-canvas-wrap">
          <div className="cms-viewport-switch">
            {(['phone', 'tablet', 'desktop'] as const).map((viewport) => (
              <button
                key={viewport}
                type="button"
                className={ui.viewport === viewport ? 'active' : ''}
                onClick={() => editor.setViewport(viewport)}
              >
                {viewport}
              </button>
            ))}
          </div>
          <PreviewCanvas renderPreview={renderPreview} />
        </section>

        <aside className="cms-inspector">
          {section ? (
            <>
              <h2>{section.name}</h2>
              <p>{section.type}</p>
              {Object.entries(section.fields || {}).map(([key, value]) => (
                <label key={key}>
                  <span>{key}</span>
                  <input
                    value={typeof value === 'string' ? value : JSON.stringify(value)}
                    onChange={(event) => editor.updateSectionField(key, event.target.value)}
                  />
                </label>
              ))}
            </>
          ) : (
            <p>Select a section</p>
          )}
          {ui.error ? <p className="cms-error">{ui.error}</p> : null}
        </aside>
      </div>
    </main>
  );
}

/**
 * Canonical CMS editor entry — shell composition only.
 * Persistence: CmsEditorAdapter. Host navigation: CmsEditorHost.
 */
export default function CmsEditor({
  adapter,
  host,
  siteId,
  initialPageId = null,
  initialRail = 'groups',
  temporaryAdapter = false,
  renderPreview,
}: CmsEditorProps) {
  const editor = useCmsEditorController({
    adapter,
    host,
    siteId,
    initialPageId,
    initialRail,
    temporaryAdapter,
  });

  return (
    <CmsEditorProvider value={editor}>
      <EditorShell renderPreview={renderPreview} />
    </CmsEditorProvider>
  );
}

export type { CmsEditorController } from './useCmsEditorController';
