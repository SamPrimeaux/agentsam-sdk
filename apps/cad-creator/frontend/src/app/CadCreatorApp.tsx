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
import { getPermissions } from '../lib/permissions';
import { collaborationClient } from '../lib/socket';
import { Canvas2D } from '../components/Canvas2D';
import { Viewport3D } from '../components/Viewport3D';
import { BimStartersWorkspace } from '../components/BimStartersWorkspace';
import { SketchCanvasTLDraw } from '../components/SketchCanvasTLDraw';
import { ParametricEditor } from '../components/ParametricEditor';
import { LazyRoboticsWorkspace, preloadRoboticsWorkspace } from '../workspaces/robotics/lazy';
import { ExportPublishModal } from '../components/ExportPublishModal';
import { FurniturePicker } from '../components/FurniturePicker';
import { VeoStudioModal } from '../components/VeoStudioModal';
import { ImageGenModal } from '../components/ImageGenModal';
import { SketchUploadModal } from '../components/SketchUploadModal';
import { CloudProjectsModal } from '../components/CloudProjectsModal';
import { TemplateLibraryModal } from '../components/TemplateLibraryModal';
import { CadCreatorShell } from './CadCreatorShell';
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
  Video,
  Image as ImageIcon,
  FileScan,
  Armchair,
  Magnet,
  Shield,
  LayoutGrid,
  Sun,
  Camera,
  Play,
  RotateCcw,
  Activity,
  Code2
} from 'lucide-react';

export interface CadCreatorAppProps {
  presentation?: 'standalone' | 'embedded';
  initialWorkspace?: WorkspaceId;
  onNavigateHost?: (path: string) => void;
}

