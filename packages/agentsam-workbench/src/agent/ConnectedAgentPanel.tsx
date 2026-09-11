import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AgentArtifact,
  AgentCapability,
  AgentContextProvider,
  AgentEvent,
  AgentMessage,
  AgentRun,
  AgentToolCall,
  AgentWorkbenchAdapter,
  ModelOption,
} from '@inneranimalmedia/agentsam-contracts';
import { AgentPanel } from './AgentPanel';

export interface AgentSessionState {
  messages: AgentMessage[];
  draft: string;
  models: ModelOption[];
  capabilities: AgentCapability[];
  toolCalls: AgentToolCall[];
  artifacts: AgentArtifact[];
  currentRun: AgentRun | null;
  streaming: boolean;
  error: string | null;
}

export interface UseAgentSessionOptions {
  adapter: AgentWorkbenchAdapter;
  contextProvider: AgentContextProvider;
  conversationId: string;
  initialMessages?: AgentMessage[];
  initialModelId?: string;
}

function upsertById<T extends { id: string }>(items: T[], next: T) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

export function useAgentSession({
  adapter,
  contextProvider,
  conversationId,
  initialMessages = [],
  initialModelId,
}: UseAgentSessionOptions) {
  const [messages, setMessages] = useState<AgentMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [currentRun, setCurrentRun] = useState<AgentRun | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(initialModelId ?? '');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.resolve(adapter.getModels()).then((next) => {
      if (!active) return;
      setModels(next);
      setSelectedModelId((current) => current || next.find((model) => !model.disabled)?.id || '');
    }).catch((reason) => active && setError(String(reason instanceof Error ? reason.message : reason)));
    Promise.resolve(adapter.getCapabilities()).then((next) => active && setCapabilities(next)).catch(() => {});
    return () => { active = false; };
  }, [adapter]);

  useEffect(() => {
    const onEvent = (event: AgentEvent) => {
      if (event.type === 'message') {
        setMessages((current) => upsertById(current, event.message));
        return;
      }
      if (event.type === 'message.delta') {
        setMessages((current) => {
          const found = current.find((message) => message.id === event.messageId);
          if (!found) {
            return [...current, {
              id: event.messageId,
              role: 'assistant',
              content: event.delta,
              createdAt: Date.now(),
            }];
          }
          return current.map((message) => message.id === event.messageId
            ? { ...message, content: `${message.content}${event.delta}` }
            : message);
        });
        return;
      }
      if (event.type === 'run.status') {
        setStreaming(event.status === 'queued' || event.status === 'running');
        setCurrentRun((run) => run?.id === event.runId ? { ...run, status: event.status, error: event.error } : run);
        if (event.error) setError(event.error);
        return;
      }
      if (event.type === 'tool') {
        setToolCalls((current) => upsertById(current, event.toolCall));
        return;
      }
      if (event.type === 'artifact') {
        setArtifacts((current) => upsertById(current, event.artifact));
        return;
      }
      if (event.type === 'error') setError(event.error);
    };
    return adapter.subscribe(conversationId, onEvent);
  }, [adapter, conversationId]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setError(null);
    const context = await contextProvider.getContext();
    const optimistic: AgentMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      modelId: selectedModelId || undefined,
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');
    setStreaming(true);
    try {
      const run = await adapter.send({
        conversationId,
        text,
        context,
        modelId: selectedModelId || undefined,
        capabilityIds: capabilities.filter((capability) => capability.enabled !== false).map((capability) => capability.id),
      });
      setCurrentRun(run);
      setStreaming(run.status === 'queued' || run.status === 'running');
    } catch (reason) {
      setStreaming(false);
      setError(String(reason instanceof Error ? reason.message : reason));
    }
  }, [adapter, capabilities, contextProvider, conversationId, draft, selectedModelId, streaming]);

  const cancel = useCallback(async () => {
    if (!currentRun) return;
    await adapter.cancel(currentRun.id);
  }, [adapter, currentRun]);

  return useMemo(() => ({
    messages,
    draft,
    setDraft,
    models,
    capabilities,
    toolCalls,
    artifacts,
    currentRun,
    selectedModelId,
    setSelectedModelId,
    streaming,
    error,
    send,
    cancel,
  }), [artifacts, cancel, capabilities, currentRun, draft, error, messages, models, selectedModelId, send, streaming, toolCalls]);
}

export interface ConnectedAgentPanelProps extends UseAgentSessionOptions {
  className?: string;
  header?: ReactNode;
  empty?: ReactNode;
  renderMessage?: (message: AgentMessage, index: number) => ReactNode;
}

export function ConnectedAgentPanel({ className, header, empty, renderMessage, ...options }: ConnectedAgentPanelProps) {
  const session = useAgentSession(options);
  return (
    <AgentPanel
      className={className}
      header={header}
      empty={empty}
      messages={session.messages}
      draft={session.draft}
      onDraftChange={session.setDraft}
      onSend={session.send}
      onCancel={session.cancel}
      streaming={session.streaming}
      models={session.models}
      selectedModelId={session.selectedModelId}
      onModelChange={session.setSelectedModelId}
      renderMessage={renderMessage}
    />
  );
}
