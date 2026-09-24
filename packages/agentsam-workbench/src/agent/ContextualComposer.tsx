/**
 * CMS Editor — Agent Sam Contextual Composer primitives.
 *
 * Loop: select → ask → suggest (card) → accept → generate (polished gradient +
 * contained code stream) → land. Left inspector and right composer share one
 * selection model; threads persist independently of the current selection.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import './contextual-composer.css';

export type ComposerSelection = {
  id: string;
  kind: 'page' | 'section' | 'block' | 'element';
  label: string;
  path?: string[];
};

export type ComposerSuggestion = {
  id: string;
  title: string;
  rationale: string;
  selectionId?: string;
  selectionLabel?: string;
};

export type ComposerThreadMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'status'; text: string }
  | { id: string; role: 'suggestion'; suggestion: ComposerSuggestion }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'error'; text: string };

export type ComposerThread = {
  id: string;
  title: string;
  selectionId: string | null;
  selectionLabel: string | null;
  messages: ComposerThreadMessage[];
  updatedAt: string;
};

export type GenerationPhase =
  | 'reading'
  | 'drafting'
  | 'writing-styles'
  | 'wiring-settings'
  | 'done'
  | 'error';

export type GenerationState = {
  active: boolean;
  phase: GenerationPhase;
  label: string;
  codeLines: string[];
  selectionId: string | null;
  cancelable: boolean;
};

const PHASE_LABELS: Record<GenerationPhase, string> = {
  reading: 'Reading selection',
  drafting: 'Drafting markup',
  'writing-styles': 'Writing styles',
  'wiring-settings': 'Wiring settings',
  done: 'Done',
  error: 'Failed',
};

export function phaseLabel(phase: GenerationPhase): string {
  return PHASE_LABELS[phase] || phase;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export type ContextualComposerProps = {
  selection: ComposerSelection | null;
  threads: ComposerThread[];
  activeThreadId: string | null;
  working?: boolean;
  generation?: GenerationState | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onClose?: () => void;
  onSend: (prompt: string, selection: ComposerSelection | null) => void | Promise<void>;
  onAcceptSuggestion: (suggestion: ComposerSuggestion) => void | Promise<void>;
  onFeedback?: (suggestionId: string, vote: 'up' | 'down') => void;
  onCancelGeneration?: () => void;
  emptyPrompt?: string;
  className?: string;
  portable?: boolean;
};

export function ContextualComposer({
  selection,
  threads,
  activeThreadId,
  working = false,
  generation = null,
  onSelectThread,
  onNewThread,
  onClose,
  onSend,
  onAcceptSuggestion,
  onFeedback,
  onCancelGeneration,
  emptyPrompt = 'Where should we begin?',
  className = '',
  portable = false,
}: ContextualComposerProps) {
  const [draft, setDraft] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const active = threads.find((t) => t.id === activeThreadId) || null;
  const scopeChip = selection?.label || active?.selectionLabel || null;

  const title = active?.title || (selection ? `Edit ${selection.label}` : 'New conversation');

  async function submit() {
    const text = draft.trim();
    if (!text || working) return;
    setDraft('');
    await onSend(text, selection);
  }

  return (
    <aside
      className={`as-contextual-composer ${portable ? 'is-portable' : ''} ${className}`}
      data-agentsam-contextual-composer=""
      data-selection-id={selection?.id || undefined}
    >
      <header className="as-cc-header">
        <button
          type="button"
          className="as-cc-thread-switcher"
          aria-expanded={switcherOpen}
          onClick={() => setSwitcherOpen((v) => !v)}
        >
          <span className="as-cc-thread-title" title={title}>{title}</span>
          <span className="as-cc-chevron" aria-hidden>▾</span>
        </button>
        <button type="button" className="as-cc-icon-btn" aria-label="New conversation" onClick={onNewThread}>✎</button>
        {onClose ? (
          <button type="button" className="as-cc-icon-btn" aria-label="Close composer" onClick={onClose}>×</button>
        ) : null}
      </header>

      {switcherOpen ? (
        <div className="as-cc-thread-menu" role="listbox">
          {threads.length === 0 ? (
            <p className="as-cc-muted">No conversations yet</p>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                role="option"
                aria-selected={thread.id === activeThreadId}
                className={thread.id === activeThreadId ? 'active' : ''}
                onClick={() => {
                  onSelectThread(thread.id);
                  setSwitcherOpen(false);
                }}
              >
                <strong>{thread.title}</strong>
                {thread.selectionLabel ? <span>{thread.selectionLabel}</span> : <span>General</span>}
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="as-cc-body">
        {!active || active.messages.length === 0 ? (
          <div className="as-cc-empty">
            <div className="as-cc-mascot" aria-hidden />
            <p>{emptyPrompt}</p>
          </div>
        ) : (
          <div className="as-cc-messages">
            {active.messages.map((msg) => {
              if (msg.role === 'user') {
                return <div key={msg.id} className="as-cc-bubble user">{msg.text}</div>;
              }
              if (msg.role === 'status') {
                return (
                  <div key={msg.id} className="as-cc-status" role="status">
                    <span className="as-cc-spinner" aria-hidden />
                    {msg.text}
                  </div>
                );
              }
              if (msg.role === 'suggestion') {
                const s = msg.suggestion;
                return (
                  <div key={msg.id} className="as-cc-suggestion-wrap">
                    <button
                      type="button"
                      className="as-cc-suggestion-card"
                      onClick={() => void onAcceptSuggestion(s)}
                    >
                      <span className="as-cc-suggestion-icon" aria-hidden>✦</span>
                      <span className="as-cc-suggestion-copy">
                        <strong>{s.title}</strong>
                        <em>
                          {s.selectionLabel
                            ? `For “${s.selectionLabel}”. ${s.rationale}`
                            : s.rationale}
                        </em>
                      </span>
                      <span className="as-cc-suggestion-chevron" aria-hidden>›</span>
                    </button>
                    {onFeedback ? (
                      <div className="as-cc-feedback">
                        <button type="button" aria-label="Helpful" onClick={() => onFeedback(s.id, 'up')}>👍</button>
                        <button type="button" aria-label="Not helpful" onClick={() => onFeedback(s.id, 'down')}>👎</button>
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (msg.role === 'error') {
                return <div key={msg.id} className="as-cc-bubble error">{msg.text}</div>;
              }
              return <div key={msg.id} className="as-cc-bubble assistant">{msg.text}</div>;
            })}
            {working ? (
              <div className="as-cc-status" role="status">
                <span className="as-cc-spinner" aria-hidden />
                Working on it
              </div>
            ) : null}
          </div>
        )}
      </div>

      {generation?.active ? (
        <GenerationPreview
          phase={generation.phase}
          label={generation.label || phaseLabel(generation.phase)}
          codeLines={generation.codeLines}
          onCancel={generation.cancelable ? onCancelGeneration : undefined}
        />
      ) : null}

      <footer className="as-cc-input">
        {scopeChip ? <span className="as-cc-scope-chip">{scopeChip}</span> : null}
        <div className="as-cc-input-row">
          <button type="button" className="as-cc-icon-btn" aria-label="Attach" disabled>+</button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Work with AgentSam"
            aria-label="Work with AgentSam"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {working || generation?.active ? (
            <button type="button" className="as-cc-icon-btn" aria-label="Stop" onClick={onCancelGeneration}>■</button>
          ) : (
            <button type="button" className="as-cc-send" disabled={!draft.trim()} onClick={() => void submit()}>↑</button>
          )}
        </div>
      </footer>
    </aside>
  );
}

export type GenerationPreviewProps = {
  phase: GenerationPhase;
  label: string;
  codeLines: string[];
  onCancel?: () => void;
  dock?: 'composer' | 'sidebar' | 'canvas';
};

/** Contained code-stream preview — trust/transparency, not an approval surface. */
export function GenerationPreview({
  phase,
  label,
  codeLines,
  onCancel,
  dock = 'composer',
}: GenerationPreviewProps) {
  const scroller = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [codeLines]);

  return (
    <section className={`as-gen-preview dock-${dock}`} data-agentsam-generation-preview="" data-phase={phase}>
      <header>
        <span className="as-gen-title">Generating…</span>
        <span className="as-gen-phase">{label}</span>
        {onCancel ? (
          <button type="button" className="as-cc-icon-btn" aria-label="Cancel generation" onClick={onCancel}>■</button>
        ) : null}
      </header>
      <div className="as-gen-code-wrap">
        <pre ref={scroller} className="as-gen-code" aria-hidden>
          {codeLines.join('\n')}
        </pre>
        <div className="as-gen-gradient-veil" aria-hidden />
      </div>
      <p className="as-gen-note">You can keep editing — we’ll apply the change when it’s ready.</p>
      {onCancel ? (
        <button type="button" className="as-gen-remove" onClick={onCancel}>Remove block</button>
      ) : null}
    </section>
  );
}

