import {CadCamWorkspace} from '../components/CadCamWorkspace';
import {CadCodeWorkspace} from '../components/CadCodeWorkspace';
import {recordNativePlanChange} from '../lib/native-engine';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {applyDesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import type {DesignOperation} from '@inneranimalmedia/agentsam-cad-shared';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ProjectState,
  ActiveTool,
  MultiplayerUser,
  MeasurementUnit,
  FurnitureCategory,
  UserRole
} from '@inneranimalmedia/agentsam-cad-shared';
import type {CadSceneElement} from '@inneranimalmedia/agentsam-cad-shared';
import {reconcileSceneElements,sceneReviewContext} from '../lib/scene-document';
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
import {CadResourcesPane} from '../components/CadResourcesPane';
import {cloneAssembly,validateWallAssembly,wallAssemblyTotal} from '../lib/cad/wall-assemblies';
import { listHostedProjects, loadHostedProject, saveHostedProject, type CadHostedSelection } from '../lib/hosted-project-source';
import { BimStartersWorkspace } from '../components/BimStartersWorkspace';
import { LazyRoboticsWorkspace, preloadRoboticsWorkspace } from '../workspaces/robotics/lazy';
import { ExportPublishModal } from '../components/ExportPublishModal';
import { CloudProjectsModal } from '../components/CloudProjectsModal';
import { TemplateDrawer } from '../components/TemplateDrawer';
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
  const [sceneInventory,setSceneInventory] = useState<Array<{category:string;count:number}>>([]);
  useEffect(() => {
    if (accessMode !== 'hosted-project') return;
    let active=true;
    void listHostedProjects().then(rows => {if(active)setHostedProjects(rows);}).catch(error => {if(active)setSourceError(String(error));});
    return () => {active=false;};
  },[accessMode]);
  useEffect(() => {
    if (accessMode !== 'hosted-project' || !hostedProjectId) return;
    let active=true;
    setSourceStatus('loading');setSourceError('');setHostedSelection(null);setSceneInventory([]);
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
  const [planLayout, setPlanLayout] = useState<'2d' | 'split'>('split');
  const [splitRatio, setSplitRatio] = useState(50);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [explorerOpen, setExplorerOpen] = useState(() => presentation !== 'embedded' && (typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches));
  const [inspectorOpen, setInspectorOpen] = useState(() => presentation !== 'embedded' && (typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches));
  const [studioView,setStudioView]=useState<'preview'|'edit'|'code'>('edit');
  const [uiSelection, setUiSelection] = useState<CadElementSelection>(null);
  // Embedded CAD starts with the model as the stage. Show one contextual drawer
  // only when the user selects an element or requests a panel.
  useEffect(() => {
    if (presentation !== 'embedded' || !uiSelection) return;
    setInspectorOpen(true);
    if(window.matchMedia('(max-width: 660px)').matches)setExplorerOpen(false);
  }, [presentation, uiSelection]);
  // Appearance belongs to the AgentSam host navigation/theme provider.
  const cadAccent = 'var(--nav-accent, var(--color-accent, #82a7fb))';
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
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [leftPanelTab,setLeftPanelTab]=useState<'objects'|'assets'|'libraries'>('objects');
  // Hosted mode only: name of the unsaved template copy being edited. Null means no copy is open.
  const [templateCopyName, setTemplateCopyName] = useState<string | null>(null);
  const [isExportPublishOpen, setIsExportPublishOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(()=>{const onSave=(event:Event)=>setToastMessage((event as CustomEvent<string>).detail);window.addEventListener('agentsam:cad-save-status',onSave);return()=>window.removeEventListener('agentsam:cad-save-status',onSave)},[]);

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
  // Hosted projects are writable only for the owner (decided by the server) and only when a native design document is loaded.
  const hostedWritable = accessMode === 'hosted-project' && !!hostedSelection?.project && !!hostedSelection.revision.documents.length && hostedSelection.registry.access?.canWrite === true;
  useEffect(() => {
    if (accessMode !== 'hosted-project') return;
    setCurrentUser(user => { const role = hostedWritable ? 'Editor' : 'Viewer'; return user.role === role ? user : { ...user, role }; });
  }, [accessMode, hostedWritable]);
  const hostedSavedJson = useMemo(() => hostedSelection?.project ? JSON.stringify(hostedSelection.project) : '', [hostedSelection]);
  const hostedDirty = useMemo(() => hostedWritable && JSON.stringify(project) !== hostedSavedJson, [hostedWritable, project, hostedSavedJson]);
  const [hostedSaving, setHostedSaving] = useState(false);
  const saveHostedRevision = useCallback(async () => {
    if (!hostedWritable || !hostedSelection || hostedSaving) return;
    setHostedSaving(true);
    try {
      const expectedHash=hostedSelection.revision.documents[0]?.contentHash||hostedSelection.revision.models[0]?.contentHash||undefined;
      const receipt = await saveHostedProject(hostedProjectId, project, hostedSelection.revision.revision,fetch,expectedHash);
      showToast(`Saved revision ${receipt.revisionNumber}${receipt.verified ? '' : ' (read-back not verified)'}`);
      const saved=await loadHostedProject(hostedProjectId,'current');
      setHostedSelection(saved);setProject(saved.project!);setHistory([]);setRedoStack([]);
      const url=new URL(window.location.href);url.searchParams.set('project',hostedProjectId);url.searchParams.delete('revision');window.history.replaceState(null,'',url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Save failed. Nothing was changed.');
    } finally { setHostedSaving(false); }
  }, [hostedWritable, hostedSelection, hostedSaving, hostedProjectId, project]);

  const updateProject = useCallback((updater: (prev: ProjectState) => ProjectState) => {
    if (isViewer) {
      showToast('Action restricted: Viewers cannot modify project geometry');
      return;
    }

    setVerifiedProjectRevision(null);
    setProject((prev) => {
      const next = recordNativePlanChange(prev, updater(prev));
      setHistory((h) => [...h.slice(-20), prev]);
      setRedoStack([]);
      if (canCollaborate) collaborationClient.sendProjectUpdate(next);
      return next;
    });
  }, [isViewer, canCollaborate]);

  const registerSceneElements=useCallback((elements:CadSceneElement[])=>{
    setProject(previous=>previous.sceneSource?reconcileSceneElements(previous,previous.sceneSource,elements):previous);
  },[]);
  const updateSceneSettings=useCallback((updates:Partial<NonNullable<ProjectState['sceneSettings']>>)=>{
    updateProject(previous=>({...previous,sceneSettings:{...previous.sceneSettings,...updates}}));
  },[updateProject]);
  const selectSceneElement=useCallback(({designId}:{designId:string})=>{
    const group=project.sceneElements?.some(element=>element.id===designId)?'sceneElements':
      (['walls','doors','windows','rooms','furniture','parametricObjects'] as const).find(key=>project[key]?.some(element=>element.id===designId));
    if(group){setUiSelection({group,id:designId});setInspectorOpen(true);}
  },[project]);
  // All entry points publish one selection, including tree clicks, imported meshes and draft objects.
  useEffect(()=>{
    const record=uiSelection?project[uiSelection.group]?.find(element=>element.id===uiSelection.id):null;
    const runtimeRevision=verifiedSelectionRevision(project.id,verifiedProjectRevision);
    const selection=uiSelection&&record?buildSelectionContext({workspace:activeWorkspace,projectId:hostedProjectId||project.id,
      revision:runtimeRevision??0,revisionRef:hostedSelection?.revision.revision,
      objectId:uiSelection.id,objectType:uiSelection.group==='sceneElements'?'scene-element':uiSelection.group,
      label:'name' in record?String(record.name):'label' in record?String(record.label||record.id):record.id,
      units:uiSelection.group==='sceneElements'?'m':'in'}):null;
    setCadSelection(selection);bridgeRef.current?.post({type:'cad.selection',selection});
  },[uiSelection,project,activeWorkspace,verifiedProjectRevision,hostedProjectId,hostedSelection]);
  const reviewSelectedElement=()=>{
    const element=uiSelection&&project[uiSelection.group]?.find(row=>row.id===uiSelection.id);
    if(!element)return;
    updateProject(previous=>({...previous,sketchDocument:{...previous.sketchDocument,review:{
      note:'note' in element?String(element.note||''):'',targetId:element.id,
      targetLabel:'name' in element?String(element.name):element.id,revisionRef:hostedSelection?.revision.revision}}}));
    setActiveWorkspace('plan');setPlanLayout('split');
  };
  const submitCadRequest=async(prompt:string,interfaceSelection:unknown=null)=>{
    const review=sceneReviewContext(project,uiSelection?.id);
    const strokes=review.strokes;review.strokes=[];
    const context={workspace:activeWorkspace,project_id:hostedProjectId||project.id,project_name:project.name,
      revision:verifiedProjectRevision?.revision??null,revision_ref:hostedSelection?.revision.revision||null,
      unsaved:hostedDirty,interface_selection:interfaceSelection,review,
      sketch_stroke_count:strokes.length,sketch_stroke_ids:strokes.slice(0,32).map(stroke=>stroke.id)};
    for(const stroke of strokes){
      const next={...stroke,points:stroke.points.filter((_,i)=>i%Math.max(1,Math.ceil(stroke.points.length/40))===0)};
      if(JSON.stringify({...context,review:{...review,strokes:[...review.strokes,next]}}).length>5500)break;
      review.strokes.push(next);
    }
    const message=prompt.trim().slice(0,1500)+'\n\nCAD project context (descriptive only; not edit authority): '+JSON.stringify(context);
    if(presentation!=='embedded'||!bridgeRef.current){setCopilotDraft(message);setAssistantReply('Request prepared with the selected element and sketch. Open this project in Local Studio to send it.');return;}
    setCopilotDraft('');setAssistantReply('Request sent with the current project, element and sketch context.');
    bridgeRef.current.post({type:'assistant.request',request_id:crypto.randomUUID(),prompt:message,selection:cadSelection});
  };

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
          onNew={startBlankProject} onTemplates={() => {setExplorerOpen(true);setLeftPanelTab('libraries');setIsTemplateLibraryOpen(true)}} onStock={()=>{setExplorerOpen(true);setLeftPanelTab('libraries');setIsTemplateLibraryOpen(false)}}
          onExport={() => setIsExportPublishOpen(true)}
          onSave={()=>{if(accessMode==='hosted-project'){void saveHostedRevision()}else window.dispatchEvent(new Event('agentsam:cad-save-revision'))}}
          saveDisabled={isViewer||hostedSaving}
          saveLabel={accessMode==='hosted-project'&&!hostedWritable?'No editable registered BIM document':hostedDirty?'Save edited DreamHouse revision':'Save revision'}
          onToggleExplorer={() => {if(window.matchMedia('(max-width: 660px)').matches&&!explorerOpen)setInspectorOpen(false);setExplorerOpen(v => !v);}}
          onToggleInspector={() => {if(window.matchMedia('(max-width: 660px)').matches&&!inspectorOpen)setExplorerOpen(false);setInspectorOpen(v => !v);}}
          explorerOpen={explorerOpen} inspectorOpen={inspectorOpen}
          studioView={studioView} onStudioView={v=>{setStudioView(v);if(v==='preview'){handleSelectWorkspace('model');setExplorerOpen(false);setInspectorOpen(false)}else if(v==='code'){handleSelectWorkspace('model')}else {handleSelectWorkspace('plan')}}}
          viewportMode={activeWorkspace==='plan'?(planLayout==='split'?'split':'2d'):'3d'}
          onViewportMode={mode=>{setStudioView('edit');if(mode==='3d'){handleSelectWorkspace('model')}else{handleSelectWorkspace('plan');setPlanLayout(mode)}}}
          projectSlot={accessMode === 'hosted-project' ? (hostedWritable
            ? <div className="flex items-center gap-2 text-xs text-slate-300"><span>{hostedDirty ? 'Unsaved changes' : 'All changes saved'} · {hostedSelection?.revision.label || hostedSelection?.revision.revision}</span><button type="button" disabled={!hostedDirty || hostedSaving} onClick={() => void saveHostedRevision()}>{hostedSaving ? 'Saving…' : 'Save revision'}</button></div>
            : <span className="text-xs text-slate-400">{templateCopyName ? 'Unsaved template copy · use Export to keep it' : 'Registered BIM · this revision has no editable design document'}</span>) : <ProjectRuntimePanel project={project} onLoad={setProject} onVerifiedRevision={onVerifiedRevision} readOnly={isViewer}/>}
          runtimeSlot={<CadStatusStrip workspace={currentWorkspaceDescriptor} activeTool={activeTool} unit={unit}
            selectionCount={currentUser.selectedIds.length} jobStatus={cadToolsReport ? `${cadToolsReport.available_tools}/${cadToolsReport.total_tools} Engines Online` : 'Engine Ready'}
            isSynced={isSynced} isDarkMode={isDarkMode} capabilities={liveCapabilities}/>}
        />
      )}
      </>)}
      {/* 3. Main Stage (canvas-first, no assistant sidebar) */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        <div className="cad-workspace-body">
          {(explorerOpen || inspectorOpen) && <button type="button" className="cad-panel-scrim" aria-label="Close open CAD panels"
            onClick={()=>{setExplorerOpen(false);setInspectorOpen(false)}} />}
          {(activeWorkspace === 'plan' || activeWorkspace === 'model') && explorerOpen && (
            <div className="cad-left-dock">
              <div className="cad-dock-tabs" role="tablist" aria-label="Left panel">
                {(['objects','assets','libraries'] as const).map(tab=><button type="button" key={tab} role="tab"
                  aria-selected={leftPanelTab===tab} onClick={()=>{setLeftPanelTab(tab);setIsTemplateLibraryOpen(false);}}>
                  {tab[0].toUpperCase()+tab.slice(1)}
                </button>)}
              </div>
              {leftPanelTab==='libraries'&&isTemplateLibraryOpen
                ? <TemplateDrawer onClose={() => setIsTemplateLibraryOpen(false)}
                    canLoad={getPermissions(accessMode === 'hosted-project' && !hostedSelection ? 'Editor' : currentUser.role).canLoadTemplates}
                    onApply={tmpl => {
                      if (accessMode === 'hosted-project' && !hostedSelection) { startFromTemplate(tmpl, tmpl.name); return; }
                      if (isViewer) return;
                      updateProject(() => ({ ...tmpl, id: `proj_${Date.now()}`, updatedAt: Date.now(), version: 1 }));
                      showToast(`Loaded "${tmpl.name}" template`);
                    }} />
                : leftPanelTab==='objects'
                  ? <CadProjectExplorer project={project} selection={uiSelection}
                    sceneInventory={hostedSelection?.revision.revision==='current'&&!hostedSelection.project ? sceneInventory : undefined}
                    onSelect={next=>{setUiSelection(next);if(next){setInspectorOpen(true);if(window.matchMedia('(max-width: 660px)').matches)setExplorerOpen(false);}}}
                    onClose={() => setExplorerOpen(false)} />
                  : <CadResourcesPane mode={leftPanelTab} project={project} selection={uiSelection} readOnly={isViewer}
                      sceneInventory={sceneInventory} onClose={()=>setExplorerOpen(false)}
                      onSelect={next=>{setUiSelection(next);setInspectorOpen(true);if(window.matchMedia('(max-width: 660px)').matches)setExplorerOpen(false);}}
                      onOpenTemplates={()=>setIsTemplateLibraryOpen(true)}
                      onPlaceStock={preset=>{if(isViewer)return;setSelectedFurnitureType(preset.type);setActiveTool('furniture');setStudioView('edit');handleSelectWorkspace('plan');setPlanLayout('split');showToast('Click the 2D plan to place '+preset.name);}}
                      onApplyAssembly={assembly=>{
                        if(uiSelection?.group!=='walls'||validateWallAssembly(assembly))return;
                        const selectedId=uiSelection.id;
                        const operation={id:'cad-library-'+Date.now(),timestamp:Date.now(),type:'update_wall',wallId:selectedId,
                          updates:{assembly:cloneAssembly(assembly),thickness:wallAssemblyTotal(assembly),material:assembly.layers[0].material}} as DesignOperation;
                        updateProject(previous=>{const applied=applyDesignOperation(previous,operation);return applied.success?applied.project:previous});
                      }}/>}

            </div>
          )}
        {/* PRIMARY VIEWPORT STAGE */}
        <section className={'cad-workspace-stage flex-1 flex overflow-hidden relative bg-[#121212]'+(activeWorkspace==='plan'&&planLayout==='split'?' cad-stage-split':'')}
          style={{'--cad-split':splitRatio+'%'} as React.CSSProperties}>
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
          {studioView==='code'&&<CadCodeWorkspace project={project} selection={uiSelection} readOnly={isViewer}
            onUpdateProject={next=>updateProject(()=>next)} onBack={()=>{setStudioView('edit');handleSelectWorkspace('plan')}}/>}
          {/* WORKSPACE 1: PLAN */}
          {studioView!=='code'&&activeWorkspace === 'plan' && (
            <>
              {(planLayout === '2d' || planLayout === 'split') && (
                <div className={`cad-plan-pane h-full relative min-w-0 ${planLayout === 'split' ? 'border-r border-white/10' : 'w-full'}`} style={planLayout==='split'?{width:splitRatio+'%',flex:'none'}:undefined}>
                  <Canvas2D
                    project={project}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onProjectChange={updateProject}
                    showToolToolbar={false}
                    externalSelection={uiSelection && uiSelection.group !== 'parametricObjects' && uiSelection.group !== 'sceneElements' ? {
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
                      if (group) { setUiSelection({group,id}); setInspectorOpen(true); if (window.matchMedia('(max-width: 660px)').matches) setExplorerOpen(false); }
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

              {planLayout === 'split' && <div className="cad-split-handle" role="separator" tabIndex={0}
                aria-label="Resize linked 2D and 3D views" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(splitRatio)}
                aria-valuetext={Math.round(splitRatio)+'% 2D, '+Math.round(100-splitRatio)+'% 3D'}
                style={{left:splitRatio+'%'}}
                onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)}}
                onPointerMove={event=>{
                  if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
                  const rect=event.currentTarget.parentElement?.getBoundingClientRect();
                  if(!rect)return;
                  const vertical=window.matchMedia('(max-width: 660px) and (orientation: portrait)').matches;
                  const fraction=vertical?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width;
                  setSplitRatio(Math.max(25,Math.min(75,Math.round(fraction*100))));
                }}
                onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
                onKeyDown={event=>{
                  const shift=event.key==='ArrowLeft'||event.key==='ArrowUp'?-5:event.key==='ArrowRight'||event.key==='ArrowDown'?5:0;
                  if(shift||event.key==='Home'||event.key==='End'){
                    event.preventDefault();
                    setSplitRatio(current=>event.key==='Home'?25:event.key==='End'?75:Math.max(25,Math.min(75,current+shift)));
                  }
                }}><span aria-hidden="true"/></div>}
              {(planLayout === 'split') && (
                <div className="cad-world-pane h-full relative min-w-0" style={{width:(100-splitRatio)+'%',flex:'none'}}>
                  {hostedSelection && sourceStatus==='loaded'
                    ? <CadWorldViewport modelUrl={hostedSelection.modelUrl} sceneLabel={hostedSelection.registry.project.name} revision={hostedSelection.revision.sceneRevision||hostedSelection.revision.revision}
                        readOnly={isViewer} siteEditable={!isViewer} onSceneInventory={setSceneInventory} onSceneElements={registerSceneElements}
                        sceneElements={project.sceneElements} selectedElementId={uiSelection?.group==='sceneElements'?uiSelection.id:undefined}
                        layoutProject={project} onSceneSettings={updateSceneSettings} onSelect={selectSceneElement}/>
                    : accessMode === 'hosted-project' && !templateCopyName && !hostedWritable
                      ? hostedEmptyPane
                    : <Viewport3D project={project} onLightingChange={isViewer?undefined:updates=>updateProject(p=>({...p,lighting:{...p.lighting,...updates}}))}/>}
                </div>
              )}


            </>
          )}

          {/* WORKSPACE 2: MODEL */}
          {studioView!=='code'&&activeWorkspace === 'model' && (
            <div className="w-full h-full relative">
              {showBimStarters ? <BimStartersWorkspace onReturn={() => setShowBimStarters(false)} />
              : hostedSelection && sourceStatus==='loaded'
                ? <CadWorldViewport modelUrl={hostedSelection.modelUrl} sceneLabel={hostedSelection.registry.project.name} revision={hostedSelection.revision.sceneRevision||hostedSelection.revision.revision}
                    readOnly={isViewer} siteEditable={!isViewer} onSceneInventory={setSceneInventory} onSceneElements={registerSceneElements}
                    sceneElements={project.sceneElements} selectedElementId={uiSelection?.group==='sceneElements'?uiSelection.id:undefined}
                    layoutProject={project} onSceneSettings={updateSceneSettings} onSelect={selectSceneElement}/>
                : accessMode === 'hosted-project' && !templateCopyName
                  ? hostedEmptyPane
                : <Viewport3D project={project} onLightingChange={isViewer?undefined:updates=>updateProject(p=>({...p,lighting:{...p.lighting,...updates}}))}/>}
            </div>
          )}

          {/* Manufacturing planning is separate from the Franka chess game. */}
          {studioView!=='code'&&activeWorkspace==='robotics'&&
           <CadCamWorkspace project={project} onCode={()=>setStudioView('code')} onExport={()=>setIsExportPublishOpen(true)}/>}
                    {/* Rendering now shows the current project instead of opening disconnected prototype dialogs. */}
          {studioView!=='code'&&activeWorkspace === 'render' && (
            <div className="w-full h-full">
              <Viewport3D project={project} onLightingChange={isViewer?undefined:updates=>updateProject(p=>({...p,lighting:{...p.lighting,...updates}}))}/>
            </div>
          )}
        </section>
          {(activeWorkspace === 'plan' || activeWorkspace === 'model' || activeWorkspace === 'render') && inspectorOpen && (
            <CadPropertyInspector project={project} selection={uiSelection}
              onSelect={setUiSelection} onChange={updateProject}
              onClose={() => setInspectorOpen(false)} readOnly={isViewer} onReview={reviewSelectedElement}
              onEditCode={()=>{setStudioView('code');handleSelectWorkspace('model')}}/>
          )}
        </div>
      </main>

      {/* Reuse the SDK's real miniAgentSam selection/composer. The CAD host
          owns conversation transport and every geometry-changing operation. */}
      <MiniAgentSam selecting={annotating} onSelectingChange={setAnnotating}
        onSubmit={submitCadRequest}
      />
      {(copilotDraft || assistantReply) && <aside data-annotation-control="" aria-label="CAD copilot status" className="fixed bottom-14 right-4 z-[100] w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-white/20 bg-slate-950 px-3 py-2 text-xs text-white shadow-2xl">
        <div className="flex items-center justify-between gap-2"><strong>AgentSam CAD copilot</strong><button type="button" aria-label="Dismiss copilot status" onClick={() => {setCopilotDraft('');setAssistantReply('');}}>Close</button></div>
        {assistantReply && <p role="status" className="mt-2 whitespace-pre-wrap">{assistantReply}</p>}
        {copilotDraft && <><textarea readOnly value={copilotDraft} aria-label="CAD request draft" rows={4} className="mt-2 w-full rounded bg-slate-800 p-2 text-white"/><button type="button" onClick={() => void navigator.clipboard.writeText(copilotDraft)}>Copy request</button></>}
      </aside>}


      <ExportPublishModal
        isOpen={isExportPublishOpen}
        onClose={() => setIsExportPublishOpen(false)}
        project={project}
        canExport={permissions.canExport}
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
