/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RecentItemsWidget: Historical weather sessions, queries, and dashboard artifacts.
 */

import React from 'react';
import { History, Cloud, BarChart2, Clock, ArrowUpRight } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export interface RecentItemsWidgetProps {
  onSelectQuery?: (query: string) => void;
  className?: string;
}

export const RecentItemsWidget: React.FC<RecentItemsWidgetProps> = ({
  onSelectQuery,
  className = ''
}) => {
  const ITEMS = [
    { id: '1', title: 'Boston, New York, Seattle weather compare', type: 'query', time: '12m ago', query: 'Compare weather in Boston, New York and Seattle last month' },
    { id: '2', title: 'Kansas City windiest day record 2026', type: 'query', time: '1h ago', query: 'What was the windiest day in Kansas City this year?' },
    { id: '3', title: 'Los Angeles precipitation forecast', type: 'query', time: '3h ago', query: 'How much rain did Los Angeles get last month?' },
    { id: '4', title: 'Tokyo 7-Day Temperature Composed Chart', type: 'dashboard', time: 'Yesterday', query: 'Show 7-day temperature in Tokyo' },
  ];

  return (
    <WidgetFrame
      id="recent-items"
      title="Recent Items"
      category="navigation"
      subtitle="History"
      version="1.0.0"
      icon={<History className="w-4 h-4 text-purple-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-2.5">
        <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[180px]">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectQuery?.(item.query)}
              className="w-full text-left p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1 rounded-md bg-white/5 text-white/50 group-hover:text-white shrink-0">
                  {item.type === 'query' ? <Cloud className="w-3.5 h-3.5" /> : <BarChart2 className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white truncate group-hover:text-sky-200">
                    {item.title}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-white/40 mt-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{item.time}</span>
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white shrink-0 ml-1.5" />
            </button>
          ))}
        </div>

        <div className="text-[10px] text-white/40 text-center font-mono pt-1 border-t border-white/5">
          Click to re-run query in Weather Agent
        </div>
      </div>
    </WidgetFrame>
  );
};
