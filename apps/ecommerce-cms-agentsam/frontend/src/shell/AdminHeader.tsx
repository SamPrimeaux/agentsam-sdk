/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: AdminHeader Component
 */

import React from 'react';
import { useAdmin } from '../app/AdminProvider';
import { HamburgerButton } from './MobileNavigation';
import { AccountMenu } from './AccountMenu';
import { Search, Sparkles, Truck, Shield, Bell } from 'lucide-react';
import { Badge } from '../design-system/Badge';

export const AdminHeader: React.FC = () => {
  const {
    host,
    isMobileNavOpen,
    setMobileNavOpen,
    setCommandPaletteOpen,
    setCopilotOpen,
    connections
  } = useAdmin();

  // Check Completeful connection status
  const completefulConn = connections.find((c) => c.providerKey === 'completeful');
  const isCompletefulHealthy = completefulConn ? completefulConn.status === 'healthy' : true;

  return (
    <header className="sticky top-0 z-40 w-full h-14 glass-header flex items-center justify-between px-4 sm:px-6">
      {/* Left side: Hamburger (mobile) + Brand */}
      <div className="flex items-center gap-3">
        <HamburgerButton
          isOpen={isMobileNavOpen}
          onClick={() => setMobileNavOpen(!isMobileNavOpen)}
          className="lg:hidden"
        />

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center font-mono font-bold text-amber-400 text-xs shadow-sm">
            {host.brand.shortName.substring(0, 2)}
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-100 tracking-tight">
                {host.brand.appName}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                v2.4
              </span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500 block leading-tight">
              {host.brand.installationName}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Command Search Trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-400 hover:text-zinc-300 text-xs transition-all shadow-inner"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500 font-sans">Quick search or command...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800/80 rounded border border-zinc-700/60">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right side: Completeful status, Copilot button, Environment, Account */}
      <div className="flex items-center gap-2.5">
        {/* Mobile search button */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="md:hidden p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800"
          title="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Completeful status indicator pill */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900/70 border border-zinc-800 text-xs">
          <Truck className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-mono text-[11px] text-zinc-300">Completeful:</span>
          <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Test Dry-Run
          </span>
        </div>

        {/* AgentSam Copilot button */}
        <button
          type="button"
          onClick={() => setCopilotOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-400/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition-all shadow-sm active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Copilot</span>
        </button>

        {/* Notifications Bell */}
        <button
          type="button"
          className="relative p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-zinc-950" />
        </button>

        {/* Account Menu */}
        <AccountMenu />
      </div>
    </header>
  );
};

export const GlassHeader = AdminHeader;

