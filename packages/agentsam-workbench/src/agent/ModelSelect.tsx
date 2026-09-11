import type { ModelOption } from '@inneranimalmedia/agentsam-contracts';

export interface AgentModelSelectProps {
  value: string;
  models: ModelOption[];
  onChange: (modelId: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function AgentModelSelect({ value, models, onChange, className, ariaLabel = 'Select model' }: AgentModelSelectProps) {
  return (
    <select value={value} className={className} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)}>
      {models.map((model) => (
        <option key={model.id} value={model.id} disabled={model.disabled}>{model.label}</option>
      ))}
    </select>
  );
}
