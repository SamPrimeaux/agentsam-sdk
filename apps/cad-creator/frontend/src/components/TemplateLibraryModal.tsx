import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Search, 
  X, 
  Layers, 
  Building2, 
  Briefcase, 
  Presentation, 
  BadgePercent, 
  Video, 
  ArrowRight,
  Maximize2,
  Box,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { ProjectState, UserRole } from '@inneranimalmedia/agentsam-cad-shared';
import { TEMPLATE_METADATA_LIST, TemplateMetadata } from '../lib/templates';
import { getPermissions } from '../lib/permissions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (project: ProjectState) => void;
  userRole?: UserRole;
  currentRole?: UserRole;
}

export const TemplateLibraryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  userRole,
  currentRole,
}) => {
  const effectiveRole = userRole || currentRole || 'Editor';
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(TEMPLATE_METADATA_LIST[0].id);

  const permissions = getPermissions(effectiveRole);

  const filteredTemplates = useMemo(() => {
    return TEMPLATE_METADATA_LIST.filter((tpl) => {
      const matchesCategory = selectedCategory === 'all' || tpl.category === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesCategory;

      const matchesSearch = 
        tpl.name.toLowerCase().includes(query) ||
        tpl.description.toLowerCase().includes(query) ||
        tpl.useCase.toLowerCase().includes(query) ||
        tpl.tags.some(t => t.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const activeTemplate = useMemo(() => {
    return TEMPLATE_METADATA_LIST.find((t) => t.id === selectedTemplateId) || filteredTemplates[0] || TEMPLATE_METADATA_LIST[0];
  }, [selectedTemplateId, filteredTemplates]);

  if (!isOpen) return null;

  const handleApply = (tpl: TemplateMetadata) => {
    if (!permissions.canLoadTemplates) return;
    // Clone template state with fresh ID and current timestamp
    const cloned: ProjectState = {
      ...tpl.project,
      id: `proj_${Date.now()}`,
      updatedAt: Date.now(),
      version: 1,
    };
    onSelectTemplate(cloned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 md:p-6 select-none">
      <div className="bg-[#252525] border border-[#333] rounded w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-3.5 border-b border-[#333] flex items-center justify-between bg-[#252525] shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white">AgentSam Studio Template Library</h2>
                <span className="px-1.5 py-0.2 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded text-[10px] font-mono">
                  Parametric BIM & Spatial Sets
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Explore pre-built 2D/3D layouts for architecture, corporate workplaces, presentations, brand showrooms & social media
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div className="p-3 border-b border-[#333] bg-[#1E1E1E] flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          {/* Categories */}
          <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All Templates', icon: Layers },
              { id: 'architecture', label: 'Residential', icon: Building2 },
              { id: 'commercial', label: 'Office & Co-Working', icon: Briefcase },
              { id: 'presentations', label: 'Presentations & Expo', icon: Presentation },
              { id: 'brand', label: 'Brand & Logos', icon: BadgePercent },
              { id: 'social_media', label: 'Social & Creator', icon: Video },
            ].map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5 whitespace-nowrap transition ${
                    selectedCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-[#252525] text-gray-400 hover:text-gray-200 border border-[#333]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates, tags..."
              className="w-full bg-[#252525] border border-[#333] rounded pl-8 pr-3 py-1 text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-gray-500"
            />
          </div>
        </div>

        {/* Main Body: Master-Detail Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Grid: Template Cards List */}
          <div className="w-full md:w-3/5 overflow-y-auto p-3.5 space-y-2.5 border-r border-[#333] bg-[#1E1E1E]">
            {filteredTemplates.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-xs">
                No templates matched "{searchQuery}". Try selecting another category or clear your search query.
              </div>
            ) : (
              filteredTemplates.map((tpl) => {
                const isSelected = activeTemplate.id === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`p-3 rounded border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#252525] border-blue-500 shadow-md ring-1 ring-blue-500/30'
                        : 'bg-[#252525] border-[#333] hover:border-[#444] hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1E1E1E] text-blue-400 border border-[#333]">
                          {tpl.categoryLabel}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">{tpl.dimensions}</span>
                      </div>
                      <h3 className="text-xs font-bold text-white mb-1 flex items-center justify-between">
                        <span>{tpl.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                      </h3>
                      <p className="text-[11px] text-gray-400 line-clamp-2 mb-2">{tpl.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#333] text-[10px] text-gray-400">
                      <div className="flex items-center space-x-2 font-mono">
                        <span>{tpl.project.walls.length} walls</span>
                        <span>•</span>
                        <span>{tpl.project.rooms.length} zones</span>
                        <span>•</span>
                        <span>{tpl.project.furniture.length} fixtures</span>
                      </div>
                      <div className="flex space-x-1">
                        {tpl.tags.slice(0, 2).map((t, idx) => (
                          <span key={idx} className="text-gray-500">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Detail: Full Template Inspector & Preview */}
          <div className="hidden md:flex w-2/5 flex-col bg-[#252525] overflow-y-auto p-4 justify-between">
            {activeTemplate ? (
              <div className="space-y-4">
                {/* Visual Header */}
                <div>
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-blue-600/20 text-blue-300 border border-blue-500/40 font-mono">
                      {activeTemplate.categoryLabel}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                      <span>Cloud Synced Template</span>
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{activeTemplate.name}</h3>
                  <p className="text-xs text-gray-300 font-medium">{activeTemplate.useCase}</p>
                </div>

                {/* Blueprint Mini Schematic Card */}
                <div className="p-3 rounded bg-[#1E1E1E] border border-[#333] space-y-2">
                  <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Spatial Schematic</span>
                    <span className="text-blue-400">2D & 3D BIM Ready</span>
                  </div>

                  {/* SVG Blueprint Mini Diagram */}
                  <div className="h-32 w-full bg-[#161616] border border-[#2e2e2e] rounded flex items-center justify-center relative overflow-hidden">
                    <svg className="w-full h-full p-2" viewBox="-20 -20 440 340">
                      {/* Grid Pattern */}
                      <defs>
                        <pattern id="tpl_grid" width="24" height="24" patternUnits="userSpaceOnUse">
                          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#252525" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect x="-20" y="-20" width="440" height="340" fill="url(#tpl_grid)" />

                      {/* Rooms */}
                      {activeTemplate.project.rooms.map((r, i) => {
                        const pathD = r.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ') + ' Z';
                        return (
                          <path
                            key={i}
                            d={pathD}
                            fill={r.color || '#3b82f6'}
                            fillOpacity="0.25"
                            stroke="#3b82f6"
                            strokeWidth="1"
                            strokeDasharray="2,2"
                          />
                        );
                      })}

                      {/* Walls */}
                      {activeTemplate.project.walls.map((w, i) => (
                        <line
                          key={i}
                          x1={w.x1}
                          y1={w.y1}
                          x2={w.x2}
                          y2={w.y2}
                          stroke={w.exterior ? '#ffffff' : '#94a3b8'}
                          strokeWidth={w.thickness || 6}
                          strokeLinecap="round"
                        />
                      ))}

                      {/* Furniture */}
                      {activeTemplate.project.furniture.map((f, i) => (
                        <rect
                          key={i}
                          x={f.x - f.w / 2}
                          y={f.y - f.d / 2}
                          width={f.w}
                          height={f.d}
                          fill={f.color || '#475569'}
                          stroke="#cbd5e1"
                          strokeWidth="1"
                          rx="2"
                        />
                      ))}
                    </svg>
                  </div>
                </div>

                {/* Spatial Specs Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-[#1E1E1E] border border-[#333]">
                    <span className="text-[10px] text-gray-500 font-mono block">Footprint Area</span>
                    <span className="font-semibold text-white font-mono">{activeTemplate.dimensions}</span>
                  </div>
                  <div className="p-2 rounded bg-[#1E1E1E] border border-[#333]">
                    <span className="text-[10px] text-gray-500 font-mono block">Ceiling Height</span>
                    <span className="font-semibold text-white font-mono">{activeTemplate.project.ceilingHeight}" (9' 0")</span>
                  </div>
                  <div className="p-2 rounded bg-[#1E1E1E] border border-[#333]">
                    <span className="text-[10px] text-gray-500 font-mono block">Walls / Partitions</span>
                    <span className="font-semibold text-white font-mono">{activeTemplate.project.walls.length} elements</span>
                  </div>
                  <div className="p-2 rounded bg-[#1E1E1E] border border-[#333]">
                    <span className="text-[10px] text-gray-500 font-mono block">Fixtures & Decor</span>
                    <span className="font-semibold text-white font-mono">{activeTemplate.project.furniture.length} items</span>
                  </div>
                </div>

                {/* Description & Tags */}
                <div>
                  <p className="text-[11px] text-gray-400 leading-relaxed mb-2.5">
                    {activeTemplate.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeTemplate.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1E1E] text-blue-400 border border-[#333]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Action Button */}
            <div className="pt-4 border-t border-[#333] space-y-2">
              {!permissions.canLoadTemplates ? (
                <div className="p-2 rounded bg-purple-950/40 border border-purple-800/50 flex items-center space-x-2 text-xs text-purple-300">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Viewer mode active. Only Owners and Editors can load new templates.</span>
                </div>
              ) : (
                <button
                  onClick={() => activeTemplate && handleApply(activeTemplate)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Start Editing This Template</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
