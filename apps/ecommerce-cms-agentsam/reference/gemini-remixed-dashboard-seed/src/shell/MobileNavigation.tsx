/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: MobileNavigation Component
 *
 * Implements:
 * - Animated Hamburger icon that smoothly morphs into an 'X'
 * - Frosted white glassmorphic mobile navigation drawer
 * - Swipe / click outside / Escape dismiss
 */

import React, { useEffect, useState, useRef } from 'react';
import { useAdmin } from '../app/AdminProvider';
import { ADMIN_ROUTES } from '../app/routeManifest';
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
  X,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
  ShoppingBag: <ShoppingBag className="w-4 h-4" />,
  Tag: <Tag className="w-4 h-4" />,
  Boxes: <Boxes className="w-4 h-4" />,
  Users: <Users className="w-4 h-4" />,
  Rocket: <Rocket className="w-4 h-4" />,
  Percent: <Percent className="w-4 h-4" />,
  Sparkles: <Sparkles className="w-4 h-4" />,
  Globe: <Globe className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />,
  Smartphone: <Smartphone className="w-4 h-4" />,
  MapPin: <MapPin className="w-4 h-4" />,
  Truck: <Truck className="w-4 h-4" />,
  Bot: <Bot className="w-4 h-4" />,
  Mail: <Mail className="w-4 h-4" />,
  BarChart3: <BarChart3 className="w-4 h-4" />,
  KeyRound: <KeyRound className="w-4 h-4" />
};

/**
 * Animated Hamburger Button
 * When clicked, morphs seamlessly into an 'X' using CSS transforms.
 */
export const HamburgerButton: React.FC<{
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}> = ({ isOpen, onClick, className = '' }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? 'Close mobile menu' : 'Open mobile menu'}
      aria-expanded={isOpen}
      className={`relative w-10 h-10 rounded-xl flex flex-col items-center justify-center p-2.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-800/90 shadow-xs active:scale-95 transition-all duration-200 cursor-pointer ${className}`}
    >
      <div className="w-4 h-3.5 relative flex flex-col justify-between items-center pointer-events-none">
        {/* Top line */}
        <span
          className={`w-4 h-0.5 bg-zinc-200 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform origin-center ${
            isOpen ? 'rotate-45 translate-y-[6px]' : 'rotate-0 translate-y-0'
          }`}
        />
        {/* Middle line */}
        <span
          className={`w-4 h-0.5 bg-zinc-200 rounded-full transition-all duration-200 ease-out ${
            isOpen ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100'
          }`}
        />
        {/* Bottom line */}
        <span
          className={`w-4 h-0.5 bg-zinc-200 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] transform origin-center ${
            isOpen ? '-rotate-45 -translate-y-[6px]' : 'rotate-0 translate-y-0'
          }`}
        />
      </div>
    </button>
  );
};

