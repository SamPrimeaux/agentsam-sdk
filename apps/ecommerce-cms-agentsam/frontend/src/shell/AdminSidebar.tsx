/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: AdminSidebar Component
 *
 * Composable sidebar navigation suite featuring:
 * - White frosted glassmorphic styling (matching platform standard)
 * - Desktop hover slide-open peeking functionality when collapsed
 * - Collapsible groups and nested submenus (Products, Analytics, Store, Email)
 * - Sliding views (Store Navigation ↔ Completeful POD Surface ↔ Secret Vault Surface)
 * - Drag-to-resize support with boundary limits
 * - Keyboard accessible shortcuts and tooltips
 */

import React, { useState } from 'react';
import { useAdmin } from '../app/AdminProvider';
import {
  Sidebar,
  useSidebar,
  SidebarProvider
} from '../design-system/Sidebar';
import {
  LayoutDashboard,
  ShoppingBag,
  Tag,
  Boxes,
  Users,
  Rocket,
  Percent,
  Sparkles,
  Globe,
  FileText,
  Smartphone,
  MapPin,
  Truck,
  Bot,
  Mail,
  BarChart3,
  KeyRound,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Settings,
  Layers,
  ExternalLink,
  Plus
} from 'lucide-react';

interface SidebarInnerProps {
  currentPath: string;
  navigate: (path: string) => void;
  isCollapsed: boolean;
  setCollapsed: (c: boolean) => void;
}

