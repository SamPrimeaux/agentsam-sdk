/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: Master AdminShell Component
 */

import React from 'react';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';
import { MobileNavigation } from './MobileNavigation';
import { CommandSearch } from './CommandSearch';
import { CopilotDrawer } from './CopilotDrawer';
import { useAdmin } from '../app/AdminProvider';

export interface AdminShellProps {
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col antialiased selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Header */}
      <AdminHeader />

      {/* Main App Layout */}
      <div className="flex-1 flex min-w-0">
        {/* Docked Sidebar (Desktop) */}
        <AdminSidebar />

        {/* Mobile Navigation Drawer */}
        <MobileNavigation />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-x-hidden flex flex-col">
          <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
            {children}
          </div>
        </main>
      </div>

      {/* Global Command Palette ⌘K */}
      <CommandSearch />

      {/* Global AI Copilot Slideout */}
      <CopilotDrawer />
    </div>
  );
};

export const AppShell = AdminShell;

