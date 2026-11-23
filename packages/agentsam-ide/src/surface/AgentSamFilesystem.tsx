/**
 * Canonical, provider-neutral AgentSam filesystem surface.
 *
 * Migrated from the original dashboard AgentSamFilesystem concept: one file
 * source rail, one editor/tree, and source-context propagation to the agent.
 * Connections, OAuth, credentials, runtime grants and file I/O are provided by
 * the host. The component does not call a provider endpoint or store tokens.
 */
import { useCallback, useEffect, type ReactNode } from 'react';
import { WorkspaceEditor, type WorkspaceEditorProps } from './WorkspaceEditor.js';
import { WorkspaceSourceRail, type IDEFileSource, type IDEFileSourceId } from './WorkspaceSourceRail.js';
import type { FileWorkspace } from '../workspace/files.js';

export type AgentSamFilesystemSource = IDEFileSource & {
  /** The host has already resolved this source to an authorized filesystem. */
  workspace?: FileWorkspace | null;
  /** Stable, host-scoped namespace for tabs and models. Never an OAuth secret. */
  workspaceId?: string;
  workspaceLabel?: string;
  /** Non-secret provenance for the active editor context. */
  context?: {
    accountRef?: string;
    connectionId?: string;
    repository?: string;
    bucket?: string;
    root?: string;
  };
  connect?: () => void | Promise<void>;
  reconnect?: () => void | Promise<void>;
  manageConnection?: () => void;
};

export type AgentSamFilesystemContext = {
  sourceId: IDEFileSourceId;
  workspaceId: string | null;
  accountRef?: string;
  connectionId?: string;
  repository?: string;
  bucket?: string;
  root?: string;
  /** Workspace-relative file path; null when no file is open. */
  filePath: string | null;
  fileVersion?: string;
};

export function resolveAgentSamFilesystemSource(
  sources: readonly AgentSamFilesystemSource[],
  sourceId: IDEFileSourceId,
): AgentSamFilesystemSource | null {
  return sources.find(source => source.id === sourceId) ?? null;
}

export function canMountAgentSamFilesystemSource(source: AgentSamFilesystemSource | null): boolean {
  return Boolean(source?.workspace && (source.state === 'connected' || source.state === 'sample'));
}

export type AgentSamFilesystemProps = Omit<WorkspaceEditorProps,
  'workspace' | 'workspaceId' | 'label' | 'sources' | 'sourceId' | 'onSourceSelect' | 'onReconnect' | 'onConnectionSettings' | 'onActiveFileChange'
> & {
  sources: AgentSamFilesystemSource[];
  sourceId: IDEFileSourceId;
  onSourceSelect: (id: IDEFileSourceId) => void;
  /** Host's provider-specific account/repository/bucket picker, if required. */
  setup?: ReactNode;
  error?: string;
  onContextChange?: (context: AgentSamFilesystemContext) => void;
};

export function AgentSamFilesystem({
  sources, sourceId, onSourceSelect, setup, error, onContextChange,
  ...editorProps
}: AgentSamFilesystemProps) {
  const source = resolveAgentSamFilesystemSource(sources, sourceId);
  const workspaceId = source?.workspaceId || '';
  const sourceContext = source?.context;
  const handleActiveFile = useCallback((file: { path: string; version: string } | null) => {
    if (!onContextChange || !source) return;
    onContextChange({
      sourceId: source.id, workspaceId: source.workspaceId || null,
      ...source.context, filePath: file?.path || null,
      ...(file ? { fileVersion: file.version } : {}),
    });
  }, [onContextChange, source]);
  useEffect(() => {
    handleActiveFile(null);
  }, [sourceId, workspaceId]); // announce source changes without leaking previous file identity

  if (source && canMountAgentSamFilesystemSource(source)) {
    return <WorkspaceEditor
      {...editorProps}
      key={source.id + ':' + workspaceId}
      workspace={source.workspace!}
      workspaceId={workspaceId}
      label={source.workspaceLabel || source.label}
      sources={sources}
      sourceId={sourceId}
      onSourceSelect={onSourceSelect}
      onReconnect={source.reconnect || source.connect}
      onConnectionSettings={source.manageConnection}
      onActiveFileChange={handleActiveFile}
    />;
  }

  return <section className="asi-ide" aria-label="AgentSam filesystem">
    <div className="asi-main">
      <aside className="asi-aside" aria-label="File sources">
        <WorkspaceSourceRail sources={sources} sourceId={sourceId} onSelect={onSourceSelect} />
      </aside>
      <div className="asi-center">
        <div className="asi-alert" role="status">
          <strong>{source?.label || 'Files'}</strong>
          <span>{source?.detail || 'Select an authorized source to browse its files.'}</span>
        </div>
        {error && <div className="asi-alert" role="alert">{error}</div>}
        <div className="asi-side-content" style={{overflow:'auto',flex:1,padding:16}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
            {source?.connect && <button type="button" onClick={() => void source.connect?.()}>Connect {source.label}</button>}
            {source?.reconnect && <button type="button" onClick={() => void source.reconnect?.()}>Reconnect {source.label}</button>}
            {source?.manageConnection && <button type="button" onClick={source.manageConnection}>Connection settings</button>}
          </div>
          {setup}
          {!setup && !source?.connect && !source?.reconnect &&
            <p>{source?.state === 'connecting' ? 'Checking source permissions…' :
              'No authorized filesystem is selected. Connect a source or choose another.'}</p>}
        </div>
      </div>
    </div>
  </section>;
}
