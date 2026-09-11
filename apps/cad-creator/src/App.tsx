import React, { useState, useEffect, useCallback } from 'react';
import { 
  ProjectState, 
  ActiveTool, 
  ViewMode, 
  MultiplayerUser, 
  MeasurementUnit, 
  FurnitureCategory,
  UserRole
} from './types';
import { TEMPLATES, TemplateMetadata } from './lib/templates';
import { getPermissions, ROLE_DESCRIPTIONS } from './lib/permissions';
import { collaborationClient } from './lib/socket';
import { Canvas2D } from './components/Canvas2D';
import { Viewport3D } from './components/Viewport3D';
import { SketchCanvasTLDraw } from './components/SketchCanvasTLDraw';
import { ParametricEditor } from './components/ParametricEditor';
import { ExportPublishModal } from './components/ExportPublishModal';
import { AgentSidebar } from './components/AgentSidebar';
import { FurniturePicker } from './components/FurniturePicker';
import { VeoStudioModal } from './components/VeoStudioModal';
import { ImageGenModal } from './components/ImageGenModal';
import { SketchUploadModal } from './components/SketchUploadModal';
import { CloudProjectsModal } from './components/CloudProjectsModal';
import { TemplateLibraryModal } from './components/TemplateLibraryModal';
import { 
  Box, 
  Layers, 
  Columns, 
  Undo2, 
  Redo2, 
  Cloud, 
  Users, 
  Sparkles, 
  Video, 
  Image as ImageIcon, 
  FileScan, 
  Armchair, 
  Download, 
  Magnet, 
  SlidersHorizontal,
  Share2,
  Check,
  Camera,
  Sun,
  Eye,
  Crown,
  Edit3,
  Shield,
  LayoutGrid,
  AlertCircle,
  X,
  Code,
  Pencil
} from 'lucide-react';

