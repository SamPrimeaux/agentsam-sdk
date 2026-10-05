/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GitHubActivityWidget: Repository PR status, checks, branch sync, and commit feed.
 */

import React, { useState, useEffect } from 'react';
import { GitBranch, GitPullRequest, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import { WidgetFrame, WidgetFrameProps } from './WidgetFrame';
import { WidgetDataEnvelope } from '../../contracts/widgets';

export interface GitHubActivityWidgetProps extends Partial<WidgetFrameProps> {
  className?: string;
}

export const GitHubActivityWidget: React.FC<GitHubActivityWidgetProps> = ({ 
  className = '',
  ...frameProps
}) => {
  const [envelope, setEnvelope] = useState<WidgetDataEnvelope<any>>({
    status: 'ready',
    updatedAt: Date.now(),
    data: {
      repo: 'inneranimalmedia/agentsam',
      branch: 'main',
      openPRs: [
        { number: 42, title: 'Widget contracts & physics gesture handler pass', author: 'agent-sam', status: 'checks_passed' }
      ],
      ciStatus: 'success',
      lastCommit: 'feat: centralized gesture handler with spring dynamics'
    },
    source: 'github://api'
  });

  return (
    <WidgetFrame
      id="github-activity"
      title="GitHub Activity"
      category="glance"
      subtitle={envelope.data?.repo || "Repository"}
      version="1.0.0"
      icon={<GitBranch className="w-4 h-4 text-purple-400" />}
      className={className}
      {...frameProps}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-300" />
            <span className="text-xs font-semibold text-white">{envelope.data?.branch || 'main'}</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> CI Passing
          </span>
        </div>

        {/* PR List */}
        <div className="space-y-1.5 flex-1">
          {(envelope.data?.openPRs || []).map((pr: any) => (
            <div key={pr.number} className="p-2 rounded-xl bg-black/20 border border-white/5 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <GitPullRequest className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-white truncate font-medium">#{pr.number} {pr.title}</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-300 shrink-0 ml-2">All Checks OK</span>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-white/40 font-mono pt-1 border-t border-white/5 truncate">
          Latest: {envelope.data?.lastCommit}
        </div>
      </div>
    </WidgetFrame>
  );
};
