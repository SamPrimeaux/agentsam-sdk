/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ShortcutsWidget: Studio keyboard shortcuts cheatsheet.
 */

import React from 'react';
import { Command, Keyboard } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const ShortcutsWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const SHORTCUTS = [
    { combo: '⌘ / Ctrl + K', label: 'Command Launcher' },
    { combo: '⌘ + Enter', label: 'Execute Weather Query' },
    { combo: 'Space', label: 'Start / Pause Countdown' },
    { combo: 'Alt + 1', label: 'Switch to Weather Agent' },
    { combo: 'Alt + 2', label: 'Switch to Utilities Surface' },
    { combo: 'Alt + 3', label: 'Split Workbench Canvas' },
  ];

  return (
    <WidgetFrame
      id="shortcuts"
      title="Studio Shortcuts"
      category="navigation"
      subtitle="Hotkeys"
      version="1.0.0"
      icon={<Command className="w-4 h-4 text-emerald-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-2.5">
        <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[180px]">
          {SHORTCUTS.map((sc, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 rounded-xl bg-white/5 text-xs"
            >
              <span className="text-white/70">{sc.label}</span>
              <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-white/90">
                {sc.combo}
              </kbd>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-white/40 text-center font-mono pt-1 border-t border-white/5">
          Standard Local Studio Keybindings
        </div>
      </div>
    </WidgetFrame>
  );
};