export function App() {
  // 1. Core Project State
  const [project, setProject] = useState<ProjectState>(() => {
    return TEMPLATES.modern_villa;
  });

  // Undo / Redo history stacks
  const [history, setHistory] = useState<ProjectState[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectState[]>([]);

  // 2. View & Tool States
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<string | null>(null);
  const [unit, setUnit] = useState<MeasurementUnit>('ft');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
      role: 'Owner', // Initial role, updated dynamically by server
      selectedIds: [],
      activeTool: 'select',
      lastActive: Date.now(),
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

  // Initialize WebSocket Collaboration & Roles synchronization
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

  // Switch collaboration room
  const handleJoinRoom = (newRoomId: string) => {
    if (!newRoomId.trim()) return;
    setRoomId(newRoomId);
    const newUrl = `${window.location.pathname}?room=${encodeURIComponent(newRoomId)}`;
    window.history.pushState({}, '', newUrl);
    collaborationClient.connect(newRoomId, currentUser);
  };

  // Change user role (Owner action)
  const handleChangeUserRole = (targetUserId: string, newRole: UserRole) => {
    collaborationClient.changeUserRole(targetUserId, newRole);
    setRemoteUsers((prev) =>
      prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u))
    );
  };

  // Test / switch own role
  const handleChangeSelfRole = (newRole: UserRole) => {
    setCurrentUser((prev) => ({ ...prev, role: newRole }));
    collaborationClient.setUserRole(newRole);
    showToast(`Switched active local role to: ${newRole}`);
  };

  // Handle Select Furniture from picker
  const handleSelectFurniture = (
    type: string,
    name: string,
    category: FurnitureCategory,
    w: number,
    d: number,
    h: number,
    color: string
  ) => {
    if (isViewer) {
      showToast('Viewers cannot insert fixtures into the design');
      return;
    }

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
      color,
    };
    updateProject((prev) => ({
      ...prev,
      furniture: [...prev.furniture, newFurn],
      updatedAt: Date.now(),
    }));
  };

  // Handle Apply plan from AI agent or Vision sketch
  const handleApplyAIPlan = (plan: Partial<ProjectState>) => {
    if (!permissions.canUseAIAssistant && isViewer) {
      showToast('Viewers cannot apply generated floor plans');
      return;
    }

    updateProject((prev) => ({
      ...prev,
      walls: plan.walls && plan.walls.length > 0 ? plan.walls : prev.walls,
      doors: plan.doors ? plan.doors : prev.doors,
      windows: plan.windows ? plan.windows : prev.windows,
      furniture: plan.furniture && plan.furniture.length > 0 ? plan.furniture : prev.furniture,
      rooms: plan.rooms && plan.rooms.length > 0 ? plan.rooms : prev.rooms,
      updatedAt: Date.now(),
    }));
  };

  // Handle loading a template from TemplateLibraryModal
  const handleSelectTemplate = (templateProject: ProjectState) => {
    if (!permissions.canLoadTemplates) {
      showToast('Viewers cannot load new templates over existing plans');
      return;
    }

    const newPlan: ProjectState = {
      ...templateProject,
      id: `proj_${Date.now()}`,
      updatedAt: Date.now(),
      version: 1,
    };
    updateProject(() => newPlan);
    showToast(`Loaded "${templateProject.name}" template`);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#1E1E1E] text-[#E0E0E0] font-sans overflow-hidden select-none">
      {/* High Density Header */}
      <header className="h-12 border-b border-[#333] flex items-center justify-between px-3.5 bg-[#252525] shrink-0 z-20">
        {/* Left: Brand, Project Title & Sync Status */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-xs shadow-sm">
              S
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-xs text-white">
                AgentSam <span className="text-blue-400">Studio</span>
              </span>
              <span className="text-[10px] font-mono px-1 py-0.2 bg-[#1E1E1E] text-blue-400 border border-[#333] rounded">
                BIM v1.0
              </span>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-[#444] hidden sm:block"></div>

          {/* Sync indicator */}
          <div className="hidden md:flex items-center space-x-1.5 text-[11px] text-gray-400">
            <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
            <span>{isSynced ? 'Cloud Synced' : 'Syncing...'}</span>
          </div>

          <div className="h-4 w-[1px] bg-[#444] hidden sm:block"></div>

          {/* Editable Project Name */}
          <input
            type="text"
            value={project.name || 'Untitled Design'}
            disabled={isViewer}
            onChange={(e) => updateProject((prev) => ({ ...prev, name: e.target.value }))}
            className={`bg-[#1E1E1E] border border-[#333] focus:border-blue-500 rounded px-2 py-0.5 text-xs text-[#E0E0E0] focus:outline-none transition w-32 sm:w-44 ${
              isViewer ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#2a2a2a]'
            }`}
          />
        </div>

        {/* Center: View Mode Switcher (2D / 3D / Split / Sketch / Parametric) & Undo/Redo */}
        <div className="flex items-center space-x-2">
          {/* View Mode Tabs */}
          <div className="flex bg-[#1E1E1E] p-0.5 rounded border border-[#333]">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition ${
                viewMode === '2d' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden md:inline">2D Plan</span>
            </button>

            <button
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition ${
                viewMode === 'split' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Split</span>
            </button>

            <button
              onClick={() => setViewMode('3d')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition ${
                viewMode === '3d' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden md:inline">3D BIM</span>
            </button>

            <button
              onClick={() => setViewMode('sketch')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition ${
                viewMode === 'sketch' ? 'bg-pink-600 text-white shadow-sm' : 'text-pink-400 hover:text-white hover:bg-pink-950/40'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden md:inline">tldraw Sketch</span>
            </button>

            <button
              onClick={() => setViewMode('parametric')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 transition ${
                viewMode === 'parametric' ? 'bg-purple-600 text-white shadow-sm' : 'text-purple-400 hover:text-white hover:bg-purple-950/40'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span className="hidden md:inline">OpenSCAD</span>
            </button>
          </div>

          {/* Undo / Redo */}
          {!isViewer && (
            <div className="hidden lg:flex items-center space-x-0.5 bg-[#1E1E1E] p-0.5 rounded border border-[#333]">
              <button
                onClick={handleUndo}
                disabled={history.length === 0}
                title="Undo (Ctrl+Z)"
                className="p-1 text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-[#333] transition"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                title="Redo (Ctrl+Y)"
                className="p-1 text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-[#333] transition"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Snap Grid & Units */}
          <div className="hidden xl:flex items-center space-x-2 bg-[#1E1E1E] px-2 py-1 rounded border border-[#333] text-[11px] text-gray-400">
            <button
              onClick={() => updateProject((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid }))}
              disabled={isViewer}
              className={`flex items-center space-x-1 transition ${
                project.snapToGrid ? 'text-blue-400 font-medium' : 'text-gray-500'
              }`}
            >
              <Magnet className="w-3 h-3" />
              <span>Snap {project.gridSize || 12}"</span>
            </button>
            <div className="w-[1px] h-3 bg-[#444]"></div>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
              className="bg-transparent text-[11px] text-gray-300 focus:outline-none cursor-pointer"
            >
              <option value="ft" className="bg-[#252525]">ft - in</option>
              <option value="in" className="bg-[#252525]">inches</option>
              <option value="m" className="bg-[#252525]">meters</option>
            </select>
          </div>
        </div>

        {/* Right: Templates, Fixtures, Export, AI Studio Tools & Roles/Multiplayer Header */}
        <div className="flex items-center space-x-2">
          {/* Export & Publish Artifacts button */}
          <button
            onClick={() => setIsExportPublishOpen(true)}
            className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded text-xs font-semibold flex items-center space-x-1.5 shadow transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export / Publish</span>
          </button>

          {/* Template Library button */}
          <button
            onClick={() => setIsTemplateLibraryOpen(true)}
            className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] text-gray-300 border border-[#333] rounded text-xs font-medium flex items-center space-x-1.5 transition"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Templates</span>
          </button>

          {/* Fixtures button */}
          {!isViewer && (
            <button
              onClick={() => setIsFurniturePickerOpen(true)}
              className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] text-gray-300 border border-[#333] rounded text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <Armchair className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Fixtures</span>
            </button>
          )}

          {/* Vision Sketch button */}
          {!isViewer && (
            <button
              onClick={() => setIsSketchModalOpen(true)}
              className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] text-gray-300 border border-[#333] rounded text-xs font-medium flex items-center space-x-1.5 transition"
            >
              <FileScan className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Vision</span>
            </button>
          )}

          {/* Gemini Renders */}
          <button
            onClick={() => setIsImageGenModalOpen(true)}
            className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] text-blue-300 border border-blue-500/40 rounded text-xs font-medium flex items-center space-x-1.5 transition"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Renders</span>
          </button>

          {/* Veo Video */}
          <button
            onClick={() => setIsVeoModalOpen(true)}
            className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] text-emerald-300 border border-emerald-500/40 rounded text-xs font-medium flex items-center space-x-1.5 transition"
          >
            <Video className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Veo</span>
          </button>

          {/* User Role Badge / Quick Switcher */}
          <div className="flex items-center bg-[#1E1E1E] border border-[#333] rounded px-2 py-0.5 space-x-1.5">
            <Shield className="w-3 h-3 text-gray-400" />
            <select
              value={currentUser.role}
              onChange={(e) => handleChangeSelfRole(e.target.value as UserRole)}
              className="bg-transparent text-[11px] font-mono text-gray-200 focus:outline-none cursor-pointer"
              title="Change your active session role"
            >
              <option value="Owner" className="bg-[#252525]">👑 Owner</option>
              <option value="Editor" className="bg-[#252525]">✏️ Editor</option>
              <option value="Viewer" className="bg-[#252525]">👁️ Viewer</option>
            </select>
          </div>

          {/* Active Collaborator Avatar Stack */}
          <div 
            className="flex -space-x-1.5 items-center cursor-pointer hover:opacity-80 transition" 
            onClick={() => setIsCloudModalOpen(true)}
            title="Manage collaboration & permissions"
          >
            <div 
              style={{ backgroundColor: currentUser.color }} 
              className="w-6 h-6 rounded-full border-2 border-[#252525] flex items-center justify-center text-[9px] font-bold text-white shadow-sm" 
              title={`You (${currentUser.role})`}
            >
              {currentUser.name.substring(0, 2).toUpperCase()}
            </div>
            {remoteUsers.slice(0, 2).map((u) => (
              <div
                key={u.id}
                style={{ backgroundColor: u.color }}
                className="w-6 h-6 rounded-full border-2 border-[#252525] flex items-center justify-center text-[9px] font-bold text-white shadow-sm"
                title={`${u.name} (${u.role || 'Editor'})`}
              >
                {u.name.substring(0, 2).toUpperCase()}
              </div>
            ))}
            {remoteUsers.length > 2 && (
              <div className="w-6 h-6 rounded-full border-2 border-[#252525] bg-blue-600 flex items-center justify-center text-[9px] font-bold text-white shadow-sm">
                +{remoteUsers.length - 2}
              </div>
            )}
          </div>

          {/* Share / Collab Button */}
          <button
            onClick={() => setIsCloudModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition shadow-sm flex items-center space-x-1"
          >
            <Share2 className="w-3 h-3" />
            <span>Collab ({remoteUsers.length + 1})</span>
          </button>
        </div>
      </header>

      {/* Floating Permission/Action Notification Toast */}
      {toastMessage && (
        <div className="fixed top-14 right-4 z-50 bg-[#252525] border border-blue-500/50 text-white px-3 py-2 rounded shadow-2xl flex items-center space-x-2 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-gray-400 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Main Studio Workspace Area */}
      <main className="flex flex-1 overflow-hidden relative">
        {/* Left: AgentSam AI Chat Copilot */}
        {isSidebarOpen && (
          <AgentSidebar
            project={project}
            onApplyPlan={handleApplyAIPlan}
            onOpenVeoModal={() => setIsVeoModalOpen(true)}
            onOpenImageGenModal={() => setIsImageGenModalOpen(true)}
            onOpenSketchModal={() => setIsSketchModalOpen(true)}
            userRole={currentUser.role}
          />
        )}

        {/* Center: Viewports (2D, 3D, or Split) */}
        <section className="flex-1 flex overflow-hidden relative bg-[#121212]">
          {/* 2D Plan Canvas */}
          {(viewMode === '2d' || viewMode === 'split') && (
            <div className={`h-full relative ${viewMode === 'split' ? 'w-1/2 border-r border-[#333]' : 'w-full'}`}>
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

          {/* 3D BIM Viewport */}
          {(viewMode === '3d' || viewMode === 'split') && (
            <div className={`h-full relative ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
              <Viewport3D
                project={project}
                onTakeSnapshot={(dataUrl) => {
                  setActiveSnapshotUrl(dataUrl);
                  setIsImageGenModalOpen(true);
                }}
              />
            </div>
          )}

          {/* tldraw Freehand Spatial Ideation Canvas */}
          {viewMode === 'sketch' && (
            <div className="w-full h-full relative">
              <SketchCanvasTLDraw
                project={project}
                onUpdateProject={(newProj) => updateProject(() => newProj)}
                canEdit={!isViewer}
              />
            </div>
          )}

          {/* OpenSCAD Parametric Assemblies Editor */}
          {viewMode === 'parametric' && (
            <div className="w-full h-full relative">
              <ParametricEditor
                project={project}
                onUpdateProject={(newProj) => updateProject(() => newProj)}
                canEdit={!isViewer}
              />
            </div>
          )}
        </section>
      </main>

      {/* High Density IDE Status Footer */}
      <footer className="h-6 bg-[#252525] border-t border-[#333] flex items-center justify-between px-3 text-[9px] text-gray-400 shrink-0 font-mono">
        <div className="flex space-x-4">
          <span>UTF-8</span>
          <span>Room: {roomId}</span>
          <span className="text-blue-400">Role: {currentUser.role}</span>
          <span className="hidden sm:inline">Rooms: {project.rooms?.length || 0}</span>
          <span className="hidden sm:inline">Walls: {project.walls?.length || 0}</span>
          <span className="hidden sm:inline">Fixtures: {project.furniture?.length || 0}</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Grid: Snap {project.gridSize || 12}"</span>
          <span>Units: {unit.toUpperCase()}</span>
          <div className="flex items-center space-x-1.5 text-gray-300">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
            <span>AgentSam Studio v1.0.0</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <TemplateLibraryModal
        isOpen={isTemplateLibraryOpen}
        onClose={() => setIsTemplateLibraryOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        currentRole={currentUser.role}
      />

      <FurniturePicker
        isOpen={isFurniturePickerOpen}
        onClose={() => setIsFurniturePickerOpen(false)}
        onSelectFurniture={handleSelectFurniture}
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
        onSendToVeo={(imgUrl) => {
          setActiveSnapshotUrl(imgUrl);
          setIsVeoModalOpen(true);
        }}
      />

      <SketchUploadModal
        isOpen={isSketchModalOpen}
        onClose={() => setIsSketchModalOpen(false)}
        onApplyParsedPlan={handleApplyAIPlan}
      />

      <CloudProjectsModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        project={project}
        onLoadProject={(newProj) => updateProject(() => newProj)}
        remoteUsers={remoteUsers}
        currentUser={currentUser}
        roomId={roomId}
        onJoinRoom={handleJoinRoom}
        isSynced={isSynced}
        onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
        onChangeUserRole={handleChangeUserRole}
        onChangeSelfRole={handleChangeSelfRole}
      />

      <ExportPublishModal
        project={project}
        isOpen={isExportPublishOpen}
        onClose={() => setIsExportPublishOpen(false)}
        canExport={permissions.canExport}
      />
    </div>
  );
}

export default App;