/** Soft pink→purple wash occupying the landing region on the canvas. */
export function CanvasGenerationOverlay({
  active,
  bounds,
}: {
  active: boolean;
  bounds?: { top: number; left: number; width: number; height: number } | null;
}) {
  if (!active || !bounds) return null;
  return (
    <div
      className="as-canvas-gen-overlay"
      data-agentsam-canvas-generation=""
      style={{
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: Math.max(bounds.height, 72),
      }}
      aria-hidden
    />
  );
}

/** Floating “Thinking…” chip anchored to the selected canvas element. */
export function SelectionThinkingChip({
  visible,
  bounds,
  onStop,
}: {
  visible: boolean;
  bounds?: { top: number; left: number; width: number; height: number } | null;
  onStop?: () => void;
}) {
  if (!visible || !bounds) return null;
  return (
    <div
      className="as-thinking-chip"
      style={{
        top: Math.max(8, bounds.top - 36),
        left: bounds.left + bounds.width / 2,
      }}
      role="status"
    >
      <span className="as-thinking-icon" aria-hidden />
      Thinking…
      {onStop ? <button type="button" aria-label="Stop" onClick={onStop}>■</button> : null}
    </div>
  );
}

export type LayerNode = {
  id: string;
  kind: 'page' | 'section' | 'group' | 'block' | 'element';
  label: string;
  children?: LayerNode[];
};

