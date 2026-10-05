/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WidgetStore: Centralized reactive store managing widget lifecycle,
 * layout placements, size classes, dock state, and undo history.
 */

import { useState, useEffect } from 'react';
import {
  AgentSamWidgetCatalogRecord,
  UserWidgetInstallRecord,
  UserWidgetLayoutRecord,
  WidgetSizeClass,
  SurfaceType
} from '../contracts/widgets/database';
import { WIDGET_REGISTRY } from '../contracts/widgets';
import { haptics } from './haptics';

// Seed master catalog from WIDGET_REGISTRY
export const INITIAL_WIDGET_CATALOG: AgentSamWidgetCatalogRecord[] = Object.values(WIDGET_REGISTRY).map((w) => ({
  id: w.id,
  slug: w.id,
  name: w.title,
  description: w.description,
  category: w.category,
  icon: w.iconName,
  version: w.version,
  status: 'stable',
  default_size: (w.defaultSize === 'sm' ? 'S' : w.defaultSize === 'md' ? 'M' : w.defaultSize === 'lg' ? 'L' : 'Full') as WidgetSizeClass,
  supported_sizes: ['S', 'M', 'L', 'XL'],
  tags: w.tags,
  package_name: '@inneranimalmedia/agentsam-workbench/widgets',
  component_key: w.id,
  data_source_kind: w.category === 'weather' ? 'open_meteo' : w.category === 'glance' ? 'telemetry' : 'local',
  is_public: true,
  is_builtin: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z'
}));

// Initial default active layout
const DEFAULT_LAYOUT_ITEMS: Array<{ widgetId: string; size: WidgetSizeClass; pinned?: boolean; isDocked?: boolean }> = [
  { widgetId: 'countdown', size: 'M', pinned: true, isDocked: true },
  { widgetId: 'weather-dashboard-agent', size: 'Full', pinned: true, isDocked: true },
  { widgetId: 'quick-controls', size: 'M', pinned: true, isDocked: true },
  { widgetId: 'clock', size: 'S', isDocked: true },
  { widgetId: 'calculator', size: 'M', isDocked: true },
  { widgetId: 'metrics', size: 'M', isDocked: true },
  { widgetId: 'active-run', size: 'L', pinned: true, isDocked: true },
  { widgetId: 'token-cost-glance', size: 'S', isDocked: true },
  { widgetId: 'approvals', size: 'M', isDocked: true },
  { widgetId: 'launcher', size: 'M' },
  { widgetId: 'jobs', size: 'M' },
  { widgetId: 'queues', size: 'M' },
  { widgetId: 'runtime-state', size: 'S' },
  { widgetId: 'recent-items', size: 'S' },
  { widgetId: 'shortcuts', size: 'S' },
  { widgetId: 'list', size: 'M' },
  { widgetId: 'media', size: 'M' },
  { widgetId: 'artifact-preview', size: 'L' },
  { widgetId: 'task-progress', size: 'M' },
];

export interface WidgetStoreState {
  layouts: UserWidgetLayoutRecord[];
  hiddenWidgetIds: string[];
  lastRemovedWidget: { layout: UserWidgetLayoutRecord; index: number } | null;
  isEditMode: boolean;
  dockedWidgetIds: string[];
}

const STORAGE_KEY = 'agentsam_widget_store_state_v2';

