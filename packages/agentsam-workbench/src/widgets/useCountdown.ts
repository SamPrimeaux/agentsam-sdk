import { useCallback, useEffect, useRef, useState } from 'react';
import {
  normalizeCountdownDuration,
  remainingFromDeadline,
  type CountdownPhase,
} from './countdown';

export interface UseCountdownOptions {
  durationMs: number;
  autoStart?: boolean;
  tickMs?: number;
  onComplete?: () => void;
}

export interface CountdownController {
  phase: CountdownPhase;
  durationMs: number;
  remainingMs: number;
  deadlineMs: number | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: (durationMs?: number) => void;
}

export function useCountdown({
  durationMs: durationInput,
  autoStart = false,
  tickMs = 250,
  onComplete,
}: UseCountdownOptions): CountdownController {
  const normalizedInput = normalizeCountdownDuration(durationInput);
  const [durationMs, setDurationMs] = useState(normalizedInput);
  const [remainingMs, setRemainingMs] = useState(normalizedInput);
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [phase, setPhase] = useState<CountdownPhase>(autoStart && normalizedInput > 0 ? 'running' : 'idle');
  const onCompleteRef = useRef(onComplete);
  const completionReportedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setDurationMs(normalizedInput);
    if (phase === 'idle') setRemainingMs(normalizedInput);
    // A completed countdown stays at 00:00 until the user starts or resets it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedInput]);

  const begin = useCallback((baseRemainingMs: number) => {
    const nextRemaining = normalizeCountdownDuration(baseRemainingMs);
    if (nextRemaining <= 0) {
      setRemainingMs(0);
      setDeadlineMs(null);
      setPhase('complete');
      return;
    }

    completionReportedRef.current = false;
    setRemainingMs(nextRemaining);
    setDeadlineMs(Date.now() + nextRemaining);
    setPhase('running');
  }, []);

  const start = useCallback(() => {
    begin(phase === 'complete' || remainingMs <= 0 ? durationMs : remainingMs);
  }, [begin, durationMs, phase, remainingMs]);

  const pause = useCallback(() => {
    if (phase !== 'running' || deadlineMs === null) return;
    const nextRemaining = remainingFromDeadline(deadlineMs);
    setRemainingMs(nextRemaining);
    setDeadlineMs(null);
    setPhase(nextRemaining <= 0 ? 'complete' : 'paused');
  }, [deadlineMs, phase]);

  const resume = useCallback(() => {
    if (phase !== 'paused') return;
    begin(remainingMs);
  }, [begin, phase, remainingMs]);

  const reset = useCallback((nextDurationMs = normalizedInput) => {
    const nextDuration = normalizeCountdownDuration(nextDurationMs);
    completionReportedRef.current = false;
    setDurationMs(nextDuration);
    setRemainingMs(nextDuration);
    setDeadlineMs(null);
    setPhase('idle');
  }, [normalizedInput]);

  useEffect(() => {
    if (!autoStart || normalizedInput <= 0) return;
    if (phase === 'running' && deadlineMs === null) begin(normalizedInput);
  }, [autoStart, begin, deadlineMs, normalizedInput, phase]);

  useEffect(() => {
    if (phase !== 'running' || deadlineMs === null) return;

    const tick = () => {
      const nextRemaining = remainingFromDeadline(deadlineMs);
      setRemainingMs(nextRemaining);
      if (nextRemaining > 0) return;

      setDeadlineMs(null);
      setPhase('complete');
      if (!completionReportedRef.current) {
        completionReportedRef.current = true;
        onCompleteRef.current?.();
      }
    };

    tick();
    const interval = setInterval(tick, Math.max(50, tickMs));
    return () => clearInterval(interval);
  }, [deadlineMs, phase, tickMs]);

  return {
    phase,
    durationMs,
    remainingMs,
    deadlineMs,
    start,
    pause,
    resume,
    reset,
  };
}
