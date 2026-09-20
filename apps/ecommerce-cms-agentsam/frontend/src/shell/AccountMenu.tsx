/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: AccountMenu Component
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAdmin } from '../app/AdminProvider';
import { ShieldCheck, LogOut, ChevronDown, User, Check, ExternalLink } from 'lucide-react';

export const AccountMenu: React.FC = () => {
  const { host } = useAdmin();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = host.auth.currentUser();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 transition-colors"
      >
        <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[11px] font-mono font-bold text-amber-400">
          {user.name.charAt(0)}
        </div>
        <div className="hidden sm:block text-left pr-1">
          <span className="text-xs font-semibold text-zinc-200 block leading-tight">
            {user.name}
          </span>
          <span className="text-[10px] font-mono text-zinc-500 block leading-none">
            {user.role}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 hidden sm:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 text-xs animate-slide-up">
          {/* User Details */}
          <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/80 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-zinc-200">{user.name}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {host.brand.environment}
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400 block truncate">
              {user.email}
            </span>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-zinc-500 font-mono">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Full Access Permissions</span>
            </div>
          </div>

          {/* Installation Info */}
          <div className="px-3 py-2 text-[11px] text-zinc-400 border-b border-zinc-800/60 mb-2">
            <span className="text-zinc-500 block font-mono text-[10px]">Target Installation</span>
            <span className="font-medium text-zinc-300 block">{host.brand.installationName}</span>
          </div>

          {/* Actions */}
          <div className="space-y-0.5">
            <a
              href="https://fuelnfreetime.com"
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                <span>Visit Live Storefront</span>
              </div>
            </a>

            <button
              onClick={() => {
                setIsOpen(false);
                host.auth.logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-400 hover:bg-red-950/30 transition-colors text-left"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const AccountSwitcher = AccountMenu;

