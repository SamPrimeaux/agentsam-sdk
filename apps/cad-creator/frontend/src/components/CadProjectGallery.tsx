import React, { useMemo, useState } from 'react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { CadResourceCard } from './CadResourceCard';
import { CadPreview2D, CadPreview3DStatic } from './CadPreviewTreatments';
import { TEMPLATE_METADATA_LIST } from '../lib/templates';
import { cloneTemplateProject } from './TemplateStarterGrid';

export type CadGalleryHostedProject = { id: string; name: string };
export type CadGalleryLocalSnapshot = { id: string; name: string; date: string; state: ProjectState };

interface Props {
  mode?: 'hosted' | 'local' | 'mixed';
  hostedProjects?: CadGalleryHostedProject[];
  selectedHostedId?: string;
  onOpenHosted?: (projectId: string) => void;
  localSnapshots?: CadGalleryLocalSnapshot[];
  onOpenLocal?: (project: ProjectState) => void;
  onStartTemplate?: (project: ProjectState, name: string) => void;
  onOpenBimLibrary?: () => void;
  emptyHint?: string;
}

type Filter = 'all' | 'projects' | 'revisions' | 'starters';

/**
 * Polished CAD Creator entry/gallery surface.
 * Hosted projects use lightweight 3D treatments; local snapshots and templates use real 2D schematics.
 */
export function CadProjectGallery({
  mode = 'mixed',
  hostedProjects = [],
  selectedHostedId = '',
  onOpenHosted,
  localSnapshots = [],
  onOpenLocal,
  onStartTemplate,
  onOpenBimLibrary,
  emptyHint = 'Open a registered CAD project or start from a drafting template.',
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const featuredTemplates = useMemo(() => TEMPLATE_METADATA_LIST.slice(0, 4), []);

  const showProjects = filter === 'all' || filter === 'projects';
  const showRevisions = filter === 'all' || filter === 'revisions';
  const showStarters = filter === 'all' || filter === 'starters';

  const hasAnything =
    (showProjects && hostedProjects.length > 0) ||
    (showRevisions && localSnapshots.length > 0) ||
    (showStarters && (featuredTemplates.length > 0 || !!onOpenBimLibrary));

  return (
    <div className="cad-project-gallery" aria-label="CAD Creator projects and revisions">
      <header className="cad-project-gallery__head">
        <div>
          <p className="cad-project-gallery__eyebrow">CAD Creator</p>
          <h2>Projects & revisions</h2>
          <p>Lightweight previews open into the real 2D / 3D workspace — no live engine in the gallery.</p>
        </div>
        <div className="cad-project-gallery__filters" role="tablist" aria-label="Gallery filters">
          {([
            ['all', 'All'],
            ['projects', 'Projects'],
            ['revisions', 'Revisions'],
            ['starters', 'Starters'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {!hasAnything ? (
        <p className="cad-project-gallery__empty" role="status">{emptyHint}</p>
      ) : (
        <div className="cad-project-gallery__grid">
          {showProjects &&
            hostedProjects.map((item) => (
              <CadResourceCard
                key={`hosted-${item.id}`}
                title={item.name}
                category="Registered BIM"
                meta={`Project · ${item.id.slice(0, 12)}${item.id.length > 12 ? '…' : ''}`}
                previewKind="model-3d"
                selected={selectedHostedId === item.id}
                preview={<CadPreview3DStatic seed={item.id} label={item.name} walls={10} rooms={4} />}
                openLabel="Open project"
                onOpen={onOpenHosted ? () => onOpenHosted(item.id) : undefined}
              />
            ))}

          {showRevisions &&
            localSnapshots.map((snap) => (
              <CadResourceCard
                key={`local-${snap.id}`}
                title={snap.name}
                category="Local revision"
                meta={`${snap.date} · ${snap.state.walls.length} walls · ${snap.state.rooms.length} spaces`}
                previewKind="plan-2d"
                preview={<CadPreview2D project={snap.state} />}
                openLabel="Restore"
                onOpen={onOpenLocal ? () => onOpenLocal(snap.state) : undefined}
              />
            ))}

          {showStarters &&
            onStartTemplate &&
            featuredTemplates.map((tpl) => (
              <CadResourceCard
                key={`tpl-${tpl.id}`}
                title={tpl.name}
                category={tpl.categoryLabel}
                meta={`${tpl.dimensions} · ${tpl.project.walls.length} walls · ${tpl.project.rooms.length} zones`}
                previewKind="plan-2d"
                preview={<CadPreview2D project={tpl.project} />}
                openLabel="Use template"
                secondaryLabel="2D preview"
                onOpen={() => onStartTemplate(cloneTemplateProject(tpl), tpl.name)}
              />
            ))}

          {showStarters && onOpenBimLibrary ? (
            <CadResourceCard
              title="Native BIM library"
              category="FreeCAD starters"
              meta="Thumbnails & inspectable mesh derivatives · source stays in FreeCAD"
              previewKind="model-3d"
              preview={<CadPreview3DStatic seed="bim-library" label="Native BIM library" walls={14} rooms={5} />}
              openLabel="Browse BIM"
              onOpen={onOpenBimLibrary}
            />
          ) : null}
        </div>
      )}

      {mode === 'hosted' && hostedProjects.length === 0 ? (
        <p className="cad-project-gallery__note">
          No registered Work projects yet. Sign in and attach a CAD registry, or start from a template below.
        </p>
      ) : null}
    </div>
  );
}