const SidebarInner: React.FC<SidebarInnerProps> = ({
  currentPath,
  navigate,
  isCollapsed,
  setCollapsed
}) => {
  const { open, isPeeking, toggleSidebar, width } = useSidebar();
  const isExpanded = open || isPeeking;

  // View state for sliding views: 'main' | 'completeful' | 'vault'
  const [activeView, setActiveView] = useState<'main' | 'completeful' | 'vault'>('main');

  // Submenu toggle states
  const [productsOpen, setProductsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  return (
    <Sidebar className="text-zinc-800">
      {/* Sliding Navigation Views */}
      <Sidebar.SlidingViews activeKey={activeView} className="flex-1 flex flex-col min-h-0">
        {/* =========================================================================
            SURFACE 1: PRIMARY STORE NAVIGATION (Exact match to screenshot)
           ========================================================================= */}
        <Sidebar.SlidingView value="main">
          <Sidebar.Content>
            {/* Core Operations Group */}
            <Sidebar.Group>
              <Sidebar.Menu>
                {/* 1. Home */}
                <Sidebar.MenuButton
                  icon={<LayoutDashboard className="w-4 h-4" />}
                  active={currentPath === '/admin/home' || currentPath === '/admin'}
                  onClick={() => navigate('/admin/home')}
                  tooltip="Home"
                  itemId="nav-home"
                >
                  Home
                </Sidebar.MenuButton>

                {/* 2. Orders */}
                <Sidebar.MenuButton
                  icon={<ShoppingBag className="w-4 h-4" />}
                  active={currentPath === '/admin/orders'}
                  onClick={() => navigate('/admin/orders')}
                  tooltip="Orders"
                  itemId="nav-orders"
                  badge="3"
                >
                  Orders
                </Sidebar.MenuButton>

                {/* 3. Products (Collapsible with > arrow) */}
                <Sidebar.Collapsible open={productsOpen} onOpenChange={setProductsOpen}>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton
                        icon={<Tag className="w-4 h-4" />}
                        active={currentPath === '/admin/products' || currentPath === '/admin/inventory'}
                        tooltip="Products"
                        itemId="nav-products"
                        chevron={
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                              productsOpen ? 'rotate-90 text-zinc-700' : ''
                            }`}
                          />
                        }
                      >
                        Products
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      <Sidebar.MenuSubButton
                        active={currentPath === '/admin/products'}
                        onClick={() => navigate('/admin/products')}
                      >
                        All Products
                      </Sidebar.MenuSubButton>
                      <Sidebar.MenuSubButton
                        active={currentPath === '/admin/inventory'}
                        onClick={() => navigate('/admin/inventory')}
                        badge="Garments"
                      >
                        Inventory & Stock
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>

                {/* 4. Customers */}
                <Sidebar.MenuButton
                  icon={<Users className="w-4 h-4" />}
                  active={currentPath === '/admin/subscribers'}
                  onClick={() => navigate('/admin/subscribers')}
                  tooltip="Customers"
                  itemId="nav-customers"
                >
                  Customers
                </Sidebar.MenuButton>

                {/* 5. Growth */}
                <Sidebar.MenuButton
                  icon={<Rocket className="w-4 h-4" />}
                  active={currentPath === '/admin/growth'}
                  onClick={() => navigate('/admin/growth')}
                  tooltip="Growth Campaigns"
                  itemId="nav-growth"
                >
                  Growth
                </Sidebar.MenuButton>

                {/* 6. Discounts */}
                <Sidebar.MenuButton
                  icon={<Percent className="w-4 h-4" />}
                  active={currentPath === '/admin/discounts'}
                  onClick={() => navigate('/admin/discounts')}
                  tooltip="Discounts"
                  itemId="nav-discounts"
                >
                  Discounts
                </Sidebar.MenuButton>

                {/* 7. Content */}
                <Sidebar.MenuButton
                  icon={<FileText className="w-4 h-4" />}
                  active={currentPath === '/admin/content'}
                  onClick={() => navigate('/admin/content')}
                  tooltip="Content & Media Studio"
                  itemId="nav-content"
                >
                  Content
                </Sidebar.MenuButton>

                {/* 8. Markets */}
                <Sidebar.MenuButton
                  icon={<Globe className="w-4 h-4" />}
                  active={currentPath.includes('view=markets')}
                  onClick={() => navigate('/admin/scaffold?view=markets')}
                  tooltip="Markets"
                  itemId="nav-markets"
                >
                  Markets
                </Sidebar.MenuButton>

                {/* 9. Analytics (Collapsible with > arrow) */}
                <Sidebar.Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton
                        icon={<BarChart3 className="w-4 h-4" />}
                        active={currentPath === '/admin/analytics'}
                        tooltip="Analytics"
                        itemId="nav-analytics"
                        chevron={
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                              analyticsOpen ? 'rotate-90 text-zinc-700' : ''
                            }`}
                          />
                        }
                      >
                        Analytics
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      <Sidebar.MenuSubButton
                        active={currentPath === '/admin/analytics'}
                        onClick={() => navigate('/admin/analytics')}
                      >
                        Overview & Latency
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>
              </Sidebar.Menu>
            </Sidebar.Group>

            {/* Sales Channels Group */}
            <Sidebar.Group>
              <Sidebar.GroupLabel>Sales channels</Sidebar.GroupLabel>
              <Sidebar.Menu>
                {/* Online Store (Collapsible) */}
                <Sidebar.Collapsible open={storeOpen} onOpenChange={setStoreOpen}>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton
                        icon={<Globe className="w-4 h-4" />}
                        active={currentPath === '/admin/store' || currentPath === '/admin/pages'}
                        tooltip="Online Store"
                        itemId="nav-store"
                        chevron={
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                              storeOpen ? 'rotate-90 text-zinc-700' : ''
                            }`}
                          />
                        }
                      >
                        Online Store
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      <Sidebar.MenuSubButton
                        active={currentPath === '/admin/store'}
                        onClick={() => navigate('/admin/store')}
                      >
                        Themes & Preview
                      </Sidebar.MenuSubButton>
                      <Sidebar.MenuSubButton
                        active={currentPath === '/admin/pages'}
                        onClick={() => navigate('/admin/pages')}
                      >
                        CMS Pages
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>

                {/* Point of Sale */}
                <Sidebar.MenuButton
                  icon={<Smartphone className="w-4 h-4" />}
                  active={currentPath.includes('view=pos')}
                  onClick={() => navigate('/admin/scaffold?view=pos')}
                  tooltip="Point of Sale"
                  itemId="nav-pos"
                >
                  Point of Sale
                </Sidebar.MenuButton>

                {/* AgentSam (Screenshot Active Item) */}
                <Sidebar.MenuButton
                  icon={<Bot className="w-4 h-4" />}
                  active={currentPath === '/admin/agentsam'}
                  onClick={() => navigate('/admin/agentsam')}
                  tooltip="AgentSam Copilot"
                  itemId="nav-agentsam"
                  badge="Active"
                >
                  AgentSam
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>

            {/* Apps Group */}
            <Sidebar.Group>
              <Sidebar.GroupLabel>Apps</Sidebar.GroupLabel>
              <Sidebar.Menu>
                {/* Email (Collapsible) */}
                <Sidebar.Collapsible open={emailOpen} onOpenChange={setEmailOpen}>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton
                        icon={<Mail className="w-4 h-4" />}
                        active={currentPath === '/admin/email'}
                        tooltip="Email Communications"
                        itemId="nav-email"
                        chevron={
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                              emailOpen ? 'rotate-90 text-zinc-700' : ''
                            }`}
                          />
                        }
                      >
                        Email
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      <Sidebar.MenuSubButton
                        active={currentPath === '/admin/email'}
                        onClick={() => navigate('/admin/email')}
                      >
                        Resend Mailboxes
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>

                {/* Completeful POD Console with Surface Switcher */}
                <Sidebar.MenuButton
                  icon={<Truck className="w-4 h-4" />}
                  active={currentPath === '/admin/completeful'}
                  onClick={() => navigate('/admin/completeful')}
                  tooltip="Completeful POD Console"
                  itemId="nav-completeful"
                  chevron={
                    <button
                      type="button"
                      title="Switch to Completeful Surface"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveView('completeful');
                      }}
                      className="p-1 hover:bg-zinc-200/80 rounded transition-colors text-zinc-400 hover:text-zinc-700"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  }
                >
                  Completeful POD
                </Sidebar.MenuButton>

                {/* Provider Center & Secret Vault */}
                <Sidebar.MenuButton
                  icon={<KeyRound className="w-4 h-4" />}
                  active={currentPath === '/admin/providers'}
                  onClick={() => navigate('/admin/providers')}
                  tooltip="Provider Center & Vault"
                  itemId="nav-providers"
                  badge="Vault"
                  chevron={
                    <button
                      type="button"
                      title="Inspect Vault Secrets"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveView('vault');
                      }}
                      className="p-1 hover:bg-zinc-200/80 rounded transition-colors text-zinc-400 hover:text-zinc-700"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  }
                >
                  Provider Center
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
          </Sidebar.Content>
        </Sidebar.SlidingView>

        {/* =========================================================================
            SURFACE 2: COMPLETEFUL POD CONSOLE SLIDING VIEW
           ========================================================================= */}
        <Sidebar.SlidingView value="completeful">
          <Sidebar.Header className="bg-zinc-50/70 border-b border-zinc-200/70">
            <button
              type="button"
              onClick={() => setActiveView('main')}
              className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-950 font-medium py-1 px-1.5 rounded-lg hover:bg-zinc-200/60 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Store</span>
            </button>
            <span className="text-[10px] font-mono font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded">
              POD Surface
            </span>
          </Sidebar.Header>

          <Sidebar.Content>
            <Sidebar.Group>
              <Sidebar.GroupLabel>Completeful Fulfillment</Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={<Truck className="w-4 h-4" />}
                  active={currentPath === '/admin/completeful'}
                  onClick={() => navigate('/admin/completeful')}
                >
                  Fulfillment Queue
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={<Sparkles className="w-4 h-4" />}
                  active={false}
                  onClick={() => navigate('/admin/completeful')}
                >
                  DTG Mockup Studio
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={<Boxes className="w-4 h-4" />}
                  active={false}
                  onClick={() => navigate('/admin/inventory')}
                >
                  Blank Garment Stock
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>

            <Sidebar.Group>
              <Sidebar.GroupLabel>Webhooks & Logs</Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={<KeyRound className="w-4 h-4" />}
                  active={false}
                  onClick={() => navigate('/admin/providers?selected=completeful')}
                  badge="CAPP_KEY"
                >
                  API Credentials
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
          </Sidebar.Content>
        </Sidebar.SlidingView>

        {/* =========================================================================
            SURFACE 3: WRITE-ONLY SECRET VAULT SLIDING VIEW
           ========================================================================= */}
        <Sidebar.SlidingView value="vault">
          <Sidebar.Header className="bg-zinc-50/70 border-b border-zinc-200/70">
            <button
              type="button"
              onClick={() => setActiveView('main')}
              className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-950 font-medium py-1 px-1.5 rounded-lg hover:bg-zinc-200/60 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Store</span>
            </button>
            <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
              Vault Sealed
            </span>
          </Sidebar.Header>

          <Sidebar.Content>
            <Sidebar.Group>
              <Sidebar.GroupLabel>Write-Only Secrets</Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={<KeyRound className="w-4 h-4" />}
                  active={currentPath === '/admin/providers'}
                  onClick={() => navigate('/admin/providers')}
                >
                  All Providers
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
                  active={false}
                  onClick={() => navigate('/admin/providers?tab=vault')}
                  badge="Encrypted"
                >
                  Audit Descriptors
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
          </Sidebar.Content>
        </Sidebar.SlidingView>
      </Sidebar.SlidingViews>

      {/* Footer: Vault status indicator + Clean Toggle Button */}
      <Sidebar.Footer>
        {isExpanded ? (
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/40" />
            <span className="truncate">Vault Sealed (Write-Only)</span>
          </div>
        ) : (
          <span className="w-2 h-2 rounded-full bg-emerald-500 mx-auto" title="Vault Sealed" />
        )}
        <Sidebar.Trigger tooltip={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'} />
      </Sidebar.Footer>

      {/* Optional Resize Handle */}
      <Sidebar.ResizeHandle minWidth={190} maxWidth={340} />
    </Sidebar>
  );
};

export const AdminSidebar: React.FC = () => {
  const { currentPath, navigate, isSidebarCollapsed, setSidebarCollapsed } = useAdmin();

  return (
    <SidebarProvider
      open={!isSidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
      collapsible="icon"
      peekable={true}
      resizable={true}
      defaultWidth={240}
    >
      <SidebarInner
        currentPath={currentPath}
        navigate={navigate}
        isCollapsed={isSidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />
    </SidebarProvider>
  );
};
