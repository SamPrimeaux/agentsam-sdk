/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ProjectState,
  ActiveTool,
  MultiplayerUser,
  MeasurementUnit,
  FurnitureCategory,
  UserRole
} from '@inneranimalmedia/agentsam-cad-shared';
import { TEMPLATES } from '../lib/templates';
import { createEmptyCadProject } from '../lib/create-empty-project';
import { loadDreamHouseProject } from '../lib/dreamhouse-source';
import { loadOwnerDreamHouseProject } from '../lib/owner-project-source';
import { cloneProjectForPublicUser, createPublicExampleProject, isTrustedLocalCadHost, type CadAccessMode } from '../lib/project-access';
import {
  CadEngineeringToolbar, CadProjectExplorer, CadPropertyInspector,
  type CadElementSelection, type CadElementGroup
} from '../components/EngineeringWorkbench';
import { getPermissions } from '../lib/permissions';
import { collaborationClient } from '../lib/socket';
import { Canvas2D } from '../components/Canvas2D';
import { Viewport3D } from '../components/Viewport3D';
import {CadWorldViewport} from '../components/DreamHouseWorldViewport';
import { listHostedProjects, loadHostedProject, type CadHostedSelection } from '../lib/hosted-project-source';
import { BimStartersWorkspace } from '../components/BimStartersWorkspace';
import { NativeSketchCanvas } from '../components/NativeSketchCanvas';
import { LazyRoboticsWorkspace, preloadRoboticsWorkspace } from '../workspaces/robotics/lazy';
import { ExportPublishModal } from '../components/ExportPublishModal';
import { FurniturePicker } from '../components/FurniturePicker';
import { SketchUploadModal } from '../components/SketchUploadModal';
import { CloudProjectsModal } from '../components/CloudProjectsModal';
import { TemplateLibraryModal } from '../components/TemplateLibraryModal';
import { TemplateStarterGrid } from '../components/TemplateStarterGrid';
import { ProjectRuntimePanel } from '../components/ProjectRuntimePanel';
import { CadStatusStrip } from './CadStatusStrip';
import { installCadPreviewGuestBridge, type CadOutbound } from '../lib/agentsam-preview-bridge';
import { MiniAgentSam } from '@inneranimalmedia/agentsam-workbench/agent';
import '@inneranimalmedia/agentsam-workbench/agent/mini-agentsam.css';
import { buildSelectionContext, verifiedSelectionRevision, type CadSelectionContext } from '../lib/cad/selection';
import { useCadTools } from '../lib/execution/useCadTools';
import {
  WORKSPACE_REGISTRY,
  WorkspaceDescriptor,
  WorkspaceId,
  DEFAULT_RUNTIME_CAPABILITIES
} from './workspaceRegistry';
import {
  Box,
  Layers,
  Columns,
  Sparkles,
  FileScan,
  Armchair,
  Magnet,
  Shield,
  LayoutGrid,
  Camera,
  Play,
  RotateCcw,
  Activity
} from 'lucide-react';

export interface CadCreatorAppProps {
  presentation?: 'standalone' | 'embedded';
  accessMode?: CadAccessMode;
  initialWorkspace?: WorkspaceId;
  onNavigateHost?: (path: string) => void;
}

