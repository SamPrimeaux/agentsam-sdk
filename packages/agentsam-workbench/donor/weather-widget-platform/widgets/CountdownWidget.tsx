/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CountdownWidget: Consumes useCountdown with absolute deadline protection.
 * Tab sleep, background throttling, and OS suspend will never drift the target completion.
 */

import React, { useState } from 'react';
import { Play, Pause, RotateCcw, Bell, BellOff, Timer, Plus, Minus, Check } from 'lucide-react';
import { useCountdown } from './useCountdown';
import { WidgetFrame } from './WidgetFrame';

export interface CountdownWidgetProps {
  initialSeconds?: number;
  initialLabel?: string;
  className?: string;
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({
  initialSeconds = 1500, // 25 mins
  initialLabel = 'Agent Focus Sprint',
  className = ''
}) => {
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [customLabelInput, setCustomLabelInput] = useState(initialLabel);

  const countdown = useCountdown({
    initialSeconds,
    label: initialLabel,
    enableChime: chimeEnabled,
  });

  const PRESETS = [
    { label: '5m', seconds: 300 },
    { label: '15m', seconds: 900 },
    { label: '25m', seconds: 1500 },
    { label: '45m', seconds: 2700 },
    { label: '60m', seconds: 3600 },
  ];

  // Calculate human readable deadline string
  const deadlineString = countdown.deadlineMs
    ? new Date(countdown.deadlineMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const handleSaveLabel = (e: React.FormEvent) => {
    e.preventDefault();
    countdown.setLabel(customLabelInput.trim() || 'Focus Sprint');
    setIsEditingLabel(false);
  };

  return (
    <WidgetFrame
      id="countdown"
      title="Countdown Timer"
      category="utility"
      subtitle="Absolute Deadline"
      version="1.2.0"
      icon={<Timer className="w-4 h-4" />}
      actions={
        <button
          onClick={() => setChimeEnabled(!chimeEnabled)}
          title={chimeEnabled ? "Chime enabled on finish" : "Chime muted"}
          className={`p-1.5 rounded-md transition-colors ${
            chimeEnabled ? 'text-emerald-300 hover:bg-white/10' : 'text-white/30 hover:bg-white/10'
          }`}
        >
          {chimeEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </button>
      }
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-4">
        {/* Sprint Label / Goal */}
        <div className="flex items-center justify-between">
          {isEditingLabel ? (
            <form onSubmit={handleSaveLabel} className="flex items-center gap-1.5 w-full">
              <input
                type="text"
                value={customLabelInput}
                onChange={(e) => setCustomLabelInput(e.target.value)}
                autoFocus
                className="bg-black/30 border border-white/20 rounded-md px-2.5 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:border-sky-400 w-full"
                placeholder="Name your focus sprint..."
              />
              <button
                type="submit"
                className="p-1.5 bg-white/15 hover:bg-white/25 rounded-md text-white transition-colors"
              >
                <Check className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between w-full">
              <button
                onClick={() => {
                  setCustomLabelInput(countdown.label);
                  setIsEditingLabel(true);
                }}
                className="text-left text-xs font-medium text-white/70 hover:text-white transition-colors group flex items-center gap-1.5 truncate"
                title="Click to rename"
              >
                <span className="truncate">{countdown.label}</span>
                <span className="text-[10px] text-white/30 group-hover:text-white/60">✎</span>
              </button>

              <div className="text-[11px] font-mono tabular-nums text-white/45">
                {countdown.isRunning ? (
                  <span className="text-emerald-300/90 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Target {deadlineString}
                  </span>
                ) : countdown.isPaused ? (
                  <span className="text-amber-300/90">Paused</span>
                ) : countdown.isCompleted ? (
                  <span className="text-sky-300/90">Sprint Complete</span>
                ) : (
                  <span>Ready</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Big Tabular Numeric Display */}
        <div className="my-1 flex flex-col items-center justify-center">
          <div className="text-[52px] sm:text-[60px] font-mono tabular-nums font-light text-white tracking-tighter leading-none select-none drop-shadow-md">
            {countdown.formattedTime}
          </div>

          {/* Hairline Progress Gauge */}
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-4">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                countdown.isCompleted
                  ? 'bg-emerald-400'
                  : countdown.percentRemaining < 15
                  ? 'bg-amber-400'
                  : 'bg-sky-400'
              }`}
              style={{ width: `${countdown.percentRemaining}%` }}
            />
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => countdown.setPreset(preset.seconds)}
              disabled={countdown.isRunning}
              className="px-2.5 py-1 text-[11px] font-mono tabular-nums rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white disabled:opacity-35 transition-colors"
            >
              {preset.label}
            </button>
          ))}
          <div className="h-3 w-px bg-white/10 mx-0.5" />
          <button
            onClick={() => countdown.setPreset(Math.max(60, countdown.remainingSeconds - 60))}
            disabled={countdown.isRunning}
            title="-1 minute"
            className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-white/60 hover:text-white disabled:opacity-35 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={() => countdown.setPreset(countdown.remainingSeconds + 60)}
            disabled={countdown.isRunning}
            title="+1 minute"
            className="p-1 rounded-md bg-white/5 hover:bg-white/15 text-white/60 hover:text-white disabled:opacity-35 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          {countdown.isRunning ? (
            <button
              onClick={countdown.pause}
              className="flex-1 py-2 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          ) : countdown.isPaused ? (
            <button
              onClick={countdown.resume}
              className="flex-1 py-2 px-3 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-500/30 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </button>
          ) : (
            <button
              onClick={() => countdown.start()}
              className="flex-1 py-2 px-3 bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Countdown</span>
            </button>
          )}

          <button
            onClick={() => countdown.reset()}
            title="Reset timer"
            className="p-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </WidgetFrame>
  );
};
