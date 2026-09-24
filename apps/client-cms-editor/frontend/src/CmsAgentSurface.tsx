import { useMemo, useState } from 'react';
import type { AgentPrincipal, AgentWorkbenchAdapter } from '@inneranimalmedia/agentsam-contracts';
import { ConnectedAgentPanel } from '@inneranimalmedia/agentsam-workbench/agent';
import {
  ContextualComposerHost,
  type ComposerSelection,
  type ComposerSuggestion,
  type GenerationPhase,
  type LayerNode,
  type PropertyInspectorValues,
  phaseLabel,
} from '@inneranimalmedia/agentsam-workbench/agent';
import { createCmsAgentContextProvider } from '@inneranimalmedia/agentsam-cms-shared';

export type CmsAgentSurfaceProps = {
  adapter: AgentWorkbenchAdapter;
  principal: AgentPrincipal;
  projectId: string;
  conversationId: string;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  publicationRevision?: number | null;
  className?: string;
  /** When true, use the Sidekick-style contextual composer shell instead of the plain ConnectedAgentPanel. */
  contextual?: boolean;
  selection?: ComposerSelection | null;
  layers?: LayerNode[];
  pageLabel?: string;
  propertyValues?: PropertyInspectorValues;
  onPropertyChange?: (patch: Partial<PropertyInspectorValues>) => void;
  onSelectLayer?: (id: string) => void;
  onRemoveBlock?: () => void;
  children?: React.ReactNode;
};

/**
 * CMS-specific adapter around the shared AgentSam workbench.
 * Host supplies authenticated principal + explicit CMS selection state.
 *
 * `contextual` enables the select → suggest → generate → land loop
 * (see docs/CMS_CONTEXTUAL_COMPOSER.md).
 */
export function CmsAgentSurface({
  adapter,
  principal,
  projectId,
  conversationId,
  route,
  pageId,
  sectionId,
  blockId,
  publicationRevision,
  className,
  contextual = false,
  selection = null,
  layers = [],
  pageLabel = 'Home page',
  propertyValues,
  onPropertyChange,
  onSelectLayer,
  onRemoveBlock,
  children,
}: CmsAgentSurfaceProps) {
  const contextProvider = useMemo(() => createCmsAgentContextProvider(() => ({
    principal,
    projectId,
    route,
    pageId,
    sectionId,
    blockId,
    publicationRevision,
  })), [blockId, pageId, principal, projectId, publicationRevision, route, sectionId]);

  const [values, setValues] = useState<PropertyInspectorValues>(
    propertyValues || {
      text: selection?.label || '',
      width: 'fit',
      maxWidth: 'normal',
      align: 'left',
      typographyPreset: 'Heading 4',
      background: false,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    },
  );
  const [flashKeys, setFlashKeys] = useState<string[]>([]);

  if (!contextual) {
    return (
      <ConnectedAgentPanel
        className={className}
        adapter={adapter}
        contextProvider={contextProvider}
        conversationId={conversationId}
        header={<div data-cms-agent-header="">AgentSam · CMS</div>}
        empty={<div data-cms-agent-empty="">Where should we begin?</div>}
      />
    );
  }

  return (
    <ContextualComposerHost
      selection={selection}
      layers={layers}
      pageLabel={pageLabel}
      propertyValues={values}
      flashKeys={flashKeys}
      onFlashKeys={setFlashKeys}
      onPropertyChange={(patch) => {
        setValues((prev) => ({ ...prev, ...patch, padding: { ...(prev.padding || { top: 0, bottom: 0, left: 0, right: 0 }), ...(patch.padding || {}) } }));
        onPropertyChange?.(patch);
      }}
      onSelectLayer={(id) => onSelectLayer?.(id)}
      onRemoveBlock={onRemoveBlock}
      planSuggestion={async (prompt, sel) => demoPlanSuggestion(prompt, sel)}
      runGeneration={async (suggestion, emit, signal) => demoRunGeneration(suggestion, emit, signal)}
    >
      <div className={className} data-cms-agent-contextual="">
        {children || (
          <div style={{ padding: 24, color: '#71717a' }}>
            Select a block in the canvas. AgentSam proposes a prebuilt solution scoped to that selection.
          </div>
        )}
      </div>
    </ContextualComposerHost>
  );
}

function demoPlanSuggestion(prompt: string, selection: ComposerSelection | null): ComposerSuggestion {
  const label = selection?.label || 'this block';
  const lower = prompt.toLowerCase();
  if (lower.includes('announcement') || lower.includes('scroll')) {
    return {
      id: `sug_${Date.now()}`,
      title: 'Create a scroll-controlled announcement bar',
      rationale: `This will replace “${label}” with a prebuilt scroll-triggered announcement bar you can theme in the inspector.`,
      selectionId: selection?.id,
      selectionLabel: selection?.label,
    };
  }
  return {
    id: `sug_${Date.now()}`,
    title: `Refine “${label}”`,
    rationale: 'Apply a focused edit to the selected element using the shared block model (same fields the left inspector owns).',
    selectionId: selection?.id,
    selectionLabel: selection?.label,
  };
}

async function demoRunGeneration(
  suggestion: ComposerSuggestion,
  emit: (partial: { phase?: GenerationPhase; label?: string; codeLines?: string[] }) => void,
  signal: AbortSignal,
) {
  const phases: GenerationPhase[] = ['reading', 'drafting', 'writing-styles', 'wiring-settings'];
  const lines: string[] = [];
  for (const phase of phases) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    emit({ phase, label: phaseLabel(phase) });
    const snippets = [
      `/* ${phase} · ${suggestion.title} */`,
      `.ai-block--${(suggestion.selectionId || 'new').slice(0, 8)} {`,
      `  width: {{ block.settings.desktop_width }};`,
      `  /* scroll-trigger: ${phase === 'wiring-settings' ? 'armed' : 'pending'} */`,
      `}`,
    ];
    for (const line of snippets) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      lines.push(line);
      emit({ codeLines: [...lines] });
      await wait(180);
    }
  }
  return {
    confirmation: `Applied “${suggestion.title}”. Keep customizing — text, color, and scroll settings are live in the left inspector.`,
    propertyPatch: {
      text: suggestion.selectionLabel ? `Announcement · ${suggestion.selectionLabel}` : 'Announcement',
      typographyPreset: 'Heading 4',
      width: 'fill' as const,
    },
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
