/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * TaxonomyInspector: Interactive visualization of the AgentSam Widget System hierarchy & contracts.
 */

import React, { useState } from 'react';
import { 
  FolderTree, 
  ChevronRight, 
  ChevronDown, 
  Terminal, 
  Check, 
  Copy, 
  Layers, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { WIDGET_TAXONOMY, WIDGET_REGISTRY } from '@inneranimalmedia/agentsam-contracts/widgets';
import { useTheme } from '@inneranimalmedia/agentsam-themes';

export interface TaxonomyInspectorProps {
  onSelectWidget?: (widgetId: string) => void;
}

export const TaxonomyInspector: React.FC<TaxonomyInspectorProps> = ({ onSelectWidget }) => {
  const { activeTheme } = useTheme();
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>('countdown');
  const [copied, setCopied] = useState(false);

  const selectedDef = WIDGET_REGISTRY[selectedWidgetId] || WIDGET_REGISTRY['countdown'];

  const copyTree = () => {
    const treeText = `WIDGET SYSTEM
│
├── utility
│   ├── countdown
│   ├── clock
│   ├── calculator
│   └── quick controls
│
├── glance
│   ├── metrics
│   ├── jobs
│   ├── queues
│   └── runtime state
│
├── navigation
│   ├── launcher
│   ├── recent items
│   └── shortcuts
│
├── content
│   ├── list
│   ├── media
│   └── artifact preview
│
└── agent/runtime
    ├── active run
    ├── token/cost glance
    ├── queue status
    ├── approvals
    └── task progress`;

    navigator.clipboard.writeText(treeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24">
      <div 
        className="p-6 rounded-[24px] border"
        style={{
          background: activeTheme.glass.cardFill,
          backdropFilter: 'blur(36px)',
          borderColor: activeTheme.glass.cardBorder,
          boxShadow: activeTheme.glass.cardShadow
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-sky-300" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Widget System Architecture & Contract Registry
              </h2>
            </div>
            <p className="text-xs text-white/60 mt-1">
              Contract specifications exported under @inneranimalmedia/agentsam-contracts/widgets
            </p>
          </div>

          <button
            onClick={copyTree}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white flex items-center gap-1.5 transition-colors self-start md:self-auto"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy ASCII Tree</span>
          </button>
        </div>

        {/* 2-Column Split: ASCII Taxonomy Tree on Left, Selected Contract Spec on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          {/* Left: Interactive Tree */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Taxonomy Hierarchy
            </h3>

            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 font-mono text-xs text-white/80 space-y-3">
              <div className="text-sky-300 font-bold">WIDGET SYSTEM</div>

              {Object.entries(WIDGET_TAXONOMY).map(([catKey, catVal], catIndex) => {
                const isLastCat = catIndex === Object.keys(WIDGET_TAXONOMY).length - 1;
                const branchChar = isLastCat ? '└──' : '├──';
                const stemChar = isLastCat ? '   ' : '│  ';

                return (
                  <div key={catKey} className="space-y-1">
                    <div className="text-white/90 font-medium">
                      {branchChar} <span className="text-emerald-300">{catKey}</span>
                    </div>

                    <div className="space-y-0.5">
                      {catVal.widgetIds.map((wId, wIndex) => {
                        const isLastWidget = wIndex === catVal.widgetIds.length - 1;
                        const subBranch = isLastWidget ? '└──' : '├──';
                        const isSelected = selectedWidgetId === wId;

                        return (
                          <div
                            key={wId}
                            onClick={() => setSelectedWidgetId(wId)}
                            className={`cursor-pointer px-2 py-1 rounded transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'bg-sky-500/20 text-sky-200 font-semibold'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span>
                              {stemChar} {subBranch} {wId}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] text-sky-300 font-sans">Active</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Contract & Specs */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Contract Definition: {selectedDef.title}
            </h3>

            <div className="p-5 rounded-2xl bg-black/40 border border-white/5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-base font-semibold text-white">
                    {selectedDef.title}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
                    <span className="capitalize">{selectedDef.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>Version {selectedDef.version}</span>
                    <span aria-hidden="true">·</span>
                    <span>Size {selectedDef.defaultSize}</span>
                  </div>
                </div>

                {onSelectWidget && (
                  <button
                    onClick={() => onSelectWidget(selectedDef.id)}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/30 text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <p className="text-xs text-white/80 leading-relaxed">
                {selectedDef.description}
              </p>

              {/* Tag metadata */}
              <div>
                <div className="text-[11px] text-white/40 mb-1.5">Index Tags:</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedDef.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-white/5 text-white/70 font-mono text-[11px]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Contract Code Snippet */}
              <div className="pt-3 border-t border-white/10">
                <div className="text-[11px] text-white/40 mb-2 font-mono flex items-center justify-between">
                  <span>IMPORT CONTRACT</span>
                  <span className="text-emerald-400">VERIFIED</span>
                </div>
                <div className="p-3 rounded-xl bg-black/60 font-mono text-xs text-sky-200 overflow-x-auto">
                  <pre>{`import { WidgetFrame, ${selectedDef.id === 'countdown' ? 'useCountdown, CountdownWidget' : selectedDef.title.replace(/\s+/g, '') + 'Widget'} }
  from '@inneranimalmedia/agentsam-workbench/widgets';`}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
