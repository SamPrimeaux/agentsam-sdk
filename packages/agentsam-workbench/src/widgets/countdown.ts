export type CountdownPhase = 'idle' | 'running' | 'paused' | 'complete';

export function normalizeCountdownDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.max(0, Math.round(durationMs));
}

export function remainingFromDeadline(deadlineMs: number, nowMs = Date.now()): number {
  return Math.max(0, Math.round(deadlineMs - nowMs));
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
      .join(':');
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
