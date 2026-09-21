/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Route Manifest
 *
 * Defines all standard admin navigation routes, groupings, icons, and query schemas.
 */

export interface RouteDefinition {
  id: string;
  path: string;
  label: string;
  iconName: string;
  group: 'main' | 'sales_channels' | 'apps' | 'platform' | 'settings';
  badge?: string;
  description?: string;
}

export const ADMIN_ROUTES: RouteDefinition[] = [
  // Main
  {
    id: 'home',
    path: '/admin/home',
    label: 'Home',
    iconName: 'LayoutDashboard',
    group: 'main',
    description: 'Commerce operations, fulfillment status, and priority actions'
  },
  {
    id: 'orders',
    path: '/admin/orders',
    label: 'Orders',
    iconName: 'ShoppingBag',
    group: 'main',
    badge: '3 Open',
    description: 'Order routing, Stripe charges, and Completeful tracking'
  },
  {
    id: 'products',
    path: '/admin/products',
    label: 'Products',
    iconName: 'Tag',
    group: 'main',
    description: 'Merchandising catalog, variants, and DTG mappings'
  },
  {
    id: 'inventory',
    path: '/admin/inventory',
    label: 'Inventory',
    iconName: 'Boxes',
    group: 'main',
    description: 'Available, reserved, and low-stock garment inventory'
  },
  {
    id: 'subscribers',
    path: '/admin/subscribers',
    label: 'Customers',
    iconName: 'Users',
    group: 'main',
    description: 'Customer profiles, order frequency, and newsletter subscribers'
  },
  {
    id: 'growth',
    path: '/admin/growth',
    label: 'Campaigns',
    iconName: 'Rocket',
    group: 'main',
    description: 'Autonomous CampaignBuilder for multi-channel drops'
  },
  {
    id: 'discounts',
    path: '/admin/discounts',
    label: 'Discounts',
    iconName: 'Percent',
    group: 'main',
    description: 'Promotional discount codes and checkout rules'
  },
  {
    id: 'content',
    label: 'Content & AI Studio',
    path: '/admin/content',
    iconName: 'Sparkles',
    group: 'main',
    description: 'R2 media library and generative image/video/copy studio'
  },

  // Sales Channels
  {
    id: 'store',
    path: '/admin/store',
    label: 'Online Store',
    iconName: 'Globe',
    group: 'sales_channels',
    description: 'Storefront theme and live preview'
  },
  {
    id: 'pages',
    path: '/admin/pages',
    label: 'CMS Pages',
    iconName: 'FileText',
    group: 'sales_channels',
    description: 'Publish and edit marketing content pages'
  },
  {
    id: 'pos',
    path: '/admin/scaffold?view=pos',
    label: 'Point of Sale (POS)',
    iconName: 'Smartphone',
    group: 'sales_channels',
    description: 'Trackside and event in-person checkout'
  },
  {
    id: 'markets',
    path: '/admin/scaffold?view=markets',
    label: 'Global Markets',
    iconName: 'MapPin',
    group: 'sales_channels',
    description: 'Multi-region pricing, currencies, and duties'
  },

  // Apps & Engines
  {
    id: 'completeful',
    path: '/admin/completeful',
    label: 'Completeful POD',
    iconName: 'Truck',
    group: 'apps',
    badge: 'Connected',
    description: 'Print-on-demand fulfillment console & mockup studio'
  },
  {
    id: 'agentsam',
    path: '/admin/agentsam',
    label: 'AgentSam Copilot',
    iconName: 'Bot',
    group: 'apps',
    badge: 'MCP Active',
    description: 'Autonomous commerce agent & model catalog authority'
  },
  {
    id: 'email',
    path: '/admin/email',
    label: 'Communications',
    iconName: 'Mail',
    group: 'apps',
    description: 'Resend mailboxes for orders, support, and payments'
  },
  {
    id: 'analytics',
    path: '/admin/analytics',
    label: 'Analytics & Health',
    iconName: 'BarChart3',
    group: 'apps',
    description: 'Revenue metrics, fulfillment latency, and provider health'
  },

  // Platform
  {
    id: 'providers',
    path: '/admin/providers',
    label: 'Provider Center & Vault',
    iconName: 'KeyRound',
    group: 'platform',
    badge: 'Vault',
    description: 'API credentials, webhooks, and third-party health'
  }
];
