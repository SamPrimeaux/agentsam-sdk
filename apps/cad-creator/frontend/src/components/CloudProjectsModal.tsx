import React, { useState } from 'react';
import { 
  Cloud, 
  Users, 
  Share2, 
  Copy, 
  Check, 
  FolderDown, 
  FileCode, 
  X, 
  History, 
  Save, 
  Sparkles,
  Download,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Eye,
  Edit3,
  Crown,
  Lock,
  ExternalLink
} from 'lucide-react';
import { MultiplayerUser, ProjectState, UserRole } from '@inneranimalmedia/agentsam-cad-shared';
import { TEMPLATE_METADATA_LIST, TemplateMetadata } from '../lib/templates';
import { exportToDXF, exportToOBJ, exportToSVG, downloadFile } from '../lib/cad-export';
import { getPermissions, ROLE_DESCRIPTIONS } from '../lib/permissions';
import { collaborationClient } from '../lib/socket';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectState;
  onLoadProject: (p: ProjectState) => void;
  remoteUsers: MultiplayerUser[];
  currentUser: MultiplayerUser;
  roomId: string;
  onJoinRoom: (newRoomId: string) => void;
  isSynced: boolean;
  onOpenTemplateLibrary?: () => void;
  onChangeUserRole?: (userId: string, newRole: UserRole) => void;
  onChangeSelfRole?: (newRole: UserRole) => void;
}

