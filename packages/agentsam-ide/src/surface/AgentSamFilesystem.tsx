/**
 * Canonical, provider-neutral AgentSam filesystem surface.
 *
 * Migrated from the original dashboard AgentSamFilesystem concept: one file
 * source rail, one editor/tree, and source-context propagation to the agent.
 * Connections, OAuth, credentials, runtime grants and file I/O are provided by
 * the host. The component does not call a provider endpoint or store tokens.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { WorkspaceEditor, type WorkspaceEditorProps, type UntitledEditorDraft } from './WorkspaceEditor.js';
import { type IDEFileSource, type IDEFileSourceId } from './WorkspaceSourceRail.js';
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
    branch?: string;
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
  branch?: string;
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
  const [drafts,setDrafts]=useState<UntitledEditorDraft[]>([]);
  // Disconnected state is a real editor surface, never a fake filesystem.
  // No operation mutates a provider until the host grants and supplies one.
  const disconnectedWorkspace=useMemo<FileWorkspace>(()=>({
    async list(){return [];},
    async read(){throw Error('Connect a file source before opening provider files.');},
    async write(){return {ok:false,code:'source_not_connected',message:'Connect a writable source before saving.'};},
    async create(){throw Error('Connect a writable source before creating files.');},
    async rename(){throw Error('Connect a source before renaming.');},
    async delete(){throw Error('Connect a source before deleting.');},
    async search(){return [];},
    async history(){return [];},
    async restore(){return {ok:false,code:'source_not_connected',message:'Connect a source before restoring.'};},
    configuration:{readonly:true,manualSave:true,capabilities:{
      create:false,rename:false,delete:false,search:false,history:false,restore:false,
      changes:false,snapshot:false,
    }},
  }),[]);
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


  const authorized=Boolean(source&&canMountAgentSamFilesystemSource(source));
  const connectionPanel=authorized?null:<div className="asi-source-connection-panel" role="group" aria-label="Connect file source">
    <strong>{source?.label||'Connect a file source'}</strong>
    <p>{error||source?.detail||'New untitled files can be edited immediately. Connect a source when you need to browse or save files.'}</p>
    <div className="asi-source-connection-actions">
      {source?.connect&&<button type="button" onClick={()=>void source.connect?.()}>Connect {source.label}</button>}
      {source?.reconnect&&<button type="button" onClick={()=>void source.reconnect?.()}>Reconnect</button>}
      {source?.manageConnection&&<button type="button" onClick={source.manageConnection}>Manage connection</button>}
    </div>
    {setup}
  </div>;
  return <WorkspaceEditor
    {...editorProps}
    key={(source?.id||sourceId)+':'+(authorized?workspaceId:'disconnected')}
    workspace={authorized?source!.workspace!:disconnectedWorkspace}
    workspaceId={authorized?workspaceId:'disconnected:'+sourceId}
    label={authorized?(source?.workspaceLabel||source?.label||'Files'):'Files · Untitled'}
    sources={sources}
    sourceId={sourceId}
    onSourceSelect={onSourceSelect}
    onReconnect={source?.reconnect||source?.connect}
    onConnectionSettings={source?.manageConnection}
    onActiveFileChange={handleActiveFile}
    initialUntitledDrafts={drafts}
    onUntitledDraftsChange={setDrafts}
    connectionPanel={connectionPanel}
  />;
}
