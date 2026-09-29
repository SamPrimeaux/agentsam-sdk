/**
 * Structural draft canvas — NOT a second pretend website renderer.
 * Shows the same draft model the adapter owns. Schema-driven CmsRenderer replaces this later.
 */
import { useCmsEditor } from '../CmsEditorProvider';

export function PreviewCanvas() {
  const { page, section, selectSection, ui } = useCmsEditor();
  if (!page) {
    return <div className="cms-canvas-empty">Open a page to preview the draft model.</div>;
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