export const CloudProjectsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  project,
  onLoadProject,
  remoteUsers,
  currentUser,
  roomId,
  onJoinRoom,
  isSynced,
  onOpenTemplateLibrary,
  onChangeUserRole,
  onChangeSelfRole,
}) => {
  const [activeTab, setActiveTab] = useState<'collab' | 'templates' | 'export' | 'revisions'>('collab');
  const [roomInput, setRoomInput] = useState(roomId);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedTemplateCat, setSelectedTemplateCat] = useState<string>('all');
  const [savedProjects, setSavedProjects] = useState<Array<{ id: string; name: string; date: string; state: ProjectState }>>(() => {
    try {
      const stored = localStorage.getItem('agentsam_saved_projects');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const permissions = getPermissions(currentUser.role);
  const isOwner = currentUser.role === 'Owner';

  if (!isOpen) return null;

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSaveToCloud = () => {
    if (!permissions.canSaveRevisions) return;
    const newSave = {
      id: `proj_${Date.now()}`,
      name: project.name || 'Untitled Studio Plan',
      date: new Date().toLocaleTimeString() + ' - ' + new Date().toLocaleDateString(),
      state: { ...project, updatedAt: Date.now() },
    };
    const updated = [newSave, ...savedProjects.slice(0, 9)];
    setSavedProjects(updated);
    try {
      localStorage.setItem('agentsam_saved_projects', JSON.stringify(updated));
    } catch (e) {}
  };

  const handleRoleSelect = (targetUserId: string, newRole: UserRole) => {
    if (onChangeUserRole) {
      onChangeUserRole(targetUserId, newRole);
    } else {
      collaborationClient.changeUserRole(targetUserId, newRole);
    }
  };

  const handleTemplateSelect = (tpl: TemplateMetadata) => {
    if (!permissions.canLoadTemplates) return;
    const cloned: ProjectState = {
      ...tpl.project,
      id: `proj_${Date.now()}`,
      updatedAt: Date.now(),
      version: 1,
    };
    onLoadProject(cloned);
    onClose();
  };

  const filteredTemplates = TEMPLATE_METADATA_LIST.filter(
    (t) => selectedTemplateCat === 'all' || t.category === selectedTemplateCat
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#252525] border border-[#333] rounded w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-[#333] flex items-center justify-between bg-[#252525]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white">Cloud Sync & Permissions Center</h2>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono flex items-center space-x-1 ${
                  isSynced ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-green-500' : 'bg-amber-400'}`} />
                  <span>{isSynced ? 'Cloud Synced' : 'Syncing'}</span>
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Manage real-time collaboration roles, load design templates, and export CAD</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#333] bg-[#1E1E1E] px-3">
          <button
            onClick={() => setActiveTab('collab')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'collab'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Collaboration & Roles ({remoteUsers.length + 1})</span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Template Library</span>
          </button>
          <button
            onClick={() => setActiveTab('revisions')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'revisions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Cloud Snapshots</span>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Formats</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#1E1E1E]">
          {/* TAB 1: COLLABORATION & ROLES MANAGEMENT */}
          {activeTab === 'collab' && (
            <div className="space-y-4">
              {/* Room Session Code & Link */}
              <div className="p-3 rounded bg-[#252525] border border-[#333] space-y-2.5">
                <label className="text-xs font-semibold text-gray-300 block">
                  Active Collaboration Session Room
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder="Enter room identifier..."
                    className="flex-1 bg-[#1E1E1E] border border-[#333] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={() => onJoinRoom(roomInput)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition"
                  >
                    Switch Room
                  </button>
                </div>

                <div className="pt-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#333]">
                  <span className="text-xs text-gray-400">Share this direct collaboration link:</span>
                  <button
                    onClick={handleCopyShareLink}
                    className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] border border-[#333] text-gray-200 rounded text-xs font-medium flex items-center space-x-1 transition w-max"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Share URL'}</span>
                  </button>
                </div>
              </div>

              {/* Roles & Permissions Management List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span>Active Session Members & Roles ({remoteUsers.length + 1})</span>
                  </h3>
                  {isOwner && (
                    <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      👑 You are Room Owner (Role Administration Enabled)
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Current User Card */}
                  <div className="p-3 rounded bg-[#252525] border border-[#333] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-3">
                      <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: currentUser.color }} />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white">{currentUser.name}</span>
                          <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.2 rounded">
                            (You)
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {ROLE_DESCRIPTIONS[currentUser.role]?.description || 'Collaborator'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 self-end sm:self-auto">
                      {/* Role Badge or Switcher */}
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-gray-400 font-mono">Role:</span>
                        {onChangeSelfRole ? (
                          <select
                            value={currentUser.role}
                            onChange={(e) => onChangeSelfRole(e.target.value as UserRole)}
                            className="bg-[#1E1E1E] border border-[#333] text-xs text-white rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-500"
                          >
                            <option value="Owner">👑 Owner</option>
                            <option value="Editor">✏️ Editor</option>
                            <option value="Viewer">👁️ Viewer</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono border font-medium ${ROLE_DESCRIPTIONS[currentUser.role]?.badgeColor}`}>
                            {currentUser.role === 'Owner' && '👑 '}
                            {currentUser.role === 'Editor' && '✏️ '}
                            {currentUser.role === 'Viewer' && '👁️ '}
                            {currentUser.role}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remote Collaborators */}
                  {remoteUsers.map((u) => (
                    <div key={u.id} className="p-3 rounded bg-[#252525] border border-[#333] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center space-x-3">
                        <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: u.color }} />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white">{u.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono">Online</span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {ROLE_DESCRIPTIONS[u.role || 'Editor']?.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-end sm:self-auto">
                        <span className="text-[10px] text-gray-400 font-mono">Role:</span>
                        {isOwner ? (
                          <select
                            value={u.role || 'Editor'}
                            onChange={(e) => handleRoleSelect(u.id, e.target.value as UserRole)}
                            className="bg-[#1E1E1E] border border-[#333] text-xs text-white rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-500"
                          >
                            <option value="Owner">👑 Owner</option>
                            <option value="Editor">✏️ Editor</option>
                            <option value="Viewer">👁️ Viewer</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono border font-medium ${ROLE_DESCRIPTIONS[u.role || 'Editor']?.badgeColor}`}>
                            {u.role === 'Owner' && '👑 '}
                            {u.role === 'Editor' && '✏️ '}
                            {u.role === 'Viewer' && '👁️ '}
                            {u.role || 'Editor'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Roles Capabilities Matrix / Legend */}
              <div className="p-3 rounded bg-[#252525] border border-[#333] space-y-2">
                <h4 className="text-[11px] font-bold text-gray-300 uppercase tracking-wider font-mono">
                  Role Capabilities Matrix
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  {/* Owner */}
                  <div className="p-2.5 rounded bg-[#1E1E1E] border border-amber-500/30 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-amber-300 font-bold">
                      <Crown className="w-3.5 h-3.5" />
                      <span>Owner</span>
                    </div>
                    <ul className="text-[11px] text-gray-300 space-y-1 list-disc pl-3.5 leading-tight">
                      <li>Full CAD & 3D BIM editing</li>
                      <li>AI Copilot floor plan synthesis</li>
                      <li>Manage all user roles & permissions</li>
                      <li>Load templates & commit cloud revisions</li>
                      <li>Export OBJ, DXF, SVG, and JSON</li>
                    </ul>
                  </div>

                  {/* Editor */}
                  <div className="p-2.5 rounded bg-[#1E1E1E] border border-blue-500/30 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-blue-300 font-bold">
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editor</span>
                    </div>
                    <ul className="text-[11px] text-gray-300 space-y-1 list-disc pl-3.5 leading-tight">
                      <li>Draw & edit walls, doors, windows, fixtures</li>
                      <li>Prompt AgentSam AI Copilot</li>
                      <li>Upload & parse sketches to CAD</li>
                      <li>Load design templates</li>
                      <li>Export CAD files & media</li>
                    </ul>
                  </div>

                  {/* Viewer */}
                  <div className="p-2.5 rounded bg-[#1E1E1E] border border-purple-500/30 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-purple-300 font-bold">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Viewer (Read-Only)</span>
                    </div>
                    <ul className="text-[11px] text-gray-300 space-y-1 list-disc pl-3.5 leading-tight">
                      <li>Pan & zoom 2D floor plans</li>
                      <li>Orbit & first-person walk 3D BIM</li>
                      <li>Inspect measurements & properties</li>
                      <li>View live collaborator cursors</li>
                      <li>Export CAD drawing files</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TEMPLATE LIBRARY */}
          {activeTab === 'templates' && (
            <div className="space-y-3.5">
              {/* Category Filter bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-1.5 overflow-x-auto">
                  {[
                    { id: 'all', label: 'All Use Cases' },
                    { id: 'architecture', label: 'Residential' },
                    { id: 'commercial', label: 'Office & Co-Working' },
                    { id: 'presentations', label: 'Presentations & Expo' },
                    { id: 'brand', label: 'Brand & Logos' },
                    { id: 'social_media', label: 'Social & Creator' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedTemplateCat(cat.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                        selectedTemplateCat === cat.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#252525] text-gray-400 hover:text-white border border-[#333]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {onOpenTemplateLibrary && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTemplateLibrary();
                    }}
                    className="text-xs text-blue-400 hover:underline flex items-center space-x-1 font-medium"
                  >
                    <span>Open Fullscreen Template Browser</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Grid of Templates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-3.5 rounded bg-[#252525] border border-[#333] hover:border-blue-500/50 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1E1E1E] text-blue-400 border border-[#333]">
                          {tpl.categoryLabel}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">{tpl.dimensions}</span>
                      </div>
                      <h3 className="text-xs font-bold text-white mb-1">{tpl.name}</h3>
                      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">{tpl.description}</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#333]">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                        <span>{tpl.project.walls.length} Walls • {tpl.project.rooms.length} Rooms • {tpl.project.furniture.length} Fixtures</span>
                      </div>
                      {!permissions.canLoadTemplates ? (
                        <button
                          disabled
                          className="w-full py-1.5 bg-[#1E1E1E] text-gray-500 border border-[#333] rounded text-xs font-medium cursor-not-allowed flex items-center justify-center space-x-1"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Viewer Mode (Read-Only)</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTemplateSelect(tpl)}
                          className="w-full py-1.5 bg-[#1E1E1E] hover:bg-blue-600 border border-[#333] text-white rounded text-xs font-medium transition"
                        >
                          Load Template & Sync
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CLOUD REVISIONS */}
          {activeTab === 'revisions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Save current project snapshot to cloud revisions:</span>
                {permissions.canSaveRevisions ? (
                  <button
                    onClick={handleSaveToCloud}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center space-x-1.5 transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Revision</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-purple-400 font-mono">Viewer (Read-Only)</span>
                )}
              </div>

              <div className="space-y-1.5">
                {savedProjects.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500 bg-[#252525] rounded border border-[#333]">
                    No cloud snapshots saved yet. Click "Save Revision" to store a restore point.
                  </div>
                ) : (
                  savedProjects.map((p) => (
                    <div key={p.id} className="p-2.5 rounded bg-[#252525] border border-[#333] flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-white">{p.name}</h4>
                        <span className="text-[10px] text-gray-400 font-mono">{p.date}</span>
                      </div>
                      {permissions.canSaveRevisions ? (
                        <button
                          onClick={() => {
                            onLoadProject(p.state);
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-[#1E1E1E] hover:bg-[#333] border border-[#333] text-gray-200 rounded text-xs font-medium transition"
                        >
                          Restore
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-500 font-mono">Restricted</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CAD EXPORT */}
          {activeTab === 'export' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded bg-[#252525] border border-[#333] space-y-1.5">
                <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>3D Wavefront OBJ (.obj)</span>
                </h4>
                <p className="text-[11px] text-gray-400">Compatible with Blender, Rhino, AutoCAD, Revit, 3ds Max</p>
                <button
                  onClick={() => downloadFile(exportToOBJ(project), `${project.name || 'Plan'}.obj`, 'text/plain')}
                  className="w-full py-1.5 bg-[#1E1E1E] hover:bg-[#333] border border-[#333] text-white rounded text-xs font-medium transition mt-1"
                >
                  Download .OBJ
                </button>
              </div>

              <div className="p-3.5 rounded bg-[#252525] border border-[#333] space-y-1.5">
                <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>AutoCAD DXF (.dxf)</span>
                </h4>
                <p className="text-[11px] text-gray-400">Standard 2D architectural drawing exchange format</p>
                <button
                  onClick={() => downloadFile(exportToDXF(project), `${project.name || 'Plan'}.dxf`, 'application/dxf')}
                  className="w-full py-1.5 bg-[#1E1E1E] hover:bg-[#333] border border-[#333] text-white rounded text-xs font-medium transition mt-1"
                >
                  Download .DXF
                </button>
              </div>

              <div className="p-3.5 rounded bg-[#252525] border border-[#333] space-y-1.5">
                <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>Vector Architectural SVG (.svg)</span>
                </h4>
                <p className="text-[11px] text-gray-400">High-resolution vector blueprints with door arcs & tags</p>
                <button
                  onClick={() => downloadFile(exportToSVG(project), `${project.name || 'Plan'}.svg`, 'image/svg+xml')}
                  className="w-full py-1.5 bg-[#1E1E1E] hover:bg-[#333] border border-[#333] text-white rounded text-xs font-medium transition mt-1"
                >
                  Download .SVG
                </button>
              </div>

              <div className="p-3.5 rounded bg-[#252525] border border-[#333] space-y-1.5">
                <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>AgentSam Studio JSON (.json)</span>
                </h4>
                <p className="text-[11px] text-gray-400">Complete parametric BIM project state and materials</p>
                <button
                  onClick={() => downloadFile(JSON.stringify(project, null, 2), `${project.name || 'Plan'}.json`, 'application/json')}
                  className="w-full py-1.5 bg-[#1E1E1E] hover:bg-[#333] border border-[#333] text-white rounded text-xs font-medium transition mt-1"
                >
                  Download .JSON
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
