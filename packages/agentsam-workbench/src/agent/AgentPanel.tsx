import type { ReactNode } from 'react';
import type { AgentMessage, ModelOption } from '@inneranimalmedia/agentsam-contracts';
import { AgentThread } from './Thread';
import { AgentComposer } from './Composer';
import { AgentModelSelect } from './ModelSelect';

export interface AgentPanelProps {
  messages: AgentMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  streaming?: boolean;
  models?: ModelOption[];
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
  renderMessage?: (message: AgentMessage, index: number) => ReactNode;
  empty?: ReactNode;
  header?: ReactNode;
  className?: string;
}

export function AgentPanel(props: AgentPanelProps) {
  const modelControl = props.models?.length && props.selectedModelId && props.onModelChange
    ? <AgentModelSelect value={props.selectedModelId} models={props.models} onChange={props.onModelChange} />
    : null;
  return (
    <section className={props.className} data-agent-panel="">
      {props.header}
      <AgentThread messages={props.messages} streaming={props.streaming} renderMessage={props.renderMessage} empty={props.empty} />
      <AgentComposer
        value={props.draft}
        onChange={props.onDraftChange}
        onSend={props.onSend}
        onCancel={props.onCancel}
        streaming={props.streaming}
        toolbarStart={modelControl}
      />
    </section>
  );
}
