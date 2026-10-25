import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { TEMPLATE_METADATA_LIST, type TemplateMetadata } from '../lib/templates';
import { TemplateSchematic } from './TemplateSchematic';

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
  <div className="size-full overflow-y-auto bg-slate-950 p-4 text-left" aria-label="Start from a template">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-100">Start from a template</h2>
        <p className="text-xs text-slate-400">
          Opens an unsaved copy. Pick a saved project from the menu above to inspect a registered model instead.
        </p>
      </div>
      {onBrowseAll && (
        <button
          type="button"
          onClick={onBrowseAll}
          className="flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-slate-200 hover:bg-white/10"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Browse full library</span>
        </button>
      )}
    </div>

    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      {TEMPLATE_METADATA_LIST.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => onSelect(cloneTemplateProject(tpl), tpl.name)}
          aria-label={`Start editing ${tpl.name}`}
          className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 text-left transition hover:border-blue-500/60 hover:bg-slate-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <span className="sr-only">Start editing {tpl.name}</span>
          <div className="h-28 w-full border-b border-white/10 bg-[#161616]">
            <TemplateSchematic project={tpl.project} />
          </div>
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[length:var(--text-xs)] uppercase tracking-wide text-blue-400">{tpl.categoryLabel}</span>
              <span className="shrink-0 font-mono text-[length:var(--text-xs)] text-slate-400">{tpl.dimensions}</span>
            </div>
            <h3 className="text-xs font-semibold text-white">{tpl.name}</h3>
            <p className="line-clamp-2 text-[length:var(--text-sm)] text-slate-400">{tpl.description}</p>
            <div className="mt-auto flex items-center justify-between pt-2 font-mono text-[length:var(--text-xs)] text-slate-500">
              <span>
                {tpl.project.walls.length} walls · {tpl.project.rooms.length} zones · {tpl.project.furniture.length} fixtures
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-500 transition group-hover:text-blue-400" />
            </div>
          </div>
        </button>
      ))}
    </div>
  </div>
);
