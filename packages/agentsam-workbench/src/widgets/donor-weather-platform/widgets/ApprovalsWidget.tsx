/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ApprovalsWidget: Human-in-the-loop review requests for external API calls, file writes, and budget gates.
 */

import React, { useState } from 'react';
import { ShieldAlert, Check, X, AlertTriangle, ShieldCheck } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';
import { ApprovalRequest } from '@inneranimalmedia/agentsam-contracts/widgets';

export const ApprovalsWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [requests, setRequests] = useState<ApprovalRequest[]>([
    {
      id: 'appr-1',
      title: 'Open-Meteo High-Resolution 15-Minute Grid Ingest',
      description: 'Agent requests 48-hour sub-hourly precipitation dataset across 3 major metropolitan areas.',
      risk: 'medium',
      requester: 'WeatherOrchestrator',
      timestamp: '2m ago',
      status: 'pending',
      payloadSummary: 'Coordinates: 40.71, -74.00 · Variables: 14'
    },
    {
      id: 'appr-2',
      title: 'Write Forecast Artifact to Workbench Cache',
      description: 'Persist normalized weather schema to indexed client storage.',
      risk: 'low',
      requester: 'LocalStudioBridge',
      timestamp: '14m ago',
      status: 'approved',
      payloadSummary: 'Size: 18.4 KB'
    }
  ]);

  const handleAction = (id: string, status: 'approved' | 'rejected') => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <WidgetFrame
      id="approvals"
      title="Human Approvals"
      category="agent/runtime"
      subtitle={`${pendingCount} Pending`}
      version="1.1.0"
      icon={<ShieldAlert className={`w-4 h-4 ${pendingCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />}
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Approvals list */}
        <div className="space-y-2 flex-1 overflow-y-auto max-h-[190px]">
          {requests.map((req) => (
            <div
              key={req.id}
              className={`p-3 rounded-xl border transition-all ${
                req.status === 'pending'
                  ? 'bg-white/5 border-amber-500/20'
                  : req.status === 'approved'
                  ? 'bg-emerald-500/5 border-emerald-500/15 opacity-75'
                  : 'bg-rose-500/5 border-rose-500/15 opacity-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded font-semibold ${
                      req.risk === 'high'
                        ? 'text-rose-300 bg-rose-500/20'
                        : req.risk === 'medium'
                        ? 'text-amber-300 bg-amber-500/20'
                        : 'text-sky-300 bg-sky-500/20'
                    }`}>
                      {req.risk} risk
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">
                      by {req.requester}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-white mt-1 truncate">
                    {req.title}
                  </h4>
                  <p className="text-[11px] text-white/60 leading-relaxed mt-0.5 line-clamp-2">
                    {req.description}
                  </p>
                  {req.payloadSummary && (
                    <div className="text-[10px] font-mono text-white/40 mt-1">
                      {req.payloadSummary}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {req.status === 'pending' ? (
                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-white/5">
                  <button
                    onClick={() => handleAction(req.id, 'approved')}
                    className="flex-1 py-1.5 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'rejected')}
                    className="flex-1 py-1.5 px-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/20 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              ) : (
                <div className="mt-2 pt-1 border-t border-white/5 text-[10px] font-mono flex items-center gap-1">
                  {req.status === 'approved' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Approved by Human Operator
                    </span>
                  ) : (
                    <span className="text-rose-400">Rejected</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/40 font-mono pt-1 border-t border-white/5">
          <span>HUMAN-IN-THE-LOOP ACTIVE</span>
          <span className="text-emerald-400">POLICY ENFORCED</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
