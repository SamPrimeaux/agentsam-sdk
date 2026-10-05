/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GlanceJobsWidget: Scheduled cron runs, background tasks, and trigger actions.
 */

import React, { useState } from 'react';
import { CalendarClock, Play, CheckCircle2, RefreshCw } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const GlanceJobsWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [jobs, setJobs] = useState([
    { id: 'job-1', name: 'Open-Meteo Cache Sync', cron: '*/15 * * * *', status: 'success', nextRun: 'in 4m', running: false },
    { id: 'job-2', name: 'Radar Tile Ingest', cron: '0 * * * *', status: 'success', nextRun: 'in 42m', running: false },
    { id: 'job-3', name: 'Telemetry Log Roll', cron: '0 0 * * *', status: 'idle', nextRun: 'in 8h', running: false },
  ]);

  const handleRunNow = (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, running: true, status: 'running' } : j))
    );

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, running: false, status: 'success', nextRun: 'just now' } : j))
      );
    }, 1200);
  };

  return (
    <WidgetFrame
      id="jobs"
      title="Scheduled Jobs"
      category="glance"
      subtitle="Cron Tasks"
      version="1.0.0"
      icon={<CalendarClock className="w-4 h-4 text-sky-400" />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate flex items-center gap-1.5">
                  <span>{job.name}</span>
                  {job.status === 'success' && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/45 font-mono mt-0.5">
                  <span>{job.cron}</span>
                  <span>·</span>
                  <span className="text-white/60">{job.nextRun}</span>
                </div>
              </div>

              <button
                onClick={() => handleRunNow(job.id)}
                disabled={job.running}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 shrink-0 transition-colors disabled:opacity-40"
              >
                {job.running ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Running</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/5">
          <span>Active Workers: 3 / 8</span>
          <span className="text-emerald-300 font-mono">Scheduler Online</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