export function CadCreatorApp({
  presentation = 'standalone',
  initialWorkspace = 'plan',
  onNavigateHost
}: CadCreatorAppProps) {
  // 1. Core Project State
  const [showBimStarters, setShowBimStarters] = useState(false);
  const [project, setProject] = useState<ProjectState>(() => {
    return TEMPLATES.modern_villa;
  });

  // Undo / Redo history stacks
  const [history, setHistory] = useState<ProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectState[]>([]);

  // 2. Workspace & Layout State
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(initialWorkspace === 'parametric' || initialWorkspace === 'render' ? 'model' : initialWorkspace);
  const [planLayout, setPlanLayout] = useState<'2d' | 'split' | 'sketch'>('split');
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<string | null>(null);
  const [unit, setUnit] = useState<MeasurementUnit>('ft');
  const [cadSelection, setCadSelection] = useState<CadSelectionContext | null>(null);
  const [verifiedProjectRevision, setVerifiedProjectRevision] = useState<{projectId:string;revision:number}|null>(null);
  const [modelModule, setModelModule] = useState<'parametric'|null>(initialWorkspace === 'parametric' ? 'parametric' : null);
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
  const [isVeoModalOpen, setIsVeoModalOpen] = useState(false);
  const [isImageGenModalOpen, setIsImageGenModalOpen] = useState(false);
  const [isSketchModalOpen, setIsSketchModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [isExportPublishOpen, setIsExportPublishOpen] = useState(false);
  const [activeSnapshotUrl, setActiveSnapshotUrl] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 4. Real-time Multiplayer Collaboration & Roles
  const [roomId, setRoomId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'studio-main';
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'studio-main';
  });

  const [currentUser, setCurrentUser] = useState<MultiplayerUser>(() => {
    const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];
    const names = ['Architect Alex', 'Designer Sam', 'Taylor Arch', 'Jordan BIM', 'Morgan Lead', 'Casey Eng'];
    const idx = Math.floor(Math.random() * names.length);
    return {
      id: `user_${Math.random().toString(36).substring(2, 7)}`,
      name: names[idx],
      color: colors[idx % colors.length],
      role: 'Owner',
      selectedIds: [],
      activeTool: 'select',
      lastActive: Date.now()
    };
  });

  const [remoteUsers, setRemoteUsers] = useState<MultiplayerUser[]>([]);
  const [isSynced, setIsSynced] = useState(true);

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
    if (wsId === 'parametric') {
      setModelModule('parametric');
      setActiveWorkspace('model');
    } else if (wsId === 'render') {
      setActiveWorkspace('model');
      setIsImageGenModalOpen(true);
    } else {
      setModelModule(null);
      setActiveWorkspace(wsId);
    }
  };

  // Initialize WebSocket Collaboration
  useEffect(() => {
    collaborationClient.connect(roomId, currentUser);

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
      unsubJoined();
      unsubLeft();
      unsubRoomUsers();
      unsubRoleUpdated();
      unsubDenied();
      unsubProjectUpdate();
      unsubCursor();
      collaborationClient.disconnect();
    };
  }, [roomId, currentUser.id]);

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
      collaborationClient.sendProjectUpdate(next);
      return next;
    });
  }, [isViewer]);

  // Undo / Redo
  const handleUndo = () => {
    if (isViewer || history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((r) => [...r, project]);
    setHistory((h) => h.slice(0, h.length - 1));
    setProject(previous);
    collaborationClient.sendProjectUpdate(previous);
  };

  const handleRedo = () => {
    if (isViewer || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, r.length - 1));
    setHistory((h) => [...h, project]);
    setProject(next);
    collaborationClient.sendProjectUpdate(next);
  };

  const currentWorkspaceDescriptor =
    WORKSPACE_REGISTRY.find((w) => w.id === activeWorkspace) || WORKSPACE_REGISTRY[0];

  return (
    <div className={`flex flex-col h-screen w-screen font-sans overflow-hidden select-none ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* 1. Global Shell Header (5 Workspaces, Project, Sync, Undo/Redo, AgentSam, Export) */}
      {chromeFolded ? (
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900 px-3 text-[11px]">
          <span className="font-medium">{project.name || 'Untitled Project'} · {activeWorkspace}</span>
          <button type="button" onClick={() => setChromeFolded(false)} aria-label="Show workspace controls" className="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700">Show controls</button>
        </div>
      ) : (<>
      <ProjectRuntimePanel project={project} onLoad={setProject} onVerifiedRevision={onVerifiedRevision} readOnly={isViewer} />
      <CadCreatorShell
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        projectName={project.name || 'Untitled Project'}
        isSynced={isSynced}
        canUndo={history.length > 0 && !isViewer}
        canRedo={redoStack.length > 0 && !isViewer}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        isSidebarOpen={annotating}
        onToggleSidebar={() => setAnnotating((v) => !v)}
        onExport={() => setIsExportPublishOpen(true)}
        presentation={presentation}
        showDiagnostics={showRoboticsDiagnostics}
        onToggleDiagnostics={() => setShowRoboticsDiagnostics(!showRoboticsDiagnostics)}
      />

      {/* 2. Contextual Secondary Toolbar (Changes per workspace) */}
      <div className={`h-10 px-3.5 border-b flex items-center justify-between text-xs z-20 shrink-0 backdrop-blur-md ${isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-300' : 'bg-slate-100/90 border-slate-200 text-slate-700'}`}>
        <button type="button" onClick={() => setChromeFolded(true)} aria-label="Fold workspace controls" title="Fold controls for more canvas" className="mr-2 rounded bg-slate-800 px-2 py-0.5 text-[11px] hover:bg-slate-700">Fold ×</button>
        {/* Workspace Context Controls */}
        {activeWorkspace === 'plan' && (
          <div className="flex items-center gap-3">
            {/* Plan Layout Mode */}
            <div className="flex bg-black/20 p-0.5 rounded-lg border border-inherit">
              <button
                type="button"
                onClick={() => setPlanLayout('2d')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                  planLayout === '2d' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="size-3" />
                <span>2D Plan</span>
              </button>
              <button
                type="button"
                onClick={() => setPlanLayout('split')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                  planLayout === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Columns className="size-3" />
                <span>Split View</span>
              </button>
              <button
                type="button"
                onClick={() => setPlanLayout('sketch')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                  planLayout === 'sketch' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="size-3 text-amber-400" />
                <span>Sketch-to-CAD</span>
              </button>
            </div>

            {/* Grid Snap & Units */}
            <div className="flex items-center gap-2 pl-2 border-l border-inherit/40 text-[11px] font-mono">
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
                className="bg-transparent text-[11px] text-slate-300 focus:outline-none cursor-pointer"
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
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] flex items-center gap-1"
              >
                <Armchair className="size-3 text-indigo-400" />
                <span>Insert Asset</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBimStarters((previous) => !previous)}
                className="rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-500/25"
              >BIM Starters</button>
              <button
                type="button"
                onClick={() => setModelModule((m) => m === 'parametric' ? null : 'parametric')}
                aria-expanded={modelModule === 'parametric'}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px]"
              >Parametric tools</button>
              <button type="button" onClick={() => setIsImageGenModalOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px]">Render</button>
              <button
                type="button"
                onClick={() => setIsTemplateLibraryOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] flex items-center gap-1"
              >
                <LayoutGrid className="size-3 text-indigo-400" />
                <span>Library</span>
              </button>
            </div>
          </div>
        )}

        {activeWorkspace === 'parametric' && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-xs text-indigo-400 flex items-center gap-1.5">
              <Code2 className="size-3.5" />
              <span>OpenSCAD CSG / FreeCAD Solid Kernel</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Deterministic Compile
            </span>
          </div>
        )}

        {activeWorkspace === 'robotics' && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-xs text-indigo-400 flex items-center gap-1.5">
              <Activity className="size-3.5" />
              <span>Franka Panda 7-DOF · MuJoCo 500Hz Simulation</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Kinematics Online
            </span>
          </div>
        )}

        {activeWorkspace === 'render' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImageGenModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm"
            >
              <ImageIcon className="size-3" />
              <span>Render PBR Studio</span>
            </button>
            <button
              type="button"
              onClick={() => setIsVeoModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm"
            >
              <Video className="size-3" />
              <span>Veo Video Studio</span>
            </button>
          </div>
        )}

        {/* Right side of contextual toolbar */}
        <div className="flex items-center gap-2">
          {!isViewer && activeWorkspace === 'plan' && (
            <>
              <button
                type="button"
                onClick={() => setIsFurniturePickerOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] flex items-center gap-1"
              >
                <Armchair className="size-3 text-indigo-400" />
                <span>Fixtures</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSketchModalOpen(true)}
                className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] flex items-center gap-1"
              >
                <FileScan className="size-3 text-indigo-400" />
                <span>Vision Sketch</span>
              </button>
            </>
          )}

          <div className="flex items-center bg-black/20 border border-inherit/40 rounded px-1.5 py-0.5 space-x-1">
            <Shield className="size-3 text-slate-400" />
            <span className="text-[10px] font-mono text-slate-300">{currentUser.role}</span>
          </div>
        </div>
      </div>

      </>)}
      {/* 3. Main Stage (canvas-first, no assistant sidebar) */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* AgentSam Sidebar (Toggleable) */}

        {/* PRIMARY VIEWPORT STAGE */}
        <section className="flex-1 flex overflow-hidden relative bg-[#121212]">
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
                    selectedFurnitureType={selectedFurnitureType}
                    remoteUsers={remoteUsers}
                    unit={unit}
                    userRole={currentUser.role}
                    onSelectElement={(type, id) => {
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
                  <Viewport3D
                    project={project}
                    onTakeSnapshot={(dataUrl) => {
                      setActiveSnapshotUrl(dataUrl);
                      setIsImageGenModalOpen(true);
                    }}
                  />
                </div>
              )}

              {planLayout === 'sketch' && (
                <div className="w-full h-full relative">
                  <SketchCanvasTLDraw
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
              {showBimStarters ? <BimStartersWorkspace onReturn={() => setShowBimStarters(false)} /> : <Viewport3D
                project={project}
                onTakeSnapshot={(dataUrl) => {
                  setActiveSnapshotUrl(dataUrl);
                  setIsImageGenModalOpen(true);
                }}
              />}
              {modelModule === 'parametric' && (
                <aside className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-[440px] border-l border-white/10 bg-slate-950/95 shadow-2xl" aria-label="Parametric tools">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs">
                    <span className="font-semibold">Parametric tools · current model</span>
                    <button type="button" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => setModelModule(null)} aria-label="Close parametric tools">Close</button>
                  </div>
                  <div className="h-[calc(100%-38px)] overflow-auto">
                    <ParametricEditor project={project} onUpdateProject={(next) => updateProject(() => next)} canEdit={!isViewer} />
                  </div>
                </aside>
              )}
            </div>
          )}

          {/* Legacy panel routes remain registered for existing links; primary navigation has three destinations. */}
          {/* WORKSPACE 3: PARAMETRIC */}
          {activeWorkspace === 'parametric' && (
            <div className="w-full h-full relative">
              <ParametricEditor
                project={project}
                onUpdateProject={(newProj) => updateProject(() => newProj)}
                canEdit={!isViewer}
              />
            </div>
          )}

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
                        if (toolId === 'openscad') handleSelectWorkspace('parametric');
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

          {/* WORKSPACE 5: RENDER */}
          {activeWorkspace === 'render' && (
            <div className="w-full h-full relative flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
              <div className="text-center p-8 max-w-lg space-y-4">
                <Sun className="size-12 mx-auto text-indigo-400 animate-pulse" />
                <h2 className="text-lg font-bold tracking-tight text-white">Blender PBR & Generative Studio</h2>
                <p className="text-xs text-slate-400 leading-relaxed font-mono">
                  Photorealistic raytracing, Meshy AI 3D asset synthesis, and Veo cinematic walkthrough video generation.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsImageGenModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
                  >
                    <ImageIcon className="size-4" />
                    <span>Generate PBR Render</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsVeoModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
                  >
                    <Video className="size-4" />
                    <span>Create Veo Walkthrough</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
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
      {/* 4. Unified CAD Bottom Status Contract */}
      <CadStatusStrip
        workspace={currentWorkspaceDescriptor}
        activeTool={activeTool}
        unit={unit}
        selectionCount={currentUser.selectedIds.length}
        jobStatus={cadToolsReport ? `${cadToolsReport.available_tools}/${cadToolsReport.total_tools} Engines Online` : 'Engine Ready'}
        isSynced={isSynced}
        isDarkMode={isDarkMode}
        capabilities={liveCapabilities}
      />

      {/* 5. Modals */}
      <TemplateLibraryModal
        isOpen={isTemplateLibraryOpen}
        onClose={() => setIsTemplateLibraryOpen(false)}
        onSelectTemplate={(tmpl) => {
          if (isViewer) return;
          updateProject(() => ({
            ...tmpl,
            id: `proj_${Date.now()}`,
            updatedAt: Date.now(),
            version: 1
          }));
          showToast(`Loaded "${tmpl.name}" template`);
        }}
        userRole={currentUser.role}
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

      <VeoStudioModal
        isOpen={isVeoModalOpen}
        onClose={() => setIsVeoModalOpen(false)}
        initialImageUrl={activeSnapshotUrl}
      />

      <ImageGenModal
        isOpen={isImageGenModalOpen}
        onClose={() => setIsImageGenModalOpen(false)}
        initialImageUrl={activeSnapshotUrl}
        onSendToVeo={(imageUrl) => {
          setActiveSnapshotUrl(imageUrl);
          setIsImageGenModalOpen(false);
          setIsVeoModalOpen(true);
        }}
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
