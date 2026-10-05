/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LauncherWidget: Fast command palette and query launcher for AgentSam Workbench.
 */

import React, { useState } from 'react';
import { Compass, Search, ArrowRight, CloudRain, Cpu, Terminal, Sparkles } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export interface LauncherWidgetProps {
  onExecuteCommand?: (cmd: string) => void;
  className?: string;
}

export const LauncherWidget: React.FC<LauncherWidgetProps> = ({
  onExecuteCommand,
  className = ''
}) => {
  const [filter, setFilter] = useState('');

  const COMMANDS = [
    { id: '1', title: 'Fetch New York Weather Radar', cat: 'weather', icon: <CloudRain className="w-3.5 h-3.5 text-sky-400" />, action: 'What is the current weather in New York?' },
    { id: '2', title: 'Compare Seattle vs London Rain', cat: 'weather', icon: <CloudRain className="w-3.5 h-3.5 text-sky-400" />, action: 'Compare precipitation in Seattle and London this week' },
    { id: '3', title: 'Inspect Active LLM Token Usage', cat: 'agent', icon: <Cpu className="w-3.5 h-3.5 text-purple-400" />, action: 'inspect:tokens' },
    { id: '4', title: 'Trigger Open-Meteo Cache Purge', cat: 'system', icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />, action: 'system:purge-cache' },
    { id: '5', title: 'Generate Weekend Weather Report', cat: 'agent', icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />, action: 'Generate weekend weather report for Tokyo' },
  ];

  const filtered = COMMANDS.filter((c) =>
    c.title.toLowerCase().includes(filter.toLowerCase()) ||
    c.cat.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <WidgetFrame
      id="launcher"
      title="Command Launcher"
      category="navigation"
      subtitle="Quick Dispatch"
      version="1.0.0"
      icon={<Compass className="w-4 h-4 text-sky-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search commands or launch intent..."
            className="w-full bg-black/30 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-sky-400 transition-colors"
          />
        </div>

        {/* Command list */}
        <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[170px]">
          {filtered.length === 0 ? (
            <div className="text-white/30 text-xs text-center py-4">No matching commands</div>
          ) : (
            filtered.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => onExecuteCommand?.(cmd.action)}
                className="w-full text-left p-2 rounded-xl bg-white/5 hover:bg-white/15 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1 rounded-lg bg-black/20 shrink-0">
                    {cmd.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate group-hover:text-sky-200">
                      {cmd.title}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono capitalize">
                      {cmd.cat}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>
            ))
          )}
        </div>

        <div className="text-[10px] text-white/40 text-center font-mono pt-1 border-t border-white/5">
          Press ⌘K or click command to dispatch
        </div>
      </div>
    </WidgetFrame>
  );
};
