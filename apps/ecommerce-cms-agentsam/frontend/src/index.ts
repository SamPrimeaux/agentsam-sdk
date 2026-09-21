/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Entry Barrel Export
 */

// Host Contracts & Types
export * from './platform/contracts/AdminHostConfig';
export * from './platform/contracts/SecretStore';
export * from './platform/contracts/ProviderRegistry';
export * from './platform/contracts/ModelCatalog';

// Adapters
export * from './platform/adapters/MockAdminHost';
export * from './platform/adapters/FuelNFreeTimeAdminHost';
export * from './platform/adapters/LocalSecretStoreAdapter';

// Application & Context
export * from './app/AdminProvider';
export * from './app/AdminApp';
export * from './app/routeManifest';

// Shell Layout
export * from './shell/AdminShell';
export * from './shell/AdminHeader';
export * from './shell/AdminSidebar';
export * from './shell/MobileNavigation';
export * from './shell/CommandSearch';
export * from './shell/AccountMenu';
export * from './shell/CopilotDrawer';

// Design System
export * from './design-system/Button';
export * from './design-system/IconButton';
export * from './design-system/Badge';
export * from './design-system/Card';
export * from './design-system/StatCard';
export * from './design-system/Input';
export * from './design-system/Select';
export * from './design-system/Tabs';
export * from './design-system/Dialog';
export * from './design-system/Drawer';
export * from './design-system/DataTable';
export * from './design-system/EmptyState';
export * from './design-system/Toast';
export * from './design-system/Sidebar';
