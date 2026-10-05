/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ArtifactPreviewWidget: Code and contract inspector for AgentSam Workbench widgets.
 */

import React, { useState } from 'react';
import { FileCode2, Copy, Check, ExternalLink } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const ArtifactPreviewWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'contracts' | 'countdown' | 'manifest'>('contracts');

  const SNIPPETS = {
    contracts: `// @inneranimalmedia/agentsam-contracts/widgets
export interface CountdownWidgetState {
  deadlineMs: number | null;
  initialDurationSeconds: number;
  remainingMs: number;
  status: 'idle' | 'running' | 'paused' | 'completed';
  label: string;
  lastUpdated: number;
}`,
    countdown: `// @inneranimalmedia/agentsam-workbench/widgets
// Absolute deadline hook avoids interval drift
export function useCountdown({ initialSeconds = 1500 }) {
  const tick = useCallback(() => {
    const diff = Math.max(0, deadlineMs - Date.now());
    setRemainingMs(diff);
  }, [deadlineMs]);
  // visibilitychange listener ensures instant wakeup
}`,
    manifest: `{
  "widgetSystem": "AgentSam Studio v2.0",
  "taxonomy": ["utility", "glance", "navigation", "content", "agent/runtime", "weather"],
  "deadlineImmunity": true,
  "appNativeSurface": "/widgets"
}`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(SNIPPETS[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <WidgetFrame
      id="artifact-preview"
      title="Artifact Preview"
      category="content"
      subtitle="TypeScript Contracts"
      version="1.0.0"
      icon={<FileCode2 className="w-4 h-4 text-amber-400" />}
      actions={
        <button
          onClick={handleCopy}
          title="Copy snippet"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      }
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-2.5">
        {/* Tab switchers */}
        <div className="flex items-center gap-1 p-1 bg-black/30 rounded-lg">
          <button
            onClick={() => setActiveTab('contracts')}
            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
              activeTab === 'contracts' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            contracts/widgets
          </button>
          <button
            onClick={() => setActiveTab('countdown')}
            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
              activeTab === 'countdown' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            useCountdown.ts
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
              activeTab === 'manifest' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            manifest.json
          </button>
        </div>

        {/* Code display */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-white/80 leading-relaxed overflow-x-auto max-h-[170px]">
          <pre>{SNIPPETS[activeTab]}</pre>
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/40 font-mono pt-1 border-t border-white/5">
          <span>ESM MODULE · STRICT TYPES</span>
          <span className="text-emerald-400">BUILD VERIFIED</span>
        </div>
      </div>
    </WidgetFrame>
  );
};
