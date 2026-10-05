/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AddWidgetSheet: Product-grade widget library, search, preview, and layout manager sheet.
 * Supports iOS-style previewing in size classes (S/M/L), instant install, and hidden widget restoration.
 */

import React, { useState } from 'react';
import { 
  X, 
  Search, 
  Plus, 
  Check, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useTheme } from '@inneranimalmedia/agentsam-themes';
import { useWidgetStore, INITIAL_WIDGET_CATALOG } from '../packages/workbench/widgetStore';
import { WIDGET_TAXONOMY, WidgetCategory } from '../packages/contracts/widgets';
import { WidgetSizeClass } from '../packages/contracts/widgets/database';
import { haptics } from '../packages/workbench/haptics';

export interface AddWidgetSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddWidgetSheet: React.FC<AddWidgetSheetProps> = ({ isOpen, onClose }) => {
  const { activeTheme } = useTheme();
  const { layouts, hiddenWidgetIds, addWidget, restoreWidget, removeWidget } = useWidgetStore();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>('countdown');
  const [selectedSize, setSelectedSize] = useState<WidgetSizeClass>('M');

  if (!isOpen) return null;

  const installedWidgetIds = layouts.map((l) => l.widget_id);

  const filteredCatalog = INITIAL_WIDGET_CATALOG.filter((w) => {
    const matchesCat = activeCategory === 'all' || w.category === activeCategory;
    const matchesSearch = !searchQuery.trim() || 
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const selectedDef = INITIAL_WIDGET_CATALOG.find((w) => w.id === selectedWidgetId) || INITIAL_WIDGET_CATALOG[0];
  const isInstalled = installedWidgetIds.includes(selectedDef.id);
  const isHidden = hiddenWidgetIds.includes(selectedDef.id);

  const handleAdd = () => {
    addWidget(selectedDef.id, selectedSize);
    haptics.success();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-[880px] max-h-[90vh] rounded-[28px] border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        style={{
          background: activeTheme.glass.cardFill,
          backdropFilter: 'blur(40px)',
          borderColor: activeTheme.glass.cardBorder,
          boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.65)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                Widget Library & Catalog
              </h2>
              <p className="text-xs text-white/50">
                Browse, preview, and place packaged widgets into your AgentSam canvas.
              </p>
            </div>
          </div>

          <button
            onClick={() => { haptics.selection(); onClose(); }}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 no-scrollbar">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === 'all' ? 'bg-white text-slate-900 font-semibold' : 'text-white/60 hover:text-white'
              }`}
            >
              All ({INITIAL_WIDGET_CATALOG.length})
            </button>
            {Object.entries(WIDGET_TAXONOMY).map(([catKey, catVal]) => (
              <button
                key={catKey}
                onClick={() => setActiveCategory(catKey)}
                className={`px-3 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-colors capitalize ${
                  activeCategory === catKey ? 'bg-white text-slate-900 font-semibold' : 'text-white/60 hover:text-white'
                }`}
              >
                {catVal.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-60 shrink-0">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search catalog..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>

        {/* 2-Column Split: Catalog List on Left, Interactive Preview on Right */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left: Scrollable Catalog List */}
          <div className="md:col-span-7 p-4 overflow-y-auto space-y-2 border-r border-white/5 max-h-[500px]">
            {filteredCatalog.map((widget) => {
              const installed = installedWidgetIds.includes(widget.id);
              const hidden = hiddenWidgetIds.includes(widget.id);
              const isSelected = selectedWidgetId === widget.id;

              return (
                <div
                  key={widget.id}
                  onClick={() => {
                    haptics.selection();
                    setSelectedWidgetId(widget.id);
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-white/15 border-white/40 shadow-md'
                      : 'bg-white/5 hover:bg-white/10 border-white/5'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {widget.name}
                      </span>
                      <span className="text-[10px] text-white/40 font-mono capitalize">
                        {widget.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 truncate mt-0.5">
                      {widget.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hidden ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        Hidden
                      </span>
                    ) : installed ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Placed
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addWidget(widget.id, 'M');
                        }}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white transition-colors"
                        title="Add to canvas"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Widget Preview & Placement Actions */}
          <div className="md:col-span-5 p-6 flex flex-col justify-between overflow-y-auto max-h-[500px] bg-black/15">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider">
                  PREVIEW & CONFIGURATION
                </span>
                <h3 className="text-lg font-bold text-white mt-1">
                  {selectedDef.name}
                </h3>
                <p className="text-xs text-white/70 leading-relaxed mt-1">
                  {selectedDef.description}
                </p>
              </div>

              {/* Supported Size Classes Picker */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono text-white/50">CHOOSE SIZE CLASS:</span>
                <div className="grid grid-cols-4 gap-1 bg-white/5 p-1 rounded-xl">
                  {(['S', 'M', 'L', 'XL'] as WidgetSizeClass[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        haptics.selection();
                        setSelectedSize(size);
                      }}
                      className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                        selectedSize === size
                          ? 'bg-white text-slate-900 font-bold shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-white/40 mt-1">
                  {selectedSize === 'S' && 'Small (1×1): Compact icon or glance status'}
                  {selectedSize === 'M' && 'Medium (2×1): Standard utility and summary cards'}
                  {selectedSize === 'L' && 'Large (2×2): Interactive charts and controls'}
                  {selectedSize === 'XL' && 'Extra Large (Full width): Complex pipelines & agents'}
                </div>
              </div>

              {/* Tags */}
              <div className="pt-2">
                <div className="text-[10px] font-mono text-white/40 mb-1">CAPABILITIES:</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedDef.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono text-white/60">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-6 border-t border-white/10 space-y-2">
              {isHidden ? (
                <button
                  onClick={() => restoreWidget(selectedDef.id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restore Hidden Widget</span>
                </button>
              ) : isInstalled ? (
                <button
                  onClick={() => removeWidget(selectedDef.id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/20 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Remove from Canvas</span>
                </button>
              ) : (
                <button
                  onClick={handleAdd}
                  className="w-full py-2.5 px-4 rounded-xl bg-white text-slate-900 hover:bg-white/90 text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Add to Canvas ({selectedSize})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
