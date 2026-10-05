/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UtilitiesSurface: App-native /widgets Utilities surface for Local Studio.
 * Directly consumes packaged widgets with real layout persistence, size classes,
 * hidden widget recovery shelf, and instant undo toasts.
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  Boxes,
  RotateCcw,
  Sparkles,
  Plus,
  Eye,
  EyeOff,
  SlidersHorizontal,
  CheckCircle2,
  Trash2,
  X
} from 'lucide-react';
import { useTheme } from '@inneranimalmedia/agentsam-themes';
import { useWidgetStore } from '../packages/workbench/widgetStore';
import { WIDGET_TAXONOMY, WIDGET_REGISTRY } from '../packages/contracts/widgets';
import { WidgetSizeClass } from '../packages/contracts/widgets/database';
import { haptics } from '../packages/workbench/haptics';
import {
  CountdownWidget,
  ClockWidget,
  CalculatorWidget,
  QuickControlsWidget,
  GlanceMetricsWidget,
  GlanceJobsWidget,
  GlanceQueuesWidget,
  RuntimeStateWidget,
  CloudflareObservabilityWidget,
  GitHubActivityWidget,
  LauncherWidget,
  RecentItemsWidget,
  ShortcutsWidget,
  ContentListWidget,
  ContentMediaWidget,
  ArtifactPreviewWidget,
  ActiveRunWidget,
  TokenCostWidget,
  QueueStatusWidget,
  ApprovalsWidget,
  TaskProgressWidget,
  WeatherAgentWidget
} from '../packages/workbench/widgets';
import { QuickControlsState } from '@inneranimalmedia/agentsam-contracts/widgets';

export interface UtilitiesSurfaceProps {
  controls: QuickControlsState;
  onControlsChange: (updated: Partial<QuickControlsState>) => void;
  onRunWeatherQuery?: (query: string) => void;
  onOpenWidgetLibrary: () => void;
  onOpenThemeSelector: () => void;
}

