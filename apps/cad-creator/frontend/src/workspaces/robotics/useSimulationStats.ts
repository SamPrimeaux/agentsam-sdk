/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { SimulationProvider } from '../../lib/robotics/simulation/provider';
import {
  SimulationTelemetry,
  SimulationTrendMetrics,
  TelemetryHistoryPoint,
  Vector3D
} from '@inneranimalmedia/agentsam-cad-shared/robotics';

export interface SimulationStats {
  fps: number;
  collisionCount: number;
  robotContacts: number;
  environmentContacts: number;
  stepRateHz: number;
  realTimeFactor: number;
  gripperForce: number;
  gripperCtrl: number;
  jointVelocities: number[];
  jointPositions: number[];
  maxJointVelocity: number;
  rmsJointVelocity: number;
  endEffectorPos: Vector3D;
  endEffectorVel: number;
  simulationStatus: 'running' | 'paused' | 'picking' | 'ik_active' | 'idle';
  telemetry: SimulationTelemetry | null;
  gizmoStats: { pos: string; rot: string } | null;
  // History streams for sparkline charts
  historyPoints: TelemetryHistoryPoint[];
  fpsHistory: number[];
  collisionHistory: number[];
  forceHistory: number[];
  velHistory: number[];
  contactsHistory: number[];
  stepRateHistory: number[];
  // Aggregate statistics for diagnostic panels
  metrics: SimulationTrendMetrics;
  isReady: boolean;
}

const DEFAULT_METRICS: SimulationTrendMetrics = {
  avgFps: 60,
  minFps: 60,
  maxFps: 60,
  peakForce: 0,
  peakVelocity: 0,
  totalCollisions: 0,
  activeContacts: 0
};

const DEFAULT_STATS: SimulationStats = {
  fps: 0,
  collisionCount: 0,
  robotContacts: 0,
  environmentContacts: 0,
  stepRateHz: 500,
  realTimeFactor: 1.0,
  gripperForce: 0,
  gripperCtrl: 0,
  jointVelocities: [0, 0, 0, 0, 0, 0, 0],
  jointPositions: [0, 0, 0, 0, 0, 0, 0],
  maxJointVelocity: 0,
  rmsJointVelocity: 0,
  endEffectorPos: { x: 0, y: 0, z: 0 },
  endEffectorVel: 0,
  simulationStatus: 'idle',
  telemetry: null,
  gizmoStats: null,
  historyPoints: [],
  fpsHistory: [],
  collisionHistory: [],
  forceHistory: [],
  velHistory: [],
  contactsHistory: [],
  stepRateHistory: [],
  metrics: DEFAULT_METRICS,
  isReady: false
};

const MAX_HISTORY_SAMPLES = 40;

/**
 * Custom React hook that subscribes to the SimulationProvider (such as MujocoSimulationProvider)
 * and exposes real-time telemetry, frame rates, collision counts, trend sparklines, and history
 * buffers for the DiagnosticOverlay and diagnostic HUD panels.
 */
