/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Tabs Component
 */

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline';
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'pill',
  size = 'md',
  className = ''
}) => {
  if (variant === 'underline') {
    return (
      <div className={`flex items-center gap-6 border-b border-zinc-800/80 ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`pb-3 pt-1 flex items-center gap-2 text-xs font-medium transition-colors relative whitespace-nowrap ${
                isActive ? 'text-amber-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive ? 'bg-amber-400/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Pill variant
  return (
    <div
      className={`inline-flex items-center p-1 bg-zinc-950/80 rounded-xl border border-zinc-800/80 overflow-x-auto scrollbar-hide max-w-full ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${
              isActive
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                  isActive ? 'bg-amber-400/20 text-amber-300' : 'bg-zinc-900 text-zinc-500'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