export function CadCreatorApp({
  presentation = 'standalone',
  accessMode = 'public-demo',
  initialWorkspace = 'plan',
  onNavigateHost
}: CadCreatorAppProps) {
  const canCollaborate = accessMode === 'owner'
    && typeof window !== 'undefined'
    && isTrustedLocalCadHost(window.location.hostname);
  const startNewProject = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('new') === '1';

  // 1. Core Project State. Public users get an independent starter, never the owner's project ID.
  const [showBimStarters, setShowBimStarters] = useState(false);
  const [project, setProject] = useState<ProjectState>(() => accessMode === 'public-demo' && !startNewProject
    ? createPublicExampleProject()
    : createEmptyCadProject());
  const [sourceStatus,setSourceStatus] = useState<'loading'|'loaded'|'unavailable'>(() => accessMode !== 'owner' || startNewProject ? 'loaded' : 'loading');
  const [sourceError,setSourceError] = useState('');
  const [hostedProjects,setHostedProjects] = useState<Array<{id:string;name:string}>>([]);
  const [hostedProjectId,setHostedProjectId] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('project') || '');
  const [hostedRevision,setHostedRevision] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('revision') || '');
  const [hostedSelection,setHostedSelection] = useState<CadHostedSelection|null>(null);
  useEffect(() => {
    if (accessMode !== 'hosted-project') return;
    let active=true;
    void listHostedProjects().then(rows => {if(active)setHostedProjects(rows);}).catch(error => {if(active)setSourceError(String(error));});
    return () => {active=false;};
  },[accessMode]);
  useEffect(() => {
    if (accessMode !== 'hosted-project' || !hostedProjectId) return;
    let active=true;
    setSourceStatus('loading');setSourceError('');setHostedSelection(null);
    void loadHostedProject(hostedProjectId,hostedRevision||undefined).then(selection=>{
      if(!active)return;
      setProject(selection.project || { ...createEmptyCadProject(), id: hostedProjectId, name: selection.registry.project.name });setHostedSelection(selection);
      setHistory([]);setRedoStack([]);setUiSelection(null);setVerifiedProjectRevision(null);
      setActiveWorkspace('model');setPlanLayout('split');
      setExplorerOpen(false);setInspectorOpen(false);setSourceStatus('loaded');
    }).catch(error=>{if(active){setSourceStatus('unavailable');setSourceError(error instanceof Error?error.message:String(error));}});
    return () => {active=false;};
  },[accessMode,hostedProjectId,hostedRevision]);
  const openDreamHouse = useCallback(async () => {
    setSourceStatus('loading');
    setSourceError('');
    // Owner mode uses the local project authority; public mode only reads a published example.
    // A failed request never replaces the current canvas or falls back across the boundary.
    try {
      const source = accessMode === 'owner'
        ? await loadOwnerDreamHouseProject()
        : await loadDreamHouseProject();
      const nextProject = accessMode === 'owner'
        ? source
        : cloneProjectForPublicUser(source, 'DreamHouse · Personal Example');
      setProject(nextProject);
      setHistory([]); setRedoStack([]); setUiSelection(null); setVerifiedProjectRevision(null);
      const requestedWorkspace = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('workspace');
      setActiveWorkspace(requestedWorkspace === 'samsketch' ? 'plan' : 'model'); setPlanLayout('split');
      setExplorerOpen(false); setInspectorOpen(false);
      setSourceStatus('loaded');
    } catch (error) {
      setSourceStatus('unavailable');
      setSourceError(error instanceof Error ? error.message : 'DreamHouse project source unavailable');
    }
  }, [accessMode]);
  useEffect(() => {
    if (startNewProject) {
      setSourceStatus('loaded');
      setSourceError('');
    } else if (accessMode === 'hosted-project') {
      // The authenticated registry owns loading; never substitute a starter.
      if (!hostedProjectId) setSourceStatus('loaded');
    } else if (accessMode === 'public-demo') {
      setProject(createPublicExampleProject());
      setSourceStatus('loaded');
      setSourceError('');
    } else {
      void openDreamHouse();
    }
    const reopen = () => { void openDreamHouse(); };
    const blank = () => startBlankProject();
    window.addEventListener('agentsam:cad-open-dreamhouse', reopen);
    window.addEventListener('agentsam:cad-new-project', blank);
    return () => {
      window.removeEventListener('agentsam:cad-open-dreamhouse', reopen);
      window.removeEventListener('agentsam:cad-new-project', blank);
    };
  }, [accessMode, openDreamHouse, startNewProject]);

  // Undo / Redo history stacks
  const [history, setHistory] = useState<ProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectState[]>([]);

  // 2. Workspace & Layout State
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(initialWorkspace === 'parametric' || initialWorkspace === 'render' ? 'model' : initialWorkspace);
  const [planLayout, setPlanLayout] = useState<'2d' | 'split' | 'sketch'>('split');
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [explorerOpen, setExplorerOpen] = useState(() => presentation !== 'embedded' && (typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches));
  const [inspectorOpen, setInspectorOpen] = useState(() => presentation !== 'embedded' && (typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches));
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [studioView,setStudioView]=useState<'preview'|'edit'|'code'>('edit');
  const [uiSelection, setUiSelection] = useState<CadElementSelection>(null);
  // Embedded CAD starts with the model as the stage. Show one contextual drawer
  // only when the user selects an element or requests a panel.
  useEffect(() => {
    if (presentation !== 'embedded' || !uiSelection) return;
    setInspectorOpen(true);
    setExplorerOpen(false);
  }, [presentation, uiSelection]);
  const [cadAccent, setCadAccent] = useState<string>(() => {
    if (typeof window === 'undefined') return '#82a7fb';
    const color = window.localStorage.getItem('agentsam.cad.interface.accent');
    return color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#82a7fb';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('agentsam.cad.interface.accent', cadAccent);
  }, [cadAccent]);
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<string | null>(null);
  const [unit, setUnit] = useState<MeasurementUnit>('ft');
  const [cadSelection, setCadSelection] = useState<CadSelectionContext | null>(null);
  const [verifiedProjectRevision, setVerifiedProjectRevision] = useState<{projectId:string;revision:number}|null>(null);
  const onVerifiedRevision = useCallback((revision:number|null, projectId:string) => {
    setVerifiedProjectRevision(revision === null ? null : {projectId,revision});
  }, []);
  const bridgeRef = React.useRef<{ post: (m: CadOutbound) => void; dispose: () => void } | null>(null);
  const [chromeFolded, setChromeFolded] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [copilotDraft, setCopilotDraft] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  useEffect(() => {
    const handle = (event: Event) => {
      setAssistantReply((event as CustomEvent<string>).detail || 'No assistant response');
    };
    window.addEventListener('agentsam:cad-assistant-response', handle);
    return () => window.removeEventListener('agentsam:cad-assistant-response', handle);
  }, []);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Robotics is an optional heavy workspace.
  const roboticsContainerRef = useRef<HTMLDivElement>(null);
  const [roboticsDarkMode, setRoboticsDarkMode] = useState(true);
  const [showRoboticsDiagnostics, setShowRoboticsDiagnostics] = useState(false);

  // Real-time CAD tool discovery (OpenSCAD, FreeCAD, Blender, Meshy, MuJoCo)
  const { capabilities: liveCapabilities, report: cadToolsReport } = useCadTools();

  // 3. Modals State
  const [isFurniturePickerOpen, setIsFurniturePickerOpen] = useState(false);
  const [isSketchModalOpen, setIsSketchModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  // Hosted mode only: name of the unsaved template copy being edited. Null means no copy is open.
  const [templateCopyName, setTemplateCopyName] = useState<string | null>(null);
  const [isExportPublishOpen, setIsExportPublishOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 4. Real-time Multiplayer Collaboration & Roles
  const [roomId, setRoomId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'studio-main';
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'studio-main';
  });

  const [currentUser, setCurrentUser] = useState<MultiplayerUser>(() => {
    return {
      id: 'local_' + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36)),
      name: 'Local CAD Editor',
      color: '#82a7fb',
      role: accessMode === 'hosted-project' ? 'Viewer' : canCollaborate ? 'Owner' : 'Editor',
      selectedIds: [],
      activeTool: 'select',
      lastActive: Date.now()
    };
  });

  const [remoteUsers, setRemoteUsers] = useState<MultiplayerUser[]>([]);
  const [isSynced, setIsSynced] = useState(false);

  const permissions = getPermissions(currentUser.role);
  const isViewer = currentUser.role === 'Viewer';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Connect to AgentSam Preview Bridge when embedded in host
  useEffect(() => {
    if (presentation !== 'embedded') return;
    const bridge = installCadPreviewGuestBridge({
      activeWorkspace,
      onSelectWorkspace: (wsId) => handleSelectWorkspace(wsId as WorkspaceId),
      onSetTheme: (dark) => setIsDarkMode(dark),
      onAssistantResponse: (_rid, text) => window.dispatchEvent(new CustomEvent('agentsam:cad-assistant-response', { detail: text }))
    });
    bridgeRef.current = bridge;
    return () => { bridge.dispose(); bridgeRef.current = null; };
  }, [presentation, activeWorkspace]);

  // Preload robotics when user hovers or selects robotics
  const handleSelectWorkspace = (wsId: WorkspaceId) => {
    if (wsId === 'robotics') {
      preloadRoboticsWorkspace();
    }
    // Legacy 'parametric' prototype surface removed; real OCCT parametric objects live in the model workspace.
    setActiveWorkspace(wsId === 'parametric' ? 'model' : wsId);
  };

  // Initialize WebSocket Collaboration
  useEffect(() => {
    setIsSynced(false);
    if (!canCollaborate) {
      setRemoteUsers([]);
      return;
    }
    collaborationClient.connect(roomId, currentUser);
    const unsubConnected = collaborationClient.on('connected', () => setIsSynced(true));
    const unsubDisconnected = collaborationClient.on('disconnected', () => setIsSynced(false));

    const unsubJoined = collaborationClient.on('user_joined', (user: MultiplayerUser) => {
      setRemoteUsers((prev) => [...prev.filter((u) => u.id !== user.id), user]);
      showToast(`${user.name} joined as ${user.role || 'Editor'}`);
    });

    const unsubLeft = collaborationClient.on('user_left', ({ userId }: { userId: string }) => {
      setRemoteUsers((prev) => prev.filter((u) => u.id !== userId));
    });

    const unsubRoomUsers = collaborationClient.on('room_users', (data: any) => {
      const usersList: MultiplayerUser[] = Array.isArray(data) ? data : data.users || [];
      setRemoteUsers(usersList.filter((u) => u.id !== currentUser.id));
      if (data.yourRole) {
        setCurrentUser((prev) => ({ ...prev, role: data.yourRole }));
      }
    });

    const unsubRoleUpdated = collaborationClient.on('role_updated', (data: { role: UserRole; by?: string }) => {
      if (data.role) {
        setCurrentUser((prev) => ({ ...prev, role: data.role }));
        showToast(`Your permission role was updated to: ${data.role}`);
      }
    });

    const unsubDenied = collaborationClient.on('permission_denied', (data: { reason: string }) => {
      showToast(`Permission Denied: ${data.reason}`);
    });

    const unsubProjectUpdate = collaborationClient.on('project_update', (remoteProject: ProjectState) => {
      setProject(remoteProject);
      setIsSynced(true);
    });

    const unsubCursor = collaborationClient.on('cursor_move', (data: { userId: string; x: number; y: number; view: '2d' | '3d' }) => {
      setRemoteUsers((prev) =>
        prev.map((u) => (u.id === data.userId ? { ...u, cursor: data } : u))
      );
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubJoined();
      unsubLeft();
      unsubRoomUsers();
      unsubRoleUpdated();
      unsubDenied();
      unsubProjectUpdate();
      unsubCursor();
      collaborationClient.disconnect();
    };
  }, [canCollaborate, roomId, currentUser.id]);

  // Project state updater with History & Socket broadcasting
  const updateProject = useCallback((updater: (prev: ProjectState) => ProjectState) => {
    if (isViewer) {
      showToast('Action restricted: Viewers cannot modify project geometry');
      return;
    }

    setVerifiedProjectRevision(null);
    setProject((prev) => {
      const next = updater(prev);
      setHistory((h) => [...h.slice(-20), prev]);
      setRedoStack([]);
      if (canCollaborate) collaborationClient.sendProjectUpdate(next);
      return next;
    });
  }, [isViewer, canCollaborate]);

  // Undo / Redo
  const handleUndo = () => {
    if (isViewer || history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((r) => [...r, project]);
    setHistory((h) => h.slice(0, h.length - 1));
    setProject(previous);
    if (canCollaborate) collaborationClient.sendProjectUpdate(previous);
  };

  const startBlankProject = () => {
    if (isViewer) { showToast('Viewers cannot create projects'); return; }
    const hasContents = project.walls.length || project.doors.length || project.windows.length ||
      project.rooms.length || project.furniture.length || (project.parametricObjects?.length ?? 0);
    if (hasContents && !window.confirm('Start a blank CAD project? Save the current project first if you want to keep it.')) return;
    const blank = createEmptyCadProject();
    setProject(blank);
    setSourceStatus('loaded');
    setSourceError('');
    setHistory([]);
    setRedoStack([]);
    setUiSelection(null);
    setCadSelection(null);
    setVerifiedProjectRevision(null);
    setActiveWorkspace('plan');
    setPlanLayout('2d');
    setActiveTool('select');
    if (canCollaborate) collaborationClient.sendProjectUpdate(blank);
  };

  // Hosted mode, nothing registered open: a chosen starter becomes an explicit, unsaved local copy.
  // It never stands in for a registered project; picking one from the Project menu clears it again.
  const startFromTemplate = (copy: ProjectState, name: string) => {
    setTemplateCopyName(name);
    setProject(copy);
    setCurrentUser((prev) => (prev.role === 'Viewer' ? { ...prev, role: 'Editor' } : prev));
    setSourceStatus('loaded');
    setSourceError('');
    setHistory([]);
    setRedoStack([]);
    setUiSelection(null);
    setCadSelection(null);
    setVerifiedProjectRevision(null);
    setActiveWorkspace('plan');
    setPlanLayout('split');
    setActiveTool('select');
    showToast(`Started an unsaved copy of "${name}"`);
  };

  const handleRedo = () => {
    if (isViewer || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, r.length - 1));
    setHistory((h) => [...h, project]);
    setProject(next);
    if (canCollaborate) collaborationClient.sendProjectUpdate(next);
  };

  // Shown in place of a model while hosted mode has no registered project open. With a project id
  // present (loading or failed) the original status text stays: a failed load is never replaced by a starter.
  const hostedEmptyPane = (sourceStatus === 'loading' || hostedProjectId)
    ? <div className="flex size-full items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-400">{sourceStatus === 'loading' ? 'Loading registered BIM revision…' : 'Choose a saved CAD project to inspect its registered model.'}</div>
    : <TemplateStarterGrid onSelect={startFromTemplate} />;

  const currentWorkspaceDescriptor =
    WORKSPACE_REGISTRY.find((w) => w.id === activeWorkspace) || WORKSPACE_REGISTRY[0];

  return (
    <div data-appearance={isDarkMode ? 'dark' : 'light'}
      style={{'--cad-accent': cadAccent} as React.CSSProperties}
      className={`cad-workspace-ui relative flex flex-col h-full w-full min-w-0 min-h-0 font-sans overflow-hidden select-none ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {accessMode === 'hosted-project' && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900/95 px-3 py-1.5 text-xs" aria-label="Registered CAD project and revision">
          <label htmlFor="cad-hosted-project" className="text-slate-400">Project</label>
          <select id="cad-hosted-project" aria-label="Open registered CAD project" value={hostedProjectId}
            onChange={event=>{setTemplateCopyName(null);setCurrentUser(prev=>prev.role==='Editor'?{...prev,role:'Viewer'}:prev);setHostedProjectId(event.target.value);setHostedRevision('');setHostedSelection(null);setProject(createEmptyCadProject());}}
            className="min-w-0 max-w-[260px] rounded-md border border-white/15 bg-slate-800 px-2 py-1.5 text-slate-100">
            <option value="">Select a saved project</option>
            {hostedProjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            {hostedProjectId&&!hostedProjects.some(item=>item.id===hostedProjectId)&&<option value={hostedProjectId}>{hostedProjectId}</option>}
          </select>
          {hostedSelection&&<><label htmlFor="cad-hosted-revision" className="text-slate-400">Revision</label>
          <select id="cad-hosted-revision" aria-label="Select registered BIM revision" value={hostedSelection.revision.revision}
            onChange={event=>setHostedRevision(event.target.value)} className="max-w-[210px] rounded-md border border-white/15 bg-slate-800 px-2 py-1.5 text-slate-100">
            {hostedSelection.registry.revisions.filter(row=>row.models.length&&(row.documents.length||row.revision==='current')).map(row=><option key={row.revision} value={row.revision}>{row.label || row.revision} · {row.status}</option>)}
          </select></>}
          <span className="ml-auto text-xs text-slate-400">{hostedSelection ? (hostedSelection.revision.revision==='current' ? `${hostedSelection.revision.sceneRevision || 'Latest'} scene · ${hostedSelection.revision.bimRevision || 'BIM'} source · 3D visual review` : `${hostedSelection.revision.status} · registered source and geometry · viewing only`) : templateCopyName ? `Unsaved copy of "${templateCopyName}" · not a registered project` : 'Registered projects · no template fallback'}</span>
        </div>
      )}
      {/* The host Nav.Topbar owns application chrome. CAD owns only its contextual tools. */}
      {chromeFolded ? (
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900 px-3 text-[length:var(--text-sm)]">
          <span className="font-medium">{project.name || 'Untitled Project'} · {activeWorkspace}</span>
          <button type="button" onClick={() => setChromeFolded(false)} aria-label="Show workspace controls" className="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700">Show controls</button>
        </div>
      ) : (<>

      {(<CadEngineeringToolbar
          tool={activeTool} onTool={setActiveTool}
          onUndo={handleUndo} onRedo={handleRedo}
          showDiagnostics={showRoboticsDiagnostics} onToggleDiagnostics={() => setShowRoboticsDiagnostics(v => !v)}
          canUndo={history.length > 0 && !isViewer} canRedo={redoStack.length > 0 && !isViewer}
          workspace={activeWorkspace} onWorkspace={handleSelectWorkspace}
          planLayout={planLayout} onPlanLayout={setPlanLayout} readOnly={isViewer}
          onNew={startBlankProject} onTemplates={() => setIsTemplateLibraryOpen(true)}
          onExport={() => setIsExportPublishOpen(true)}
          onToggleExplorer={() => { if ((presentation === 'embedded' || window.matchMedia('(max-width: 920px)').matches) && !explorerOpen) setInspectorOpen(false); setExplorerOpen(v => !v); }}
          onToggleInspector={() => { if ((presentation === 'embedded' || window.matchMedia('(max-width: 920px)').matches) && !inspectorOpen) setExplorerOpen(false); setInspectorOpen(v => !v); }}
          explorerOpen={explorerOpen} inspectorOpen={inspectorOpen}
          onMore={() => setAdvancedToolsOpen(v => !v)} moreOpen={advancedToolsOpen}
          accent={cadAccent} onAccentChange={setCadAccent}
          isDark={isDarkMode} onToggleDark={() => setIsDarkMode(v => !v)}
          studioView={studioView} onStudioView={v=>{setStudioView(v);if(v==='preview'){handleSelectWorkspace('model');setExplorerOpen(false);setInspectorOpen(false)}else if(v==='code'){handleSelectWorkspace('model')}else {handleSelectWorkspace('plan')}}}
          projectSlot={accessMode === 'hosted-project' ? <span className="text-xs text-slate-400">{templateCopyName ? 'Unsaved template copy · use Export to keep it' : 'Registered BIM · Read-only until native revision host is connected'}</span> : <ProjectRuntimePanel project={project} onLoad={setProject} onVerifiedRevision={onVerifiedRevision} readOnly={isViewer}/>}
          runtimeSlot={<CadStatusStrip workspace={currentWorkspaceDescriptor} activeTool={activeTool} unit={unit}
            selectionCount={currentUser.selectedIds.length} jobStatus={cadToolsReport ? `${cadToolsReport.available_tools}/${cadToolsReport.total_tools} Engines Online` : 'Engine Ready'}
            isSynced={isSynced} isDarkMode={isDarkMode} capabilities={liveCapabilities}/>}
        />
      )}
      {/* Advanced contextual operations are preserved and revealed by More tools. */}
      {advancedToolsOpen && (
      <div className={`h-10 px-3.5 border-b flex items-center justify-between text-xs z-20 shrink-0 backdrop-blur-md ${isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-300' : 'bg-slate-100/90 border-slate-200 text-slate-700'}`}>
        <button type="button" onClick={() => setChromeFolded(true)} aria-label="Fold workspace controls" title="Fold controls for more canvas" className="mr-2 rounded bg-slate-800 px-2 py-0.5 text-[length:var(--text-sm)] hover:bg-slate-700">Fold ×</button>
        {/* Workspace Context Controls */}
        {activeWorkspace === 'plan' && (
          <div className="flex items-center gap-3">
            {/* Plan Layout Mode */}
            <div className="flex bg-black/20 p-0.5 rounded-lg border border-inherit">
              <button
                type="button"
                onClick={() => setPlanLayout('2d')}
                className={`px-2 py-0.5 rounded text-[length:var(--text-sm)] font-semibold flex items-center gap-1 ${
                  planLayout === '2d' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="size-3" />
                <span>2D Plan</span>
              </button>
              <button
                type="button"
                onClick={() => setPlanLayout('split')}
                className={`px-2 py-0.5 rounded text-[length:var(--text-sm)] font-semibold flex items-center gap-1 ${
                  planLayout === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Columns className="size-3" />
                <span>Split View</span>
              </button>
              <button
                type="button"
                onClick={() => setPlanLayout('sketch')}
                className={`px-2 py-0.5 rounded text-[length:var(--text-sm)] font-semibold flex items-center gap-1 ${
                  planLayout === 'sketch' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="size-3 text-amber-400" />
                <span>SamSketch</span>
              </button>
            </div>

            {/* Grid Snap & Units */}
            <div className="flex items-center gap-2 pl-2 border-l border-inherit/40 text-[length:var(--text-sm)] font-mono">
              <button
                type="button"
                onClick={() => updateProject((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid }))}
                disabled={isViewer}
                className={`flex items-center gap-1 ${project.snapToGrid ? 'text-indigo-400 font-semibold' : 'text-slate-500'}`}
              >
                <Magnet className="size-3" />
                <span>Snap {project.gridSize || 12}"</span>
              </button>

              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
                className="bg-transparent text-[length:var(--text-sm)] text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="ft" className="bg-slate-900">ft - in</option>
                <option value="in" className="bg-slate-900">inches</option>
                <option value="m" className="bg-slate-900">meters</option>
              </select>
            </div>
          </div>
        )}

        {activeWorkspace === 'model' && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-xs text-indigo-400 flex items-center gap-1.5">
              <Box className="size-3.5" />
              <span>3D Spatial Scene Assembly</span>
            </span>
            <div className="flex items-center gap-1 border-l border-inherit/40 pl-3">
              <button
                type="button"
                onClick={() => setIsFurniturePickerOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[length:var(--text-sm)] flex items-center gap-1"
              >
                <Armchair className="size-3 text-indigo-400" />
                <span>Insert Asset</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBimStarters((previous) => !previous)}
                className="rounded bg-amber-500/15 px-2 py-1 text-[length:var(--text-sm)] text-amber-300 hover:bg-amber-500/25"
              >BIM Starters</button>
              <button
                type="button"
                onClick={() => setIsTemplateLibraryOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[length:var(--text-sm)] flex items-center gap-1"
              >
                <LayoutGrid className="size-3 text-indigo-400" />
                <span>Library</span>
              </button>
            </div>
          </div>
        )}

        {activeWorkspace === 'robotics' && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-xs text-indigo-400 flex items-center gap-1.5">
              <Activity className="size-3.5" />
              <span>Franka Panda 7-DOF · MuJoCo 500Hz Simulation</span>
            </span>
            <span className="text-[length:var(--text-xs)] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Kinematics Online
            </span>
          </div>
        )}

        {/* Right side of contextual toolbar */}
        <div className="flex items-center gap-2">
          {!isViewer && activeWorkspace === 'plan' && (
            <>
              <button
                type="button"
                onClick={() => setIsFurniturePickerOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[length:var(--text-sm)] flex items-center gap-1"
              >
                <Armchair className="size-3 text-indigo-400" />
                <span>Fixtures</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSketchModalOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[length:var(--text-sm)] flex items-center gap-1"
              >
                <FileScan className="size-3 text-indigo-400" />
                <span>Vision Sketch</span>
              </button>
            </>
          )}

          <div className="flex items-center bg-black/20 border border-inherit/40 rounded px-1.5 py-0.5 space-x-1">
            <Shield className="size-3 text-slate-400" />
            <span className="text-[length:var(--text-xs)] font-mono text-slate-300">{currentUser.role}</span>
          </div>
        </div>
      </div>
      )}

      </>)}
      {/* 3. Main Stage (canvas-first, no assistant sidebar) */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        <div className="cad-workspace-body">
          {(activeWorkspace === 'plan' || activeWorkspace === 'model') && explorerOpen && (
            <CadProjectExplorer project={project} selection={uiSelection}
              onSelect={setUiSelection} onClose={() => setExplorerOpen(false)} />
          )}
        {/* PRIMARY VIEWPORT STAGE */}
        <section className="cad-workspace-stage flex-1 flex overflow-hidden relative bg-[#121212]">
          {sourceStatus === 'unavailable' && sourceError && (
            <div role="alert" className="absolute left-3 top-3 z-40 max-w-[min(430px,calc(100%-24px))] rounded-xl border border-amber-400/35 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-xl">
              <strong>{accessMode === 'hosted-project' ? 'Registered CAD project unavailable' : accessMode === 'owner' ? 'Owner project unavailable' : 'Public example unavailable'}</strong>
              <p className="mt-1 text-slate-300">{sourceError}</p>
              <p className="mt-1 text-slate-400">{accessMode === 'hosted-project' ? 'The registered source was not replaced with a template or an older GLB.' : accessMode === 'owner' ? 'No public example was substituted. The local project service must return the saved owner BIM; no source files were modified.' : 'Your current example canvas has not been replaced. You can keep editing it or choose another starter.'}</p>
              {accessMode !== 'hosted-project' && <button type="button" className="mt-2 rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10" onClick={() => void openDreamHouse()}>{accessMode === 'owner' ? 'Retry owner project' : 'Retry public example'}</button>}
              <button type="button" className="ml-2 rounded-lg px-3 py-1.5 text-slate-300 hover:bg-white/10" onClick={() => setSourceError('')}>Dismiss</button>
            </div>
          )}
          {/* A registered project BIM is resolved through its D1/R2 revision records.
              The visual GLB is never the authoritative editable source. */}
          {/* WORKSPACE 1: PLAN */}
          {activeWorkspace === 'plan' && (
            <>
              {(planLayout === '2d' || planLayout === 'split') && (
                <div className={`h-full relative ${planLayout === 'split' ? 'w-1/2 border-r border-white/10' : 'w-full'}`}>
                  <Canvas2D
                    project={project}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onProjectChange={updateProject}
                    showToolToolbar={false}
                    externalSelection={uiSelection && uiSelection.group !== 'parametricObjects' ? {
                      id:uiSelection.id,
                      type: ({walls:'wall',doors:'door',windows:'window',rooms:'room',furniture:'furniture'} as const)[uiSelection.group]
                    } : null}
                    selectedFurnitureType={selectedFurnitureType}
                    remoteUsers={remoteUsers}
                    unit={unit}
                    userRole={currentUser.role}
                    onSelectElement={(type, id) => {
                      const groupMap: Record<string, CadElementGroup> = {
                        wall:'walls', door:'doors', window:'windows',
                        room:'rooms', furniture:'furniture', parametric:'parametricObjects'
                      };
                      const group = groupMap[type];
                      if (group) { setUiSelection({group,id}); setInspectorOpen(true); if (presentation === 'embedded' || window.matchMedia('(max-width: 920px)').matches) setExplorerOpen(false); }
                      try {
                        const revision = verifiedSelectionRevision(project.id, verifiedProjectRevision);
                        if (revision === null) {
                          setCadSelection(null);
                          return; // Unsaved drafts never impersonate revision 1.
                        }
                        const sel = buildSelectionContext({ workspace: activeWorkspace, projectId: project.id, revision, objectId: id, objectType: type, label: `${type} ${id}` });
                        setCadSelection(sel);
                        bridgeRef.current?.post({ type: 'cad.selection', selection: sel } as never);
                      } catch { /* selection without real id supplies no context */ }
                    }}
                  />
                </div>
              )}

              {(planLayout === 'split') && (
                <div className="h-full relative w-1/2">
                  {hostedSelection && sourceStatus==='loaded'
                    ? <CadWorldViewport modelUrl={hostedSelection.modelUrl} sceneLabel={hostedSelection.registry.project.name} revision={hostedSelection.revision.revision} readOnly onSelect={({designId})=>{
                        const groups=([['walls',project.walls],['doors',project.doors],['windows',project.windows],['rooms',project.rooms]] as const);
                        for(const [group,records] of groups){if(records.some(item=>item.id===designId)){
                          setUiSelection({group,id:designId});setInspectorOpen(true);break;
                        }}
                      }}/>
                    : accessMode === 'hosted-project' && !templateCopyName
                      ? hostedEmptyPane
                    : <Viewport3D project={project} onLightingChange={isViewer?undefined:updates=>updateProject(p=>({...p,lighting:{...p.lighting,...updates}}))}/>}
                </div>
              )}

              {planLayout === 'sketch' && (
                <div className="w-full h-full relative">
                  <NativeSketchCanvas
                    project={project}
                    onUpdateProject={(newProj) => updateProject(() => newProj)}
                    canEdit={!isViewer}
                  />
                </div>
              )}
            </>
          )}

          {/* WORKSPACE 2: MODEL */}
          {activeWorkspace === 'model' && (
            <div className="w-full h-full relative">
              {showBimStarters ? <BimStartersWorkspace onReturn={() => setShowBimStarters(false)} />
              : hostedSelection && sourceStatus==='loaded'
                ? <CadWorldViewport modelUrl={hostedSelection.modelUrl} sceneLabel={hostedSelection.registry.project.name} revision={hostedSelection.revision.revision} readOnly onSelect={({designId})=>{
                    const groups=([['walls',project.walls],['doors',project.doors],['windows',project.windows],['rooms',project.rooms]] as const);
                    for(const [group,records] of groups){if(records.some(item=>item.id===designId)){
                      setUiSelection({group,id:designId});setInspectorOpen(true);break;
                    }}
                  }}/>
                : accessMode === 'hosted-project' && !templateCopyName
                  ? hostedEmptyPane
                : <Viewport3D project={project} onLightingChange={isViewer?undefined:updates=>updateProject(p=>({...p,lighting:{...p.lighting,...updates}}))}/>}
            </div>
          )}

          {/* Legacy panel routes remain registered for existing links; primary navigation has three destinations. */}
          {/* WORKSPACE 4: ROBOTICS */}
          {activeWorkspace === 'robotics' && (
            <div className="w-full h-full relative">
              <div ref={roboticsContainerRef} className="absolute inset-0" />
              <div className="absolute inset-0 z-10 pointer-events-none">
                <div className="w-full h-full pointer-events-none">
                  <React.Suspense
                    fallback={(
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-300">
                        <div className="flex items-center gap-3 text-xs font-mono">
                          <div className="h-4 w-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
                          Loading robotics runtime…
                        </div>
                      </div>
                    )}
                  >
                    <LazyRoboticsWorkspace
                      containerRef={roboticsContainerRef}
                      isDarkMode={roboticsDarkMode}
                      toggleDarkMode={() => setRoboticsDarkMode((value) => !value)}
                      showDiagnostics={showRoboticsDiagnostics}
                      setShowDiagnostics={setShowRoboticsDiagnostics}
                      onOpenToolIntegration={(toolId) => {
                        if (toolId === 'openscad') handleSelectWorkspace('model');
                        else if (toolId === 'blender' || toolId === 'meshy') handleSelectWorkspace('render');
                        else handleSelectWorkspace('model');
                      }}
                      toolCapabilities={liveCapabilities.map((c) => ({
                        id: c.id,
                        name: c.name,
                        status: c.status,
                        version: c.version,
                        lane: c.lane,
                        description: c.description || '',
                        supportedFormats:
                          c.id === 'openscad'
                            ? ['SCAD', 'STL', 'DXF', '3MF']
                            : c.id === 'blender'
                              ? ['BLEND', 'GLB', 'OBJ', 'PNG']
                              : c.id === 'freecad'
                                ? ['STEP', 'IGES', 'BREP', 'FCStd']
                                : c.id === 'meshy'
                                  ? ['GLB', 'USDZ', 'FBX']
                                  : ['XML', 'MJCF', 'URDF'],
                      }))}
                    />
                  </React.Suspense>
                </div>
              </div>
            </div>
          )}

          {/* Rendering now shows the current project instead of opening disconnected prototype dialogs. */}
          {activeWorkspace === 'render' && (
            <div className="w-full h-full">
              <Viewport3D project={project} onLightingChange={isViewer?undefined:updates=>updateProject(p=>({...p,lighting:{...p.lighting,...updates}}))}/>
            </div>
          )}
        </section>
          {(activeWorkspace === 'plan' || activeWorkspace === 'model' || activeWorkspace === 'render') && inspectorOpen && (
            <CadPropertyInspector project={project} selection={uiSelection}
              onSelect={setUiSelection} onChange={updateProject}
              onClose={() => setInspectorOpen(false)} readOnly={isViewer} />
          )}
        </div>
      </main>

      {/* Reuse the SDK's real miniAgentSam selection/composer. The CAD host
          owns conversation transport and every geometry-changing operation. */}
      <MiniAgentSam selecting={annotating} onSelectingChange={setAnnotating}
        onSubmit={async (prompt, selection) => {
          const context = {
            workspace: activeWorkspace, project_id: project.id,
            project_name: project.name, revision: verifiedProjectRevision?.revision ?? null,
            interface_selection: selection,
          };
          const message = prompt.trim() + '\n\nCAD workspace context (descriptive only; not edit authority): ' + JSON.stringify(context);
          if (presentation !== 'embedded' || !bridgeRef.current) {
            setCopilotDraft(message);
            setAssistantReply('Open this CAD project in Local Studio to submit the draft through the authorized AgentSam conversation.');
            return;
          }
          setCopilotDraft('');
          setAssistantReply('Request sent to the AgentSam host.');
          bridgeRef.current.post({type:'assistant.request',
            request_id:crypto.randomUUID(),prompt:message,
            selection:cadSelection && verifiedProjectRevision?.projectId===project.id ? cadSelection : null});
        }}
      />
      {(copilotDraft || assistantReply) && <aside data-annotation-control="" aria-label="CAD copilot status" className="fixed bottom-14 right-4 z-[100] w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-white/20 bg-slate-950 px-3 py-2 text-xs text-white shadow-2xl">
        <div className="flex items-center justify-between gap-2"><strong>AgentSam CAD copilot</strong><button type="button" aria-label="Dismiss copilot status" onClick={() => {setCopilotDraft('');setAssistantReply('');}}>Close</button></div>
        {assistantReply && <p role="status" className="mt-2 whitespace-pre-wrap">{assistantReply}</p>}
        {copilotDraft && <><textarea readOnly value={copilotDraft} aria-label="CAD request draft" rows={4} className="mt-2 w-full rounded bg-slate-800 p-2 text-white"/><button type="button" onClick={() => void navigator.clipboard.writeText(copilotDraft)}>Copy request</button></>}
      </aside>}
      <TemplateLibraryModal
        isOpen={isTemplateLibraryOpen}
        onClose={() => setIsTemplateLibraryOpen(false)}
        onSelectTemplate={(tmpl) => {
          if (accessMode === 'hosted-project' && !hostedSelection) { startFromTemplate(tmpl, tmpl.name); return; }
          if (isViewer) return;
          updateProject(() => ({
            ...tmpl,
            id: `proj_${Date.now()}`,
            updatedAt: Date.now(),
            version: 1
          }));
          showToast(`Loaded "${tmpl.name}" template`);
        }}
        userRole={accessMode === 'hosted-project' && !hostedSelection ? 'Editor' : currentUser.role}
      />

      <FurniturePicker
        isOpen={isFurniturePickerOpen}
        onClose={() => setIsFurniturePickerOpen(false)}
        onSelectFurniture={(type, name, category, w, d, h, color) => {
          if (isViewer) return;
          setSelectedFurnitureType(type);
          setActiveTool('furniture');
          const newFurn = {
            id: `furn_${Date.now()}`,
            type,
            category,
            name,
            x: 150,
            y: 150,
            w,
            d,
            h,
            rotation: 0,
            color
          };
          updateProject((prev) => ({
            ...prev,
            furniture: [...prev.furniture, newFurn],
            updatedAt: Date.now()
          }));
        }}
      />

      <ExportPublishModal
        isOpen={isExportPublishOpen}
        onClose={() => setIsExportPublishOpen(false)}
        project={project}
        canExport={permissions.canExport}
      />

      <SketchUploadModal
        isOpen={isSketchModalOpen}
        onClose={() => setIsSketchModalOpen(false)}
        onApplyParsedPlan={(plan) => {
          if (isViewer) return;
          updateProject((prev) => ({
            ...prev,
            walls: plan.walls && plan.walls.length > 0 ? plan.walls : prev.walls,
            doors: plan.doors ? plan.doors : prev.doors,
            windows: plan.windows ? plan.windows : prev.windows,
            furniture: plan.furniture && plan.furniture.length > 0 ? plan.furniture : prev.furniture,
            rooms: plan.rooms && plan.rooms.length > 0 ? plan.rooms : prev.rooms,
            updatedAt: Date.now()
          }));
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