export function useSimulationStats(
  providerRef?: React.RefObject<SimulationProvider | null> | React.MutableRefObject<SimulationProvider | null> | null
): SimulationStats {
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);

  // Maintain circular history buffers in refs to avoid reallocations
  const historyPointsRef = useRef<TelemetryHistoryPoint[]>([]);
  const fpsHistoryRef = useRef<number[]>([]);
  const collisionHistoryRef = useRef<number[]>([]);
  const forceHistoryRef = useRef<number[]>([]);
  const velHistoryRef = useRef<number[]>([]);
  const contactsHistoryRef = useRef<number[]>([]);
  const stepRateHistoryRef = useRef<number[]>([]);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    let animId: number;
    let isMounted = true;

    const poll = (time: number) => {
      const provider = providerRef?.current;

      if (provider && provider.isReady) {
        // Sample at ~30-40 Hz for silky smooth UI feedback without choking react rendering
        if (time - lastUpdateRef.current >= 33) {
          lastUpdateRef.current = time;

          const telem = provider.getTelemetry();
          const gizmo = provider.getGizmoStats ? provider.getGizmoStats() : null;

          let gizmoFormatted: { pos: string; rot: string } | null = null;
          if (gizmo) {
            const p = gizmo.pos;
            const r = gizmo.rot;
            gizmoFormatted = {
              pos: `X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`,
              rot: `R: ${((r.x * 180) / Math.PI).toFixed(0)}° P: ${((r.y * 180) / Math.PI).toFixed(0)}° Y: ${((r.z * 180) / Math.PI).toFixed(0)}°`
            };
          }

          if (telem) {
            // Append to time-series streams
            const sample: TelemetryHistoryPoint = {
              timestamp: telem.timestamp || Date.now(),
              fps: telem.fps,
              stepRateHz: telem.stepRateHz,
              collisionCount: telem.collisionCount,
              robotContacts: telem.robotContacts,
              environmentContacts: telem.environmentContacts,
              gripperForce: telem.gripperForce,
              maxJointVelocity: telem.maxJointVelocity,
              endEffectorVel: telem.endEffectorVel
            };

            historyPointsRef.current = [...historyPointsRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)), sample];
            fpsHistoryRef.current = [...fpsHistoryRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)), telem.fps];
            collisionHistoryRef.current = [
              ...collisionHistoryRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)),
              telem.collisionCount
            ];
            forceHistoryRef.current = [
              ...forceHistoryRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)),
              telem.gripperForce
            ];
            velHistoryRef.current = [
              ...velHistoryRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)),
              telem.maxJointVelocity
            ];
            contactsHistoryRef.current = [
              ...contactsHistoryRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)),
              telem.robotContacts + telem.environmentContacts
            ];
            stepRateHistoryRef.current = [
              ...stepRateHistoryRef.current.slice(-(MAX_HISTORY_SAMPLES - 1)),
              telem.stepRateHz
            ];

            // Compute trends & metrics
            const fpsVals = fpsHistoryRef.current;
            const minFps = fpsVals.length ? Math.min(...fpsVals) : telem.fps;
            const maxFps = fpsVals.length ? Math.max(...fpsVals) : telem.fps;
            const avgFps = fpsVals.length ? Math.round(fpsVals.reduce((a, b) => a + b, 0) / fpsVals.length) : telem.fps;
            const peakForce = Math.max(...forceHistoryRef.current, telem.gripperForce);
            const peakVelocity = Math.max(...velHistoryRef.current, telem.maxJointVelocity);

            const metrics: SimulationTrendMetrics = {
              avgFps,
              minFps,
              maxFps,
              peakForce,
              peakVelocity,
              totalCollisions: telem.collisionCount,
              activeContacts: telem.robotContacts + telem.environmentContacts
            };

            if (isMounted) {
              setStats({
                fps: telem.fps,
                collisionCount: telem.collisionCount,
                robotContacts: telem.robotContacts,
                environmentContacts: telem.environmentContacts,
                stepRateHz: telem.stepRateHz,
                realTimeFactor: telem.realTimeFactor,
                gripperForce: telem.gripperForce,
                gripperCtrl: telem.gripperCtrl,
                jointVelocities: telem.jointVelocities || [0, 0, 0, 0, 0, 0, 0],
                jointPositions: telem.jointPositions || [0, 0, 0, 0, 0, 0, 0],
                maxJointVelocity: telem.maxJointVelocity,
                rmsJointVelocity: telem.rmsJointVelocity,
                endEffectorPos: telem.endEffectorPos,
                endEffectorVel: telem.endEffectorVel,
                simulationStatus: telem.simulationStatus,
                telemetry: telem as SimulationTelemetry,
                gizmoStats: gizmoFormatted,
                historyPoints: historyPointsRef.current,
                fpsHistory: fpsHistoryRef.current,
                collisionHistory: collisionHistoryRef.current,
                forceHistory: forceHistoryRef.current,
                velHistory: velHistoryRef.current,
                contactsHistory: contactsHistoryRef.current,
                stepRateHistory: stepRateHistoryRef.current,
                metrics,
                isReady: true
              });
            }
          }
        }
      }

      if (isMounted) {
        animId = requestAnimationFrame(poll);
      }
    };

    animId = requestAnimationFrame(poll);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animId);
    };
  }, [providerRef]);

  return stats;
}
