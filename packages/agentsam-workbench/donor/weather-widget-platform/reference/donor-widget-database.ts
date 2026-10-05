/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Database schemas & entity contracts for AgentSam Widget System & Plugin Registry.
 * Directly conforms to the requested core tables.
 */

import { WidgetCategory, WidgetSize } from './index';

export type WidgetSizeClass = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'Full';

export type SurfaceType =
  | 'widgets_home'
  | 'dock'
  | 'workbench_split'
  | 'app_home'
  | 'glance_overlay';

/** Table: agentsam_widget_catalog (Master widget catalog) */
export interface AgentSamWidgetCatalogRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: WidgetCategory;
  icon: string;
  version: string;
  status: 'stable' | 'beta' | 'preview';
  default_size: WidgetSizeClass;
  supported_sizes: WidgetSizeClass[];
  tags: string[];
  package_name: string;
  component_key: string;
  data_source_kind: 'local' | 'telemetry' | 'open_meteo' | 'agent_rpc' | 'plugin';
  config_schema_json?: Record<string, any>;
  manifest_json?: Record<string, any>;
  is_public: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

/** Table: user_widget_installs (Per-user widget enablement & status) */
export interface UserWidgetInstallRecord {
  id: string;
  user_id: string;
  widget_id: string;
  enabled: boolean;
  pinned: boolean;
  hidden: boolean;
  favorite: boolean;
  install_source: 'system' | 'catalog' | 'plugin';
  created_at: string;
  updated_at: string;
}

/** Table: user_widget_layouts (Placement, order, size class per surface) */
export interface UserWidgetLayoutRecord {
  id: string;
  user_id: string;
  surface: SurfaceType;
  widget_install_id: string;
  widget_id: string;
  breakpoint: 'mobile' | 'tablet' | 'desktop';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  size_class: WidgetSizeClass;
  order_index: number;
  is_docked: boolean;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
}

/** Table: user_widget_state (Widget runtime persistent state) */
export interface UserWidgetStateRecord {
  id: string;
  user_id: string;
  widget_id: string;
  state_json: Record<string, any>;
  last_interaction_at: string;
  updated_at: string;
}

/** Table: user_widget_presets (Saved named configurations) */
export interface UserWidgetPresetRecord {
  id: string;
  user_id: string;
  widget_id: string;
  name: string;
  preset_json: Record<string, any>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Table: widget_event_log (Telemetry & debugging events) */
export interface WidgetEventLogRecord {
  id: string;
  user_id: string;
  widget_id: string;
  event_type: 'added' | 'removed' | 'resized' | 'launched' | 'interacted' | 'hidden' | 'restored' | 'action_triggered';
  surface: SurfaceType;
  payload_json?: Record<string, any>;
  created_at: string;
}

/** Table: agentsam_plugins (Master catalog of available plugins) */
export interface AgentSamPluginRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: 'workspace' | 'cloud' | 'developer' | 'storage' | 'intelligence';
  status: 'active' | 'beta' | 'coming_soon';
  icon: string;
  package_name: string;
  entrypoint: string;
  provider_type: 'google' | 'cloudflare' | 'github' | 'local' | 'mcp' | 'api';
  config_schema_json?: Record<string, any>;
  capabilities_json: string[];
  permissions_json: string[];
  manifest_json?: Record<string, any>;
  is_public: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

/** Table: user_plugin_installs (Per-user plugin enablement) */
export interface UserPluginInstallRecord {
  id: string;
  user_id: string;
  plugin_id: string;
  enabled: boolean;
  status: 'connected' | 'needs_setup' | 'error' | 'disabled';
  settings_json?: Record<string, any>;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
}

/** Table: plugin_connections (Concrete authenticated account connections) */
export interface PluginConnectionRecord {
  id: string;
  user_id: string;
  plugin_install_id: string;
  connection_label: string;
  provider_key: string;
  owner_ref: string;
  resource_ref?: string;
  status: 'healthy' | 'refresh_required' | 'revoked';
  metadata_json?: Record<string, any>;
  created_at: string;
  updated_at: string;
}
