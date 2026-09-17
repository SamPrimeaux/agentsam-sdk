/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { MujocoSim } from '../runtime/MujocoSim';
import { RobotDefinition, RobotInstance, SimulationTelemetryData } from '@inneranimalmedia/agentsam-cad-shared/robotics';
import { SimulationTelemetry } from '../runtime/types';

/**
 * Interface representing a physics and spatial robotics simulation provider
 */
export interface SimulationProvider {
  name: string;
  isReady: boolean;

  // Lifecycle & Scene Management
  initialize(container: HTMLElement, robotId?: string, sceneFile?: string, onProgress?: (msg: string) => void): Promise<void>;
  loadRobot(robotId: string): Promise<void>;
  loadScene(sceneFile: string): Promise<void>;
  dispose(): void;

  // Simulation Controls
  play(): void;
  pause(): void;
  togglePause(): boolean;
  isPaused(): boolean;
  reset(): void;
  setSpeed(speed: number): void;
  getSpeed(): number;

  // Kinematics & Manipulation
  setIkEnabled(enabled: boolean): void;
  isIkEnabled(): boolean;
  moveIkTargetTo(pos: THREE.Vector3, durationMs?: number): void;
  pickupItems(positions: THREE.Vector3[], markerIds: number[], onFinished?: () => void): void;

  // Rendering & Camera
  setDarkMode(isDark: boolean): void;
  getCanvasSnapshot(width: number, height: number, format?: string): string;
  addErMarker(pos: THREE.Vector3, label?: string, id?: number): void;
  clearErMarkers(): void;
  project2DTo3D(x: number, y: number, cameraPos: THREE.Vector3, targetPos: THREE.Vector3): { point: THREE.Vector3 } | null;
  moveCameraTo(pos: THREE.Vector3, target: THREE.Vector3, durationMs?: number): Promise<void>;
  getCameraState(): { position: THREE.Vector3; target: THREE.Vector3 };

  // Telemetry & Domain Models
  getTelemetry(): SimulationTelemetry | null;
  getCanonicalTelemetry?(): SimulationTelemetryData | null;
  getGizmoStats(): { pos: THREE.Vector3; rot: THREE.Euler } | null;
  getRobotDefinitions(): RobotDefinition[];
  getRobotInstance?(): RobotInstance | null;
  getRawSim(): MujocoSim | null;
}
