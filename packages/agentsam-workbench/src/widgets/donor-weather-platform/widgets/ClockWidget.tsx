/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ClockWidget: World & precision clock with timezone selector, UTC offset, and live seconds.
 */

import React, { useState, useEffect } from 'react';
import { Clock as ClockIcon, Globe, Sun, Moon } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

const TIMEZONES = [
  { label: 'Local System', tz: '' },
  { label: 'UTC Universal', tz: 'UTC' },
  { label: 'New York (EDT/EST)', tz: 'America/New_York' },
  { label: 'San Francisco (PDT/PST)', tz: 'America/Los_Angeles' },
  { label: 'London (BST/GMT)', tz: 'Europe/London' },
  { label: 'Tokyo (JST)', tz: 'Asia/Tokyo' },
  { label: 'Sydney (AEST)', tz: 'Australia/Sydney' },
];

export const ClockWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [selectedTz, setSelectedTz] = useState('');
  const [time, setTime] = useState(new Date());
  const [is24Hour, setIs24Hour] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const tzOption = selectedTz ? { timeZone: selectedTz } : undefined;

  const timeString = time.toLocaleTimeString('en-US', {
    ...tzOption,
    hour12: !is24Hour,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = time.toLocaleDateString('en-US', {
    ...tzOption,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Calculate UTC offset
  const utcHour = time.getUTCHours();
  const currentHour = selectedTz
    ? parseInt(new Intl.DateTimeFormat('en-US', { ...tzOption, hour: 'numeric', hour12: false }).format(time), 10)
    : time.getHours();
  const isDaytime = currentHour >= 6 && currentHour < 18;

  return (
    <WidgetFrame
      id="clock"
      title="Precision Clock"
      category="utility"
      subtitle={selectedTz || "Local"}
      version="1.0.0"
      icon={<ClockIcon className="w-4 h-4" />}
      actions={
        <button
          onClick={() => setIs24Hour(!is24Hour)}
          title="Toggle 12h / 24h format"
          className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 text-white/70 hover:text-white"
        >
          {is24Hour ? '24H' : '12H'}
        </button>
      }
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Timezone picker */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-white/50">
            <Globe className="w-3.5 h-3.5" />
            <select
              value={selectedTz}
              onChange={(e) => setSelectedTz(e.target.value)}
              className="bg-transparent text-white/80 hover:text-white focus:outline-none cursor-pointer text-xs"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.label} value={tz.tz} className="bg-slate-900 text-white">
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-white/40">
            {isDaytime ? <Sun className="w-3 h-3 text-amber-300" /> : <Moon className="w-3 h-3 text-sky-200" />}
            <span>{isDaytime ? 'Daylight' : 'Night'}</span>
          </div>
        </div>

        {/* Tabular Time Display */}
        <div className="flex flex-col items-center justify-center my-1">
          <div className="text-[44px] sm:text-[48px] font-mono tabular-nums font-light text-white tracking-tight leading-none drop-shadow-md">
            {timeString}
          </div>
          <div className="text-xs text-white/55 font-medium tracking-wide mt-2">
            {dateString}
          </div>
        </div>

        {/* World Glance Bar */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/5 text-center">
          <div className="px-2 py-1.5 rounded-lg bg-white/5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">UTC</div>
            <div className="text-xs font-mono tabular-nums text-white/80 mt-0.5">
              {time.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-white/5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">London</div>
            <div className="text-xs font-mono tabular-nums text-white/80 mt-0.5">
              {time.toLocaleTimeString('en-US', { timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-white/5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">Tokyo</div>
            <div className="text-xs font-mono tabular-nums text-white/80 mt-0.5">
              {time.toLocaleTimeString('en-US', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
};
