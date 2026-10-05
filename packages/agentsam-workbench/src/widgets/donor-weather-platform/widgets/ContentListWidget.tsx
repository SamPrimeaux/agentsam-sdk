/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ContentListWidget: Structured task checklist with progress and priority badges.
 */

import React, { useState } from 'react';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const ContentListWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [items, setItems] = useState([
    { id: '1', text: 'Configure Open-Meteo multi-city ingestion', completed: true, prio: 'high' },
    { id: '2', text: 'Validate absolute deadline timer drift resistance', completed: true, prio: 'high' },
    { id: '3', text: 'Implement /widgets utilities surface taxonomy', completed: true, prio: 'med' },
    { id: '4', text: 'Deploy human approval gate for high-cost LLM calls', completed: false, prio: 'med' },
    { id: '5', text: 'Audit p95 latency under high-concurrency weather requests', completed: false, prio: 'low' },
  ]);
  const [newText, setNewText] = useState('');

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), text: newText.trim(), completed: false, prio: 'med' }
    ]);
    setNewText('');
  };

  const completedCount = items.filter((i) => i.completed).length;
  const progressPercent = Math.round((completedCount / (items.length || 1)) * 100);

  return (
    <WidgetFrame
      id="list"
      title="Task Checklist"
      category="content"
      subtitle={`${completedCount}/${items.length} Done`}
      version="1.0.0"
      icon={<CheckSquare className="w-4 h-4 text-emerald-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Progress header */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">Sprint Checklist</span>
          <span className="font-mono tabular-nums text-emerald-300 font-medium">{progressPercent}%</span>
        </div>
        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
          <div className="bg-emerald-400 h-full rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Task list items */}
        <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[160px] pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className="flex items-start gap-2.5 p-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors group select-none text-xs"
            >
              <button className="mt-0.5 text-white/50 group-hover:text-white shrink-0">
                {item.completed ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 text-white/30" />
                )}
              </button>
              <span className={`flex-1 leading-snug ${item.completed ? 'line-through text-white/40' : 'text-white/90'}`}>
                {item.text}
              </span>
              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0 ${
                item.prio === 'high' ? 'text-rose-300 bg-rose-500/10' : 'text-white/40 bg-white/5'
              }`}>
                {item.prio}
              </span>
            </div>
          ))}
        </div>

        {/* Quick add form */}
        <form onSubmit={addItem} className="flex items-center gap-1.5 pt-1 border-t border-white/5">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add task to list..."
            className="flex-1 bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="p-1.5 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-500/30 rounded-lg disabled:opacity-30 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>
    </WidgetFrame>
  );
};
