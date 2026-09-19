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
import { SketchCanvasTLDraw } from '../components/SketchCanvasTLDraw';
import { ParametricEditor } from '../components/ParametricEditor';
import { LazyRoboticsWorkspace, preloadRoboticsWorkspace } from '../workspaces/robotics/lazy';
import { ExportPublishModal } from '../components/ExportPublishModal';
import { AgentSidebar } from '../components/AgentSidebar';
import { FurniturePicker } from '../components/FurniturePicker';
import { VeoStudioModal } from '../components/VeoStudioModal';
import { ImageGenModal } from '../components/ImageGenModal';
import { SketchUploadModal } from '../components/SketchUploadModal';
import { CloudProjectsModal } from '../components/CloudProjectsModal';
import { TemplateLibraryModal } from '../components/TemplateLibraryModal';
import { CadCreatorShell } from './CadCreatorShell';
import { CadStatusStrip } from './CadStatusStrip';
import { installCadPreviewGuestBridge } from '../lib/agentsam-preview-bridge';
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
  const [project, setProject] = useState<ProjectState>(() => {
    return TEMPLATES.modern_villa;
  });

  // Undo / Redo history stacks
  const [history, setHistory] = useState<ProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectState[]>([]);

  // 2. Workspace & Layout State
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(initialWorkspace);
  const [planLayout, setPlanLayout] = useState<'2d' | 'split' | 'sketch'>('split');
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<string | null>(null);
  const [unit, setUnit] = useState<MeasurementUnit>('ft');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
    const cleanup = installCadPreviewGuestBridge({
      activeWorkspace,
      onSelectWorkspace: (wsId) => handleSelectWorkspace(wsId),
      onSetTheme: (dark) => setIsDarkMode(dark)
    });
    return cleanup;
  }, [presentation, activeWorkspace]);

  // Preload robotics when user hovers or selects robotics
  const handleSelectWorkspace = (wsId: WorkspaceId) => {
    if (wsId === 'robotics') {
      preloadRoboticsWorkspace();
    }
    setActiveWorkspace(wsId);
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
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onExport={() => setIsExportPublishOpen(true)}
        presentation={presentation}
        showDiagnostics={showRoboticsDiagnostics}
        onToggleDiagnostics={() => setShowRoboticsDiagnostics(!showRoboticsDiagnostics)}
      />

      {/* 2. Contextual Secondary Toolbar (Changes per workspace) */}
      <div className={`h-10 px-3.5 border-b flex items-center justify-between text-xs z-20 shrink-0 backdrop-blur-md ${isDarkMode ? 'bg-slate-900/80 border-white/10 text-slate-300' : 'bg-slate-100/90 border-slate-200 text-slate-700'}`}>
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

      {/* 3. Main Stage + Persistent Agent Sidebar */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* AgentSam Sidebar (Toggleable) */}
        {isSidebarOpen && activeWorkspace !== 'robotics' && (
          <AgentSidebar
            project={project}
            onApplyPlan={(plan) => {
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
            onOpenVeoModal={() => setIsVeoModalOpen(true)}
            onOpenImageGenModal={() => setIsImageGenModalOpen(true)}
            onOpenSketchModal={() => setIsSketchModalOpen(true)}
            userRole={currentUser.role}
          />
        )}

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
              <Viewport3D
                project={project}
                onTakeSnapshot={(dataUrl) => {
                  setActiveSnapshotUrl(dataUrl);
                  setIsImageGenModalOpen(true);
                }}
              />
            </div>
          )}

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
                <div className="w-full h-full pointer-events-auto">
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
                        if (toolId === 'openscad') setActiveWorkspace('parametric');
                        else if (toolId === 'blender' || toolId === 'meshy') setActiveWorkspace('render');
                        else setActiveWorkspace('model');
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
