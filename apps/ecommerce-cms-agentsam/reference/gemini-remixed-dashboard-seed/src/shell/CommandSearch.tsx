/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Shell: CommandSearch ⌘K Palette
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../app/AdminProvider';
import { ADMIN_ROUTES } from '../app/routeManifest';
import { Search, ArrowRight, CornerDownLeft, Sparkles, ShoppingBag, Tag, KeyRound, Bot, X } from 'lucide-react';

export const CommandSearch: React.FC = () => {
  const { isCommandPaletteOpen, setCommandPaletteOpen, navigate, setCopilotOpen } = useAdmin();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  // Filter routes and quick actions
  const filteredRoutes = ADMIN_ROUTES.filter(
    (r) =>
      r.label.toLowerCase().includes(query.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(query.toLowerCase()))
  );

  const sampleShortcuts = [
    {
      id: 'cmd_copilot',
      label: 'Ask AgentSam Copilot',
      category: 'AI Copilot',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      action: () => {
        setCommandPaletteOpen(false);
        setCopilotOpen(true);
      }
    },
    {
      id: 'cmd_order_recent',
      label: 'View Recent Order #FFT-9402',
      category: 'Orders',
      icon: <ShoppingBag className="w-4 h-4 text-emerald-400" />,
      action: () => {
        setCommandPaletteOpen(false);
        navigate('/admin/orders');
      }
    },
    {
      id: 'cmd_completeful_vault',
      label: 'Manage Completeful & Stripe Credentials',
      category: 'Vault',
      icon: <KeyRound className="w-4 h-4 text-sky-400" />,
      action: () => {
        setCommandPaletteOpen(false);
        navigate('/admin/providers');
      }
    }
  ].filter((s) => s.label.toLowerCase().includes(query.toLowerCase()) || s.category.toLowerCase().includes(query.toLowerCase()));

  const totalItems = sampleShortcuts.length + filteredRoutes.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < sampleShortcuts.length) {
        sampleShortcuts[selectedIndex]?.action();
      } else {
        const routeIdx = selectedIndex - sampleShortcuts.length;
        const target = filteredRoutes[routeIdx];
        if (target) {
          setCommandPaletteOpen(false);
          navigate(target.path);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={() => setCommandPaletteOpen(false)}
      />

      {/* Palette Box */}
      <div
        className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-slide-up z-10 flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/40">
          <Search className="w-4 h-4 text-zinc-400 mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, search orders, or jump to view..."
            className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800 rounded border border-zinc-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto custom-scroll p-2 text-xs divide-y divide-zinc-900">
          {sampleShortcuts.length > 0 && (
            <div className="py-1">
              <span className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold block">
                Quick Actions
              </span>
              {sampleShortcuts.map((sc, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={sc.action}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                      isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {sc.icon}
                      <span>{sc.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">{sc.category}</span>
                  </button>
                );
              })}
            </div>
          )}

          {filteredRoutes.length > 0 && (
            <div className="py-1">
              <span className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold block">
                Navigation
              </span>
              {filteredRoutes.map((route, idx) => {
                const itemIndex = sampleShortcuts.length + idx;
                const isSelected = itemIndex === selectedIndex;
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => {
                      setCommandPaletteOpen(false);
                      navigate(route.path);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                      isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div>
                      <span className="font-medium text-zinc-200 block">{route.label}</span>
                      {route.description && (
                        <span className="text-[11px] text-zinc-500 block truncate">
                          {route.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-500">{route.path}</span>
                      <CornerDownLeft className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {totalItems === 0 && (
            <div className="py-8 text-center text-zinc-500 text-xs">
              No actions or navigation found for &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Use ↑ and ↓ to navigate</span>
          <span>↵ to select</span>
        </div>
      </div>
    </div>
  );
};