export const MobileNavigation: React.FC = () => {
  const { host, currentPath, navigate, isMobileNavOpen, setMobileNavOpen } = useAdmin();
  const [productsOpen, setProductsOpen] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Handle escape key, body scroll lock, and accessible focus management
  useEffect(() => {
    if (isMobileNavOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';

      // Move focus into drawer
      const timer = setTimeout(() => {
        const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setMobileNavOpen(false);
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
        triggerRef.current?.focus();
      };
    }
  }, [isMobileNavOpen, setMobileNavOpen]);

  if (!isMobileNavOpen) return null;

  const handleItemClick = (path: string) => {
    navigate(path);
    setMobileNavOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Dark frosted Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer Sheet: Frosted White Glassmorphism */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation drawer"
        className="relative w-72 max-w-[85vw] h-full bg-white/95 backdrop-blur-2xl border-r border-zinc-200/90 shadow-2xl flex flex-col z-10 animate-slide-right text-zinc-800"
      >
        {/* Header inside drawer */}
        <div className="p-4 border-b border-zinc-200/80 bg-white/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center font-mono font-bold text-amber-600 text-xs shadow-xs">
              {host.brand.shortName.substring(0, 2)}
            </div>
            <div>
              <span className="font-semibold text-xs text-zinc-900 block">
                {host.brand.appName}
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {host.brand.installationName}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Nav List with clean light styling */}
        <div className="flex-1 overflow-y-auto custom-scroll-light p-3 space-y-4 text-xs">
          {/* Main Group */}
          <div>
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Core Operations
            </span>
            <div className="space-y-0.5">
              {/* Home */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/home')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/home' || currentPath === '/admin'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Home</span>
                </div>
              </button>

              {/* Orders */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/orders')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/orders'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Orders</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-zinc-200/70 text-zinc-700 font-mono">
                  3 Open
                </span>
              </button>

              {/* Products (Collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setProductsOpen(!productsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Tag className="w-4 h-4 text-zinc-600" />
                    <span className="text-[13px]">Products</span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                      productsOpen ? 'transform rotate-180 text-zinc-700' : ''
                    }`}
                  />
                </button>
                {productsOpen && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-zinc-200/80 ml-4 my-0.5">
                    <button
                      type="button"
                      onClick={() => handleItemClick('/admin/products')}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${
                        currentPath === '/admin/products'
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                      }`}
                    >
                      All Products
                    </button>
                    <button
                      type="button"
                      onClick={() => handleItemClick('/admin/inventory')}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${
                        currentPath === '/admin/inventory'
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                      }`}
                    >
                      Inventory
                    </button>
                  </div>
                )}
              </div>

              {/* Customers */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/subscribers')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/subscribers'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Customers</span>
                </div>
              </button>

              {/* Growth */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/growth')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/growth'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Rocket className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Growth</span>
                </div>
              </button>

              {/* Discounts */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/discounts')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/discounts'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Percent className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Discounts</span>
                </div>
              </button>

              {/* Content */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/content')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/content'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Content</span>
                </div>
              </button>

              {/* Markets */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/scaffold?view=markets')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath.includes('view=markets')
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Markets</span>
                </div>
              </button>

              {/* Analytics (Collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setAnalyticsOpen(!analyticsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="w-4 h-4 text-zinc-600" />
                    <span className="text-[13px]">Analytics</span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                      analyticsOpen ? 'transform rotate-180 text-zinc-700' : ''
                    }`}
                  />
                </button>
                {analyticsOpen && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-zinc-200/80 ml-4 my-0.5">
                    <button
                      type="button"
                      onClick={() => handleItemClick('/admin/analytics')}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${
                        currentPath === '/admin/analytics'
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                      }`}
                    >
                      Overview & Reports
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sales Channels Group */}
          <div>
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Sales channels
            </span>
            <div className="space-y-0.5">
              {/* Online Store (Collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setStoreOpen(!storeOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-zinc-600" />
                    <span className="text-[13px]">Online Store</span>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                      storeOpen ? 'transform rotate-180 text-zinc-700' : ''
                    }`}
                  />
                </button>
                {storeOpen && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-zinc-200/80 ml-4 my-0.5">
                    <button
                      type="button"
                      onClick={() => handleItemClick('/admin/store')}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${
                        currentPath === '/admin/store'
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                      }`}
                    >
                      Storefront Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleItemClick('/admin/pages')}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${
                        currentPath === '/admin/pages'
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60'
                      }`}
                    >
                      CMS Pages
                    </button>
                  </div>
                )}
              </div>

              {/* Point of Sale */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/scaffold?view=pos')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath.includes('view=pos')
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Point of Sale</span>
                </div>
              </button>

              {/* AgentSam (highlighted active pill) */}
              <button
                type="button"
                onClick={() => handleItemClick('/admin/agentsam')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${
                  currentPath === '/admin/agentsam'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bot className="w-4 h-4 text-zinc-800" />
                  <span className="text-[13px]">AgentSam</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/10 text-amber-700 font-mono font-medium">
                  Active
                </span>
              </button>
            </div>
          </div>

          {/* Apps Group */}
          <div>
            <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Apps
            </span>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => handleItemClick('/admin/email')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/email'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Email</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              <button
                type="button"
                onClick={() => handleItemClick('/admin/completeful')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/completeful'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Completeful POD</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleItemClick('/admin/providers')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                  currentPath === '/admin/providers'
                    ? 'bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/70 shadow-xs'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-zinc-600" />
                  <span className="text-[13px]">Provider Center</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-zinc-200/70 text-zinc-700 font-mono">
                  Vault
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-200/80 bg-white/40 flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Vault Sealed</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">Preview v2.4</span>
        </div>
      </div>
    </div>
  );
};

export const MobileNavigationDrawer = MobileNavigation;

