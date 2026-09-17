/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BoxSelect,
  ChevronDown,
  FastForward,
  Grab,
  History,
  Info,
  Loader2,
  MousePointer2,
  RotateCcw,
  Send,
  Settings2,
  Thermometer,
  X
} from 'lucide-react';
import React, { useState } from 'react';
import { LogOverlay } from '../../App';
import { DetectedItem, DetectType, LogEntry } from '../../types';

interface EmbodiedReasoningPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (prompt: string, type: DetectType, temperature: number, enableThinking: boolean, modelId: string) => void;
  onPickup: () => void;
  isLoading: boolean;
  hasDetectedItems: boolean;
  logs: LogEntry[];
  onOpenLog: (log: LogEntry) => void;
  isDarkMode: boolean;
  isPickingUp?: boolean;
  playbackSpeed?: number;
}

export function EmbodiedReasoningPanel({
  isOpen,
  onClose,
  onSend,
  onPickup,
  isLoading,
  hasDetectedItems,
  logs,
  onOpenLog,
  isDarkMode,
  isPickingUp = false,
  playbackSpeed = 1
}: EmbodiedReasoningPanelProps) {
  const [prompt, setPrompt] = useState('red cubes');
  const [type, setType] = useState<DetectType>('2D bounding boxes');
  const [temperature, setTemperature] = useState(0.1);
  const [enableThinking, setEnableThinking] = useState(true);
  const [showSettings, setShowSettings] = useState(true);
  const [modelId, setModelId] = useState('gemini-robotics-er-2-preview');

  if (!isOpen) return null;

  const panelBase = isDarkMode
    ? 'bg-slate-900/85 border-white/10 text-slate-100 shadow-slate-950/40'
    : 'bg-white/85 border-slate-200 text-slate-800 shadow-slate-200/40';
  const headerBorder = isDarkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-white/40';
  const inputBg = isDarkMode
    ? 'bg-slate-950 border-white/5 text-slate-100 focus:ring-indigo-400/20 shadow-none'
    : 'bg-white/60 border-slate-200 text-slate-800 focus:ring-indigo-500/5 shadow-inner';
  const selectorBg = isDarkMode ? 'bg-slate-800/40 border-white/5' : 'bg-slate-100/60 border-slate-200/50';
  const selectorActive = isDarkMode ? 'bg-slate-700 text-indigo-400' : 'bg-white text-indigo-600 shadow-sm';
  const logCardBg = isDarkMode
    ? 'bg-white/5 border-white/5 hover:bg-white/10'
    : 'bg-white/50 border-slate-100 hover:bg-white hover:shadow-md';

  return (
    <div
      id="embodied-reasoning-sidebar"
      className={`absolute top-20 bottom-8 left-4 right-4 min-[660px]:left-auto min-[660px]:right-8 min-[660px]:w-96 glass-panel rounded-[2rem] flex flex-col z-30 overflow-hidden shadow-2xl transition-all border ${panelBase}`}
    >
      {/* Header */}
      <div className={`p-6 border-b flex justify-between items-center ${headerBorder}`}>
        <div className="flex items-center gap-3 w-full">
          <div className="w-full pr-3">
            <h2 className="text-base font-bold leading-none mb-2.5">Embodied Reasoning</h2>
            <div className="relative">
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className={`appearance-none w-full rounded-xl border px-3 py-1.5 pr-8 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer ${inputBg} ${
                  isDarkMode ? 'border-white/10' : 'border-slate-200/80'
                }`}
              >
                <option value="gemini-robotics-er-2-preview">gemini-robotics-er-2-preview</option>
                <option value="gemini-flash-latest">gemini-flash-latest</option>
              </select>
              <ChevronDown
                className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                  isDarkMode ? 'text-slate-400' : 'text-slate-500'
                }`}
              />
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-200/20 rounded-full transition-colors text-slate-400 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-2 pb-5 space-y-3">
        {/* Detection Type Selector */}
        <section className="space-y-1">
          <div className={`p-1 rounded-xl flex border ${selectorBg}`}>
            {(['2D bounding boxes', 'Points'] as DetectType[]).map(t => {
              const isActive = type === t;

              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  title={
                    t === '2D bounding boxes'
                      ? 'Boxes: Identify all objects within rectangular regions'
                      : 'Points: Pinpoint the exact interaction coordinates'
                  }
                  className={`flex-1 py-2 rounded-lg flex flex-col items-center gap-1 transition-all ${
                    isActive ? selectorActive : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  {t === '2D bounding boxes' && <BoxSelect className="w-3.5 h-3.5" />}
                  {t === 'Points' && <MousePointer2 className="w-3.5 h-3.5" />}
                  <span className="text-[9px] font-bold uppercase tracking-tight">
                    {t === '2D bounding boxes' ? 'Boxes' : 'Points'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Prompt Input & Action Row */}
        <section className="space-y-2">
          <div className="relative group">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              className={`w-full rounded-xl px-3.5 py-2.5 pr-10 text-xs focus:outline-none transition-all resize-none h-12 border ${inputBg}`}
              placeholder="Describe targets..."
            />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`absolute top-1/2 right-2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                showSettings
                  ? isDarkMode
                    ? 'text-indigo-400 bg-white/10'
                    : 'text-indigo-600 bg-slate-200'
                  : isDarkMode
                  ? 'text-slate-500 hover:text-slate-300'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Toggle Model Settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Configuration Controls */}
          {showSettings && (
            <div
              className={`flex items-center justify-between gap-3 px-2 py-1.5 animate-in slide-in-from-top-2 fade-in duration-200 ${
                isDarkMode ? 'bg-slate-800/30 rounded-xl' : 'bg-slate-50/70 rounded-xl'
              }`}
            >
              <div className="flex-1 flex flex-col gap-1 p-1">
                <div className="flex justify-between items-end">
                  <div
                    className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <Thermometer className="w-3 h-3" />
                    <span>Temp</span>
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold ${
                      isDarkMode ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {temperature}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:bg-slate-700"
                />
              </div>

              <div
                className="flex items-center gap-1.5 pt-2 p-1"
                title="Thinking enables reasoning for complex perception tasks."
              >
                <input
                  type="checkbox"
                  id="thinking-toggle-panel"
                  checked={enableThinking}
                  onChange={e => setEnableThinking(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label
                  htmlFor="thinking-toggle-panel"
                  className={`text-[9px] font-bold uppercase tracking-wider cursor-pointer select-none ${
                    isDarkMode ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  Thinking
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onSend(prompt, type, temperature, enableThinking, modelId)}
              disabled={isLoading || !prompt.trim()}
              title="Detect: Trigger Gemini embodied perception"
              className={`flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                isLoading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                  : 'bg-slate-900 text-white hover:bg-black shadow-lg active:scale-[0.98] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
              }`}
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isLoading ? 'Detecting' : 'Detect'}
            </button>

            <button
              onClick={() => {
                onPickup();
                if (window.innerWidth < 660) {
                  onClose();
                }
              }}
              disabled={(!hasDetectedItems && !isPickingUp) || isLoading}
              title={
                isPickingUp
                  ? `Click to speed up simulation (Current: ${playbackSpeed}x)`
                  : 'Start pickup sequence for detected items'
              }
              className={`flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.98] ${
                (!hasDetectedItems && !isPickingUp) || isLoading
                  ? isDarkMode
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed shadow-none'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                  : isPickingUp
                  ? isDarkMode
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/10'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'
                  : isDarkMode
                  ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/10'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100'
              }`}
            >
              {isPickingUp ? (
                <>
                  <FastForward className="w-3.5 h-3.5" />
                  <span>Fast Forward {playbackSpeed > 1 ? `(${playbackSpeed}x)` : ''}</span>
                </>
              ) : (
                <>
                  <Grab className="w-3.5 h-3.5" />
                  <span>Pickup</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* History / Logs Section */}
        <section className="space-y-2 pt-1">
          <div className="flex items-center gap-2 px-1">
            <History className="w-3.5 h-3.5 text-slate-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              API Call History
            </h3>
          </div>

          <div className="space-y-2">
            {logs.length === 0 ? (
              <div
                className={`text-center py-6 border-2 border-dashed rounded-2xl text-xs italic ${
                  isDarkMode ? 'border-white/5 text-slate-600' : 'border-slate-100 text-slate-400'
                }`}
              >
                No perception runs yet
              </div>
            ) : (
              logs.map(log => {
                const typeLabel =
                  log.type === '2D bounding boxes' ? 'Bounding Boxes' : log.type.split(' ')[0];
                const itemResult = log.result as DetectedItem[] | null;
                const errorResult = log.result as { error: string } | null;
                const errorMessage = errorResult?.error;

                return (
                  <div
                    key={log.id}
                    onClick={() => onOpenLog(log)}
                    className={`group flex gap-3 p-2.5 border rounded-xl transition-all cursor-pointer ${logCardBg}`}
                  >
                    <div
                      className={`relative w-16 rounded-lg overflow-hidden shrink-0 border self-start ${
                        isDarkMode ? 'bg-slate-950 border-white/5' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <img src={log.imageSrc} className="w-full h-auto block" alt="Log" />
                      <LogOverlay log={log} />
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[9px] font-bold text-slate-400">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span
                          className={`text-[8px] font-bold px-1 py-0.2 rounded uppercase tracking-tight ${
                            isDarkMode
                              ? 'bg-white/5 text-slate-400'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {typeLabel}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] font-semibold truncate ${
                          isDarkMode ? 'text-slate-200' : 'text-slate-700'
                        }`}
                      >
                        {log.prompt}
                      </p>
                      {log.result === null ? (
                        <div className="flex items-center gap-1.5 text-indigo-400 mt-1 text-[9px] font-bold">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Detecting...</span>
                        </div>
                      ) : errorMessage ? (
                        <div className="flex items-center justify-between mt-1 gap-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[9px] font-bold text-red-500 truncate">Failed</span>
                            <div className="group/info relative shrink-0" title={errorMessage}>
                              <Info className="w-3 h-3 text-red-400/80 hover:text-red-500 cursor-help" />
                            </div>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onSend(log.prompt, log.type as DetectType, temperature, enableThinking, modelId);
                            }}
                            className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold transition-all ${
                              isDarkMode
                                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Retry</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-400 font-mono mt-1 truncate">
                          {Array.isArray(itemResult) ? itemResult.length : 0} items detected
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
