import { MessageCircle } from 'lucide-react';

/** Portable Artifact affordance. The host supplies the authorized conversation action. */
export function AskAgentSamPill({ onAsk, disabled = false, contextLabel, className = '' }: {
  onAsk: () => void;
  disabled?: boolean;
  contextLabel?: string;
  className?: string;
}) {
  return <button type="button" className={'agentsam-ask-pill ' + className}
    aria-label={contextLabel ? `Ask AgentSam about ${contextLabel}` : 'Ask AgentSam'}
    title={contextLabel ? `Ask AgentSam about ${contextLabel}` : 'Ask AgentSam'}
    disabled={disabled} onClick={onAsk}>
    <MessageCircle size={14} strokeWidth={1.8} aria-hidden="true" />
    <span>Ask AgentSam</span>
  </button>;
}
