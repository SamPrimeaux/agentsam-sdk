import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { TEMPLATE_METADATA_LIST, type TemplateMetadata } from '../lib/templates';
import { CadResourceCard } from './CadResourceCard';
import { CadPreview2D } from './CadPreviewTreatments';

/** One fresh, independent copy of a template: new id, new timestamp, version 1. */
export function cloneTemplateProject(tpl: TemplateMetadata): ProjectState {
  return {
    ...structuredClone(tpl.project),
    id: `proj_${Date.now()}`,
    updatedAt: Date.now(),
    version: 1,
  };
}

interface Props {
  /** Receives an independent copy; the template itself is never mutated. */
  onSelect: (project: ProjectState, name: string) => void;
  onExit?: () => void;
}

/** Full template library inside the existing CAD stage, not a dialog. */
export const TemplateStarterGrid: React.FC<Props> = ({ onSelect, onExit }) => (
  <div className="cad-project-gallery" aria-label="Start from a template">
    <header className="cad-project-gallery__head">
      <div className="min-w-0">
        <p className="cad-project-gallery__eyebrow">CAD Creator</p>
        <h2>Start from a template</h2>
        <p>Opens an unsaved copy with a lightweight 2D preview. Registered projects open from the project gallery.</p>
      </div>
      {onExit && (
        <button type="button" className="cad-hosted-chrome__browse" onClick={onExit}>
          <ArrowLeft className="inline h-3.5 w-3.5" aria-hidden="true" /> Back to workspace
        </button>
      )}
    </header>

    <div className="cad-project-gallery__grid">
      {TEMPLATE_METADATA_LIST.map((tpl) => (
        <CadResourceCard
          key={tpl.id}
          title={tpl.name}
          category={tpl.categoryLabel}
          meta={`${tpl.dimensions} · ${tpl.project.walls.length} walls · ${tpl.project.rooms.length} zones · ${tpl.project.furniture.length} fixtures`}
          previewKind="plan-2d"
          preview={<CadPreview2D project={tpl.project} />}
          openLabel="Open edit"
          onOpen={() => onSelect(cloneTemplateProject(tpl), tpl.name)}
          aria-label={`Start editing ${tpl.name}`}
        />
      ))}
    </div>
  </div>
);
