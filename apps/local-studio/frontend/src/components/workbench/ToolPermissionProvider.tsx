import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AgentToolPermissionDecision,
  AgentToolPermissionRequest as AgentToolPermissionRequestContract,
} from '@inneranimalmedia/agentsam-contracts';
import { ToolPermissionRequest } from '@inneranimalmedia/agentsam-workbench/agent';
import '@inneranimalmedia/agentsam-workbench/agent/tool-permission.css';
import { emitCompanionStatus } from '../../../agentsam/companion-events';

type PendingPermission = {
  request: AgentToolPermissionRequestContract;
  resolve: (decision: AgentToolPermissionDecision) => void;
};

type ToolPermissionContextValue = {
  requestPermission: (
    request: AgentToolPermissionRequestContract,
  ) => Promise<AgentToolPermissionDecision>;
};

const ToolPermissionContext = createContext<ToolPermissionContextValue | null>(null);

export function ToolPermissionProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<PendingPermission[]>([]);

  const requestPermission = useCallback(
    (request: AgentToolPermissionRequestContract) =>
      new Promise<AgentToolPermissionDecision>((resolve) => {
        emitCompanionStatus({ type: 'awaiting-approval', message: 'Waiting for your approval' });
        setQueue((current) => [...current, { request, resolve }]);
      }),
    [],
  );

  const decide = useCallback(
    (decision: AgentToolPermissionDecision) => {
      const current = queue[0];
      if (!current) return;
      current.resolve(decision);
      const remaining = queue.slice(1);
      setQueue(remaining);
      emitCompanionStatus(remaining.length
        ? { type: 'awaiting-approval', message: 'Another approval is waiting' }
        : { type: 'work-started' });
    },
    [queue],
  );

  const value = useMemo(() => ({ requestPermission }), [requestPermission]);
  const pending = queue[0];

  return (
    <ToolPermissionContext.Provider value={value}>
      {children}
      {pending ? (
        <ToolPermissionRequest
          request={pending.request}
          onDecision={decide}
        />
      ) : null}
    </ToolPermissionContext.Provider>
  );
}

export function useToolPermission() {
  const value = useContext(ToolPermissionContext);
  if (!value) throw new Error('tool_permission_provider_missing');
  return value;
}
