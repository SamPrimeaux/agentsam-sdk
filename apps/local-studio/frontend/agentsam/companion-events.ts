import type { CompanionState } from './companions';

export type CompanionStatusSignal =
  | { type: 'work-started' }
  | { type: 'runtime-idle' }
  | { type: 'tests-passed'; message?: string }
  | { type: 'syntax-warning'; message?: string }
  | { type: 'blocked'; message?: string }
  | { type: 'state'; state: CompanionState; message?: string };

export type CompanionHandoffSignal = {
  fromId: string;
  toId: string;
  context?: 'strategy-to-execution' | 'review-to-repair' | 'custom';
  message?: string;
};

export function emitCompanionStatus(signal: CompanionStatusSignal): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CompanionStatusSignal>('agentsam:companion:status', { detail: signal }));
}

export function emitCompanionHandoff(signal: CompanionHandoffSignal): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CompanionHandoffSignal>('agentsam:companion:handoff', { detail: signal }));
}
