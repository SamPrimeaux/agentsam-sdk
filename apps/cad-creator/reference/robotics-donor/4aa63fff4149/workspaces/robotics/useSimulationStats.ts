/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { SimulationProvider } from '../../lib/robotics/simulation/provider';
import { SimulationTelemetry, Vector3D } from '../../shared/cad/src/robotics/types';

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
  forceHistory: number[];
  velHistory: number[];
  isReady: boolean;
}

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
  forceHistory: [],
  velHistory: [],
  isReady: false
};

/**
 * Custom React hook that subscribes to the SimulationProvider (such as MujocoSimulationProvider)
 * and exposes high-frequency telemetry, frame rates, collision counts, and history buffers
 * for the diagnostic overlay and UI controls.
 */
export function useSimulationStats(
  providerRef: React.RefObject<SimulationProvider | null> | React.MutableRefObject<SimulationProvider | null>
): SimulationStats {
  const [stats, setStats] = useState<SimulationStats>(DEFAULT_STATS);
  const forceHistoryRef = useRef<number[]>([]);
  const velHistoryRef = useRef<number[]>([]);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    let animId: number;
    let isMounted = true;

    const poll = (time: number) => {
      const provider = providerRef.current;

      if (provider && provider.isReady) {
        // Limit state dispatch to ~30-60 FPS to prevent unnecessary re-render overhead while maintaining silky HUD updates
        if (time - lastUpdateRef.current >= 30) {
          lastUpdateRef.current = time;

          const telem = provider.getTelemetry();
          const gizmo = provider.getGizmoStats();

          let gizmoFormatted: { pos: string; rot: string } | null = null;
          if (gizmo) {
            const p = gizmo.pos;
            const r = gizmo.rot;
            gizmoFormatted = {
              pos: `X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`,
              rot: `R: ${(r.x * 180 / Math.PI).toFixed(0)}° P: ${(r.y * 180 / Math.PI).toFixed(0)}° Y: ${(r.z * 180 / Math.PI).toFixed(0)}°`
            };
          }

          if (telem) {
            forceHistoryRef.current = [...forceHistoryRef.current.slice(-24), telem.gripperForce];
            velHistoryRef.current = [...velHistoryRef.current.slice(-24), telem.maxJointVelocity];

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
                jointVelocities: telem.jointVelocities,
                jointPositions: telem.jointPositions,
                maxJointVelocity: telem.maxJointVelocity,
                rmsJointVelocity: telem.rmsJointVelocity,
                endEffectorPos: telem.endEffectorPos,
                endEffectorVel: telem.endEffectorVel,
                simulationStatus: telem.simulationStatus,
                telemetry: telem as SimulationTelemetry,
                gizmoStats: gizmoFormatted,
                forceHistory: forceHistoryRef.current,
                velHistory: velHistoryRef.current,
                isReady: true
              });
            }
          } else if (isMounted && gizmoFormatted) {
            setStats(prev => ({
              ...prev,
              gizmoStats: gizmoFormatted,
              isReady: true
            }));
          }
        }
      }

      animId = requestAnimationFrame(poll);
    };

    animId = requestAnimationFrame(poll);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animId);
    };
  }, [providerRef]);

  return stats;
}