export const UtilitiesSurface: React.FC<UtilitiesSurfaceProps> = ({
  controls,
  onControlsChange,
  onRunWeatherQuery,
  onOpenWidgetLibrary,
  onOpenThemeSelector
}) => {
  const { activeTheme } = useTheme();
  const {
    layouts,
    hiddenWidgetIds,
    isEditMode,
    toggleEditMode,
    setWidgetSize,
    moveWidgetUp,
    moveWidgetDown,
    hideWidget,
    restoreWidget,
    removeWidget,
    lastRemovedWidget,
    undoLastRemove,
    clearUndo
  } = useWidgetStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHiddenShelf, setShowHiddenShelf] = useState(false);

  const CATEGORIES = [
    { id: 'all', label: 'All Active', count: layouts.filter(l => !hiddenWidgetIds.includes(l.widget_id)).length },
    { id: 'utility', label: 'Utility', count: 4 },
    { id: 'glance', label: 'Glance', count: 6 },
    { id: 'navigation', label: 'Navigation', count: 3 },
    { id: 'content', label: 'Content', count: 3 },
    { id: 'agent/runtime', label: 'Agent / Runtime', count: 5 },
    { id: 'weather', label: 'Weather Agent', count: 1 },
  ];

  // Visible active layouts (not hidden)
  const activeLayouts = useMemo(() => {
    return layouts
      .filter((l) => !hiddenWidgetIds.includes(l.widget_id))
      .filter((l) => {
        const def = WIDGET_REGISTRY[l.widget_id];
        if (!def) return false;
        const matchesCat = selectedCategory === 'all' || def.category === selectedCategory;
        const matchesSearch = !searchQuery.trim() ||
          def.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          def.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          def.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCat && matchesSearch;
      });
  }, [layouts, hiddenWidgetIds, selectedCategory, searchQuery]);

  const renderWidget = (widgetId: string, sizeClass: WidgetSizeClass) => {
    const isEditing = isEditMode;
    const baseProps = {
      sizeClass,
      isEditing,
      onSizeChange: (s: WidgetSizeClass) => setWidgetSize(widgetId, s),
      onHide: () => hideWidget(widgetId),
      onRemove: () => removeWidget(widgetId),
      onMoveUp: () => moveWidgetUp(widgetId),
      onMoveDown: () => moveWidgetDown(widgetId),
      onOpenFullApp: () => {
        if (widgetId === 'weather-dashboard-agent') onRunWeatherQuery?.('Current weather in New York');
      }
    };

    switch (widgetId) {
      // Utility
      case 'countdown':
        return <CountdownWidget key={widgetId} {...baseProps} />;
      case 'clock':
        return <ClockWidget key={widgetId} {...baseProps} />;
      case 'calculator':
        return <CalculatorWidget key={widgetId} {...baseProps} />;
      case 'quick-controls':
        return <QuickControlsWidget key={widgetId} controls={controls} onChange={onControlsChange} {...baseProps} />;

      // Glance
      case 'metrics':
        return <GlanceMetricsWidget key={widgetId} {...baseProps} />;
      case 'jobs':
        return <GlanceJobsWidget key={widgetId} {...baseProps} />;
      case 'queues':
        return <GlanceQueuesWidget key={widgetId} {...baseProps} />;
      case 'runtime-state':
        return <RuntimeStateWidget key={widgetId} {...baseProps} />;
      case 'cloudflare-observability':
        return <CloudflareObservabilityWidget key={widgetId} {...baseProps} />;
      case 'github-activity':
        return <GitHubActivityWidget key={widgetId} {...baseProps} />;

      // Navigation
      case 'launcher':
        return <LauncherWidget key={widgetId} onExecuteCommand={onRunWeatherQuery} {...baseProps} />;
      case 'recent-items':
        return <RecentItemsWidget key={widgetId} onSelectQuery={onRunWeatherQuery} {...baseProps} />;
      case 'shortcuts':
        return <ShortcutsWidget key={widgetId} {...baseProps} />;

      // Content
      case 'list':
        return <ContentListWidget key={widgetId} {...baseProps} />;
      case 'media':
        return <ContentMediaWidget key={widgetId} {...baseProps} />;
      case 'artifact-preview':
        return <ArtifactPreviewWidget key={widgetId} {...baseProps} />;

      // Agent / Runtime
      case 'active-run':
        return <ActiveRunWidget key={widgetId} {...baseProps} />;
      case 'token-cost-glance':
        return <TokenCostWidget key={widgetId} {...baseProps} />;
      case 'queue-status':
        return <QueueStatusWidget key={widgetId} {...baseProps} />;
      case 'approvals':
        return <ApprovalsWidget key={widgetId} {...baseProps} />;
      case 'task-progress':
        return <TaskProgressWidget key={widgetId} {...baseProps} />;

      // Weather
      case 'weather-dashboard-agent':
        return <WeatherAgentWidget key={widgetId} {...baseProps} />;

      default:
        return null;
    }
  };

  const getSizeGridClasses = (sizeClass: WidgetSizeClass, widgetId: string) => {
    if (widgetId === 'weather-dashboard-agent' || sizeClass === 'Full') {
      return 'col-span-1 md:col-span-2 lg:col-span-3';
    }
    if (sizeClass === 'XL') {
      return 'col-span-1 md:col-span-2 lg:col-span-3';
    }
    if (sizeClass === 'L') {
      return 'col-span-1 md:col-span-2';
    }
    return 'col-span-1';
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24">
      {/* Floating Undo Banner */}
      {lastRemovedWidget && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-4 py-2.5 rounded-2xl bg-black/85 border border-white/20 text-white text-xs shadow-2xl flex items-center gap-3 backdrop-blur-xl">
            <span>Widget removed from canvas</span>
            <button
              onClick={() => {
                haptics.selection();
                undoLastRemove();
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Undo
            </button>
            <button
              onClick={() => clearUndo()}
              className="text-white/50 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Control Surface & Filter Bar */}
      <div
        className="p-5 rounded-[24px] border"
        style={{
          background: activeTheme.glass.cardFill,
          backdropFilter: 'blur(36px)',
          borderColor: activeTheme.glass.cardBorder,
          boxShadow: activeTheme.glass.cardShadow
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Local Studio /widgets Surface
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                {activeLayouts.length} Active
              </span>
            </div>
            <p className="text-xs text-white/60 mt-1">
              App-native utility surface with physical touch interactions, size classes, and absolute deadline resilience.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                haptics.selection();
                toggleEditMode();
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isEditMode
                  ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-400/50'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isEditMode ? 'Done Editing' : 'Customize Canvas'}</span>
            </button>

            <button
              onClick={() => {
                haptics.selection();
                onOpenWidgetLibrary();
              }}
              className="px-3.5 py-2 rounded-xl bg-white text-slate-900 hover:bg-white/90 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Add Widget</span>
            </button>
          </div>
        </div>

        {/* Search & Category Filter Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-white/5">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  haptics.selection();
                  setSelectedCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`text-[10px] font-mono ${selectedCategory === cat.id ? 'text-slate-500' : 'text-white/40'}`}>
                  {cat.count}
                </span>
              </button>
            ))}

            {hiddenWidgetIds.length > 0 && (
              <button
                onClick={() => {
                  haptics.selection();
                  setShowHiddenShelf(!showHiddenShelf);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-mono transition-colors flex items-center gap-1 ${
                  showHiddenShelf ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-white/50 hover:text-white'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>{hiddenWidgetIds.length} Hidden</span>
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active widgets..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>

        {/* Hidden Widgets Recovery Shelf */}
        {showHiddenShelf && hiddenWidgetIds.length > 0 && (
          <div className="mt-3 p-3 rounded-2xl bg-black/40 border border-amber-500/20 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs text-amber-300 font-medium mb-2">
              <span className="flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5" /> Hidden Widgets Shelf
              </span>
              <button
                onClick={() => {
                  hiddenWidgetIds.forEach((id) => restoreWidget(id));
                }}
                className="text-[11px] underline hover:text-white"
              >
                Restore All
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hiddenWidgetIds.map((id) => {
                const def = WIDGET_REGISTRY[id];
                return (
                  <button
                    key={id}
                    onClick={() => restoreWidget(id)}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
                  >
                    <span>{def?.title || id}</span>
                    <RotateCcw className="w-3 h-3 text-sky-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Responsive Widget Grid with Size Classes */}
      {activeLayouts.length === 0 ? (
        <div className="p-12 text-center rounded-[24px] bg-black/20 border border-white/10 text-white/50 space-y-2">
          <p className="text-sm font-medium text-white/70">No widgets in this view</p>
          <button
            onClick={() => onOpenWidgetLibrary()}
            className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors"
          >
            Add Widget from Catalog
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          {activeLayouts.map((layout) => (
            <div
              key={layout.widget_id}
              className={`transition-all duration-300 ${getSizeGridClasses(layout.size_class, layout.widget_id)}`}
            >
              {renderWidget(layout.widget_id, layout.size_class)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