export class WidgetStore {
  private state: WidgetStoreState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): WidgetStoreState {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}

    // Initialize default layout records
    const layouts: UserWidgetLayoutRecord[] = DEFAULT_LAYOUT_ITEMS.map((item, idx) => ({
      id: `layout-${item.widgetId}`,
      user_id: 'user-default',
      surface: 'widgets_home',
      widget_install_id: `inst-${item.widgetId}`,
      widget_id: item.widgetId,
      breakpoint: 'desktop',
      size_class: item.size,
      order_index: idx,
      is_docked: !!item.isDocked,
      collapsed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const dockedWidgetIds = DEFAULT_LAYOUT_ITEMS.filter((i) => i.isDocked).map((i) => i.widgetId);

    return {
      layouts,
      hiddenWidgetIds: [],
      lastRemovedWidget: null,
      isEditMode: false,
      dockedWidgetIds
    };
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {}
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): WidgetStoreState {
    return this.state;
  }

  public toggleEditMode(enabled?: boolean) {
    const next = enabled !== undefined ? enabled : !this.state.isEditMode;
    this.state.isEditMode = next;
    haptics.selection();
    this.persist();
  }

  public setWidgetSize(widgetId: string, sizeClass: WidgetSizeClass) {
    this.state.layouts = this.state.layouts.map((l) =>
      l.widget_id === widgetId ? { ...l, size_class: sizeClass, updated_at: new Date().toISOString() } : l
    );
    haptics.impact('light');
    this.persist();
  }

  public reorderWidget(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= this.state.layouts.length || toIndex >= this.state.layouts.length) {
      return;
    }
    const updated = [...this.state.layouts];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    // Re-index
    this.state.layouts = updated.map((l, idx) => ({ ...l, order_index: idx }));
    haptics.impact('medium');
    this.persist();
  }

  public moveWidgetUp(widgetId: string) {
    const idx = this.state.layouts.findIndex((l) => l.widget_id === widgetId);
    if (idx > 0) {
      this.reorderWidget(idx, idx - 1);
    }
  }

  public moveWidgetDown(widgetId: string) {
    const idx = this.state.layouts.findIndex((l) => l.widget_id === widgetId);
    if (idx !== -1 && idx < this.state.layouts.length - 1) {
      this.reorderWidget(idx, idx + 1);
    }
  }

  public hideWidget(widgetId: string) {
    if (!this.state.hiddenWidgetIds.includes(widgetId)) {
      this.state.hiddenWidgetIds.push(widgetId);
      haptics.success();
      this.persist();
    }
  }

  public restoreWidget(widgetId: string) {
    this.state.hiddenWidgetIds = this.state.hiddenWidgetIds.filter((id) => id !== widgetId);
    haptics.selection();
    this.persist();
  }

  public removeWidget(widgetId: string) {
    const idx = this.state.layouts.findIndex((l) => l.widget_id === widgetId);
    if (idx !== -1) {
      const removed = this.state.layouts[idx];
      this.state.lastRemovedWidget = { layout: removed, index: idx };
      this.state.layouts = this.state.layouts.filter((l) => l.widget_id !== widgetId);
      this.state.dockedWidgetIds = this.state.dockedWidgetIds.filter((id) => id !== widgetId);
      haptics.success();
      this.persist();
    }
  }

  public undoLastRemove() {
    if (this.state.lastRemovedWidget) {
      const { layout, index } = this.state.lastRemovedWidget;
      const updated = [...this.state.layouts];
      updated.splice(Math.min(index, updated.length), 0, layout);
      this.state.layouts = updated.map((l, idx) => ({ ...l, order_index: idx }));
      this.state.lastRemovedWidget = null;
      haptics.selection();
      this.persist();
    }
  }

  public clearUndo() {
    this.state.lastRemovedWidget = null;
    this.notify();
  }

  public toggleDocked(widgetId: string) {
    const isDocked = this.state.dockedWidgetIds.includes(widgetId);
    if (isDocked) {
      this.state.dockedWidgetIds = this.state.dockedWidgetIds.filter((id) => id !== widgetId);
    } else {
      this.state.dockedWidgetIds.push(widgetId);
    }
    this.state.layouts = this.state.layouts.map((l) =>
      l.widget_id === widgetId ? { ...l, is_docked: !isDocked } : l
    );
    haptics.selection();
    this.persist();
  }

  public addWidget(widgetId: string, sizeClass: WidgetSizeClass = 'M') {
    // If already in layouts but hidden, restore it
    if (this.state.hiddenWidgetIds.includes(widgetId)) {
      this.restoreWidget(widgetId);
      return;
    }

    const existing = this.state.layouts.find((l) => l.widget_id === widgetId);
    if (existing) {
      this.setWidgetSize(widgetId, sizeClass);
      return;
    }

    const newLayout: UserWidgetLayoutRecord = {
      id: `layout-${widgetId}-${Date.now()}`,
      user_id: 'user-default',
      surface: 'widgets_home',
      widget_install_id: `inst-${widgetId}`,
      widget_id: widgetId,
      breakpoint: 'desktop',
      size_class: sizeClass,
      order_index: this.state.layouts.length,
      is_docked: false,
      collapsed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.state.layouts.push(newLayout);
    haptics.success();
    this.persist();
  }

  public resetToDefault() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this.loadState();
    haptics.impact('heavy');
    this.persist();
  }
}

export const widgetStore = new WidgetStore();

export function useWidgetStore() {
  const [state, setState] = useState<WidgetStoreState>(() => widgetStore.getState());

  useEffect(() => {
    return widgetStore.subscribe(() => {
      setState(widgetStore.getState());
    });
  }, []);

  return {
    ...state,
    toggleEditMode: (en?: boolean) => widgetStore.toggleEditMode(en),
    setWidgetSize: (id: string, s: WidgetSizeClass) => widgetStore.setWidgetSize(id, s),
    reorderWidget: (from: number, to: number) => widgetStore.reorderWidget(from, to),
    moveWidgetUp: (id: string) => widgetStore.moveWidgetUp(id),
    moveWidgetDown: (id: string) => widgetStore.moveWidgetDown(id),
    hideWidget: (id: string) => widgetStore.hideWidget(id),
    restoreWidget: (id: string) => widgetStore.restoreWidget(id),
    removeWidget: (id: string) => widgetStore.removeWidget(id),
    undoLastRemove: () => widgetStore.undoLastRemove(),
    clearUndo: () => widgetStore.clearUndo(),
    toggleDocked: (id: string) => widgetStore.toggleDocked(id),
    addWidget: (id: string, s?: WidgetSizeClass) => widgetStore.addWidget(id, s),
    resetToDefault: () => widgetStore.resetToDefault()
  };
}
