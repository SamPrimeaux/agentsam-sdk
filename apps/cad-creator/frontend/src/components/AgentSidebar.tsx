import React, { useRef, useState } from 'react';
import { Send, AlertTriangle } from 'lucide-react';
import type { CadSelectionContext } from '../lib/agentsam-preview-bridge';
import type { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';
import { proposeWallHeight } from '../lib/cad/selection';

/**
 * Side Assistant — surface of the host-owned AgentSam conversation.
 * No canned greeting, no hardcoded provider, no /api/plan/generate auto-apply.
 * Embedded: requests travel via the validated preview bridge to Local Studio.
 * Standalone without a host: shows a real connection failure, never a fake reply.
 * Geometry changes require Request -> Proposal -> Approval -> canonical tool.
 */
interface Props {
  project?: unknown;
  selection?: CadSelectionContext | null;
  embedded?: boolean;
  postToHost?: (msg: { type: 'assistant.request'; request_id: string; prompt: string; selection: CadSelectionContext | null }) => void;
  onApproveProposal?: (proposal: ReturnType<typeof proposeWallHeight>) => void;
  onOpenVeoModal?: () => void; onOpenImageGenModal?: () => void; onOpenSketchModal?: () => void;
  onApplyPlan?: (plan: Partial<ProjectState>) => void; userRole?: string;
}
interface Msg { id: string; role: 'user' | 'agent' | 'error'; text: string }

export const AgentSidebar: React.FC<Props> = ({ selection, embedded = false, postToHost, onApproveProposal }) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [heightIn, setHeightIn] = useState('');
  const seq = useRef(0);
  React.useEffect(() => {
    const onResp = (e: Event) => { setPending(false); setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'agent', text: String((e as CustomEvent).detail || '') }]); };
    window.addEventListener('agentsam:cad-assistant-response', onResp);
    return () => window.removeEventListener('agentsam:cad-assistant-response', onResp);
  }, []);

  const send = () => {
    const prompt = input.trim(); if (!prompt || pending) return;
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: prompt }]); setInput('');
    if (!embedded || !postToHost) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'error', text: 'AgentSam host is not connected. Open CAD Creator inside Local Studio, or reconnect the host session, then retry. Nothing was sent and no change was made.' }]);
      return;
    }
    setPending(true);
    const rid = `cad-${++seq.current}-${Date.now()}`;
    postToHost({ type: 'assistant.request', request_id: rid, prompt, selection: selection ?? null });
    window.setTimeout(() => { setPending((was) => { if (was) setMessages((m) => [...m, { id: `to${Date.now()}`, role: 'error', text: 'No host conversation response yet. The Local Studio conversation may be unavailable; your message was not answered and no change was made.' }]); return false; }); }, 15000);
  };

  const proposal = selection?.object.type === 'wall' && Number(heightIn) > 0
    ? (() => { try { return proposeWallHeight(selection, 96, Number(heightIn)); } catch { return null; } })() : null;

  return (
    <aside className="flex h-full w-[320px] flex-col border-l border-slate-800 bg-slate-950 text-slate-100" aria-label="AgentSam Side Assistant">
      <div className="border-b border-slate-800 p-3">
        <div className="text-sm font-semibold">AgentSam Side Assistant</div>
        <div className="text-[11px] text-slate-400">{embedded ? 'Connected through Local Studio host. The host owns this conversation.' : 'Standalone: host conversation not connected.'}</div>
        {selection && <div className="mt-2 rounded bg-slate-900 p-2 text-[11px]">Selected: {selection.object.label} · {selection.object.id} · rev {selection.revision} · in</div>}
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {messages.length === 0 && <p className="text-xs text-slate-400">Ask about the selected object or the current project. Deterministic CAD edits are proposed first and applied only after your approval.</p>}
        {messages.map((m) => <div key={m.id} className={m.role === 'error' ? 'rounded bg-red-950 p-2 text-xs' : 'rounded bg-slate-900 p-2 text-xs'}>{m.role === 'error' && <AlertTriangle className="mr-1 inline size-3" />}{m.text}</div>)}
        {pending && <p className="text-[11px] text-slate-400">Waiting for host response…</p>}
      </div>
      {proposal && (
        <div className="border-t border-slate-800 p-3 text-xs">
          <div>{proposal.summary}</div>
          <button className="mt-2 rounded bg-indigo-600 px-3 py-1" onClick={() => onApproveProposal?.(proposal)}>Approve & apply via design_apply_operation</button>
          <div className="mt-1 text-[10px] text-slate-400">Revision-guarded (expected_revision {selection?.revision}). No change is made until you approve.</div>
        </div>
      )}
      {selection?.object.type === 'wall' && <div className="px-3 pb-2"><input aria-label="New wall height in inches" className="w-full rounded bg-slate-900 p-2 text-xs" placeholder="New wall height (in)" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} /></div>}
      <div className="flex gap-2 border-t border-slate-800 p-3">
        <input aria-label="Message AgentSam" className="flex-1 rounded bg-slate-900 p-2 text-xs" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Message AgentSam…" />
        <button aria-label="Send" className="rounded bg-indigo-600 px-3" onClick={send}><Send className="size-4" /></button>
      </div>
    </aside>
  );
};
export default AgentSidebar;