export type PropertyInspectorValues = {
  text?: string;
  width?: 'fit' | 'fill';
  maxWidth?: 'narrow' | 'normal' | 'none';
  align?: 'left' | 'center' | 'right';
  typographyPreset?: string;
  textColor?: string;
  background?: boolean;
  padding?: { top: number; bottom: number; left: number; right: number };
};

export type LayersPropertyPanelProps = {
  pageLabel: string;
  layers: LayerNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  values: PropertyInspectorValues;
  highlightedKeys?: string[];
  onChange: (patch: Partial<PropertyInspectorValues>) => void;
  onRemove?: () => void;
  typographyPresets?: string[];
  onEditPresets?: () => void;
};

export function LayersPropertyPanel({
  pageLabel,
  layers,
  selectedId,
  onSelect,
  values,
  highlightedKeys = [],
  onChange,
  onRemove,
  typographyPresets = ['Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Body', 'Caption'],
  onEditPresets,
}: LayersPropertyPanelProps) {
  const pad = values.padding || { top: 0, bottom: 0, left: 0, right: 0 };
  const flash = (key: string) => (highlightedKeys.includes(key) ? 'is-agent-flash' : '');

  return (
    <aside className="as-layers-inspector" data-agentsam-layers-inspector="">
      <div className="as-layers-tree">
        <div className="as-layers-root">{pageLabel}</div>
        <LayerTree nodes={layers} selectedId={selectedId} onSelect={onSelect} depth={0} />
      </div>

      <div className="as-prop-editor">
        <h3>Text</h3>
        <div className={`as-prop-group ${flash('text')}`}>
          <div className="as-rich-toolbar" aria-label="Formatting">
            <span>H2</span><span>B</span><span>I</span><span>🔗</span><span>•</span><span>1.</span>
          </div>
          <textarea
            value={values.text || ''}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={3}
            aria-label="Text content"
          />
        </div>

        <h4>Layout</h4>
        <div className={`as-prop-group ${flash('width')}`}>
          <label>Width</label>
          <div className="as-segmented">
            {(['fit', 'fill'] as const).map((w) => (
              <button key={w} type="button" className={values.width === w ? 'active' : ''} onClick={() => onChange({ width: w })}>{w[0].toUpperCase() + w.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className={`as-prop-group ${flash('maxWidth')}`}>
          <label>Max width</label>
          <div className="as-segmented">
            {(['narrow', 'normal', 'none'] as const).map((w) => (
              <button key={w} type="button" className={values.maxWidth === w ? 'active' : ''} onClick={() => onChange({ maxWidth: w })}>{w[0].toUpperCase() + w.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className={`as-prop-group ${flash('align')}`}>
          <label>Alignment</label>
          <div className="as-segmented">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" className={values.align === a ? 'active' : ''} onClick={() => onChange({ align: a })} aria-label={a}>{a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸'}</button>
            ))}
          </div>
        </div>

        <h4>Typography</h4>
        <div className={`as-prop-group ${flash('typographyPreset')}`}>
          <label>Preset</label>
          <select
            value={values.typographyPreset || typographyPresets[3]}
            onChange={(e) => onChange({ typographyPreset: e.target.value })}
          >
            {typographyPresets.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {onEditPresets ? (
            <button type="button" className="as-linkish" onClick={onEditPresets}>Edit presets in theme settings</button>
          ) : null}
        </div>

        <h4>Appearance</h4>
        <div className={`as-prop-group ${flash('textColor')}`}>
          <label>Text color</label>
          <div className="as-swatch-row">
            <span className="as-swatch" style={{ background: values.textColor || '#111' }} />
            <span>{values.textColor ? values.textColor : 'Default'}</span>
          </div>
        </div>
        <div className={`as-prop-group ${flash('background')}`}>
          <label>Background</label>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(values.background)}
            className={`as-toggle ${values.background ? 'on' : ''}`}
            onClick={() => onChange({ background: !values.background })}
          />
        </div>

        <h4>Padding</h4>
        {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
          <div key={side} className={`as-prop-group as-pad-row ${flash(`padding.${side}`)}`}>
            <label>{side[0].toUpperCase() + side.slice(1)}</label>
            <input
              type="range"
              min={0}
              max={96}
              value={pad[side]}
              onChange={(e) => onChange({ padding: { ...pad, [side]: Number(e.target.value) } })}
            />
            <input
              type="number"
              min={0}
              max={96}
              value={pad[side]}
              onChange={(e) => onChange({ padding: { ...pad, [side]: Number(e.target.value) || 0 } })}
              aria-label={`${side} padding px`}
            />
            <span>px</span>
          </div>
        ))}

        {onRemove ? (
          <button type="button" className="as-remove-block" onClick={onRemove}>🗑 Remove block</button>
        ) : null}
      </div>
    </aside>
  );
}

function LayerTree({
  nodes,
  selectedId,
  onSelect,
  depth,
}: {
  nodes: LayerNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  return (
    <ul className="as-layer-list" style={{ ['--depth' as string]: depth }}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className={node.id === selectedId ? 'selected' : ''}
            onClick={() => onSelect(node.id)}
          >
            <span className="as-layer-kind">{node.kind}</span>
            <span className="as-layer-label">{node.label}</span>
          </button>
          {node.children?.length ? (
            <LayerTree nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Hook: multi-thread composer state that survives redock/resize. */
export function useContextualComposerState(storageKey = 'agentsam.cms.composer.threads') {
  const [threads, setThreads] = useState<ComposerThread[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as ComposerThread[]) : [];
    } catch {
      return [];
    }
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [generation, setGeneration] = useState<GenerationState | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(threads));
    } catch { /* ignore */ }
  }, [storageKey, threads]);

  const newThread = useCallback((selection: ComposerSelection | null = null) => {
    const thread: ComposerThread = {
      id: uid('thread'),
      title: selection ? `Edit ${selection.label}` : 'New conversation',
      selectionId: selection?.id || null,
      selectionLabel: selection?.label || null,
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    return thread;
  }, []);

  const appendMessage = useCallback((threadId: string, message: ComposerThreadMessage) => {
    setThreads((prev) => prev.map((t) => (
      t.id === threadId
        ? { ...t, messages: [...t.messages, message], updatedAt: new Date().toISOString() }
        : t
    )));
  }, []);

  return {
    threads,
    setThreads,
    activeThreadId,
    setActiveThreadId,
    working,
    setWorking,
    generation,
    setGeneration,
    newThread,
    appendMessage,
    uid,
    phaseLabel,
  };
}

export type ContextualComposerHostProps = {
  selection: ComposerSelection | null;
  layers: LayerNode[];
  pageLabel: string;
  propertyValues: PropertyInspectorValues;
  onPropertyChange: (patch: Partial<PropertyInspectorValues>) => void;
  onSelectLayer: (id: string) => void;
  onRemoveBlock?: () => void;
  /** Host-owned suggestion planner — return one primary card. */
  planSuggestion: (prompt: string, selection: ComposerSelection | null) => Promise<ComposerSuggestion>;
  /** Host-owned generator — stream phases/code; apply change on completion. */
  runGeneration: (
    suggestion: ComposerSuggestion,
    emit: (partial: Partial<GenerationState>) => void,
    signal: AbortSignal,
  ) => Promise<{ confirmation: string; propertyPatch?: Partial<PropertyInspectorValues> }>;
  flashKeys?: string[];
  onFlashKeys?: (keys: string[]) => void;
  children?: ReactNode;
};

/**
 * Reference host wiring the left inspector + right composer + canvas overlays.
 * Transport/planning stay host-owned (AgentSam runtime / MCP).
 */
export function ContextualComposerHost({
  selection,
  layers,
  pageLabel,
  propertyValues,
  onPropertyChange,
  onSelectLayer,
  onRemoveBlock,
  planSuggestion,
  runGeneration,
  flashKeys = [],
  onFlashKeys,
  children,
}: ContextualComposerHostProps) {
  const state = useContextualComposerState();
  const abortRef = useRef<AbortController | null>(null);
  const [overlayBounds, setOverlayBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!selection) return;
    const el = document.querySelector(`[data-agentsam-resource="${CSS.escape(selection.id)}"]`);
    if (el) setOverlayBounds(el.getBoundingClientRect());
  }, [selection]);

  async function handleSend(prompt: string, sel: ComposerSelection | null) {
    let threadId = state.activeThreadId;
    if (!threadId) threadId = state.newThread(sel).id;
    state.appendMessage(threadId, { id: state.uid('msg'), role: 'user', text: prompt });
    state.setWorking(true);
    try {
      const suggestion = await planSuggestion(prompt, sel);
      state.appendMessage(threadId, {
        id: state.uid('msg'),
        role: 'suggestion',
        suggestion: {
          ...suggestion,
          selectionId: sel?.id,
          selectionLabel: sel?.label,
        },
      });
    } catch (error) {
      state.appendMessage(threadId, {
        id: state.uid('msg'),
        role: 'error',
        text: error instanceof Error ? error.message : 'Could not plan a suggestion.',
      });
    } finally {
      state.setWorking(false);
    }
  }

  async function handleAccept(suggestion: ComposerSuggestion) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    state.setGeneration({
      active: true,
      phase: 'reading',
      label: phaseLabel('reading'),
      codeLines: [],
      selectionId: suggestion.selectionId || null,
      cancelable: true,
    });
    try {
      const result = await runGeneration(
        suggestion,
        (partial) => {
          state.setGeneration((prev) => (prev ? {
            ...prev,
            ...partial,
            label: partial.label || (partial.phase ? phaseLabel(partial.phase) : prev.label),
            codeLines: partial.codeLines || prev.codeLines,
          } : prev));
        },
        controller.signal,
      );
      if (result.propertyPatch) {
        onPropertyChange(result.propertyPatch);
        const keys = Object.keys(result.propertyPatch);
        onFlashKeys?.(keys);
        window.setTimeout(() => onFlashKeys?.([]), 1200);
      }
      if (state.activeThreadId) {
        state.appendMessage(state.activeThreadId, {
          id: state.uid('msg'),
          role: 'assistant',
          text: result.confirmation,
        });
      }
      state.setGeneration(null);
    } catch (error) {
      if (controller.signal.aborted) {
        state.setGeneration(null);
        return;
      }
      state.setGeneration(null);
      if (state.activeThreadId) {
        state.appendMessage(state.activeThreadId, {
          id: state.uid('msg'),
          role: 'error',
          text: error instanceof Error ? error.message : 'Generation failed.',
        });
      }
    }
  }

  return (
    <div className="as-contextual-shell" data-agentsam-contextual-shell="">
      <LayersPropertyPanel
        pageLabel={pageLabel}
        layers={layers}
        selectedId={selection?.id || null}
        onSelect={onSelectLayer}
        values={propertyValues}
        highlightedKeys={flashKeys}
        onChange={onPropertyChange}
        onRemove={onRemoveBlock}
      />
      <div className="as-contextual-canvas">
        {children}
        <CanvasGenerationOverlay active={Boolean(state.generation?.active)} bounds={overlayBounds} />
        <SelectionThinkingChip visible={state.working} bounds={overlayBounds} onStop={() => state.setWorking(false)} />
      </div>
      <ContextualComposer
        selection={selection}
        threads={state.threads}
        activeThreadId={state.activeThreadId}
        working={state.working}
        generation={state.generation}
        onSelectThread={state.setActiveThreadId}
        onNewThread={() => state.newThread(selection)}
        onSend={handleSend}
        onAcceptSuggestion={handleAccept}
        onCancelGeneration={() => {
          abortRef.current?.abort();
          state.setGeneration(null);
        }}
      />
    </div>
  );
}
