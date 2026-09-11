import type { AgentToolCall } from '@inneranimalmedia/agentsam-contracts';

export function ToolReceipt({ call, className }: { call: AgentToolCall; className?: string }) {
  return (
    <div className={className} data-tool-status={call.status} data-tool-name={call.name}>
      <strong>{call.name}</strong>
      <span>{call.status}</span>
      {call.error ? <p>{call.error}</p> : null}
    </div>
  );
}
