/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import loadMujoco from 'mujoco_wasm';
import * as THREE from 'three';
import { MujocoSim } from '../../../MujocoSim';
import { RobotDefinition, RobotInstance, SimulationTelemetryData } from '../../../shared/cad/src/robotics/types';
import { MujocoModule, SimulationTelemetry } from '../../../types';
import { SimulationProvider } from './provider';

/**
 * Global singleton cache for MuJoCo WebAssembly binary module
 */
let cachedWasmModulePromise: Promise<MujocoModule> | null = null;

export async function getMujocoWasmModule(): Promise<MujocoModule> {
  if (!cachedWasmModulePromise) {
    cachedWasmModulePromise = loadMujoco({
      locateFile: (path: string) =>
        path.endsWith('.wasm')
          ? 'https://unpkg.com/mujoco-js@0.0.7/dist/mujoco_wasm.wasm'
          : path,
      printErr: (text: string) => {
        console.error('MuJoCo WASM error:', text);
      }
    }) as Promise<MujocoModule>;
  }
  return cachedWasmModulePromise;
}

/**
 * MujocoSimulationProvider
 * Concrete implementation of SimulationProvider leveraging MuJoCo WASM physics
 * and Three.js spatial rendering pipeline.
 */
export class MujocoSimulationProvider implements SimulationProvider {
  name = 'MuJoCo WASM Physics Engine';
  isReady = false;
  
  private sim: MujocoSim | null = null;
  private wasmModule: MujocoModule | null = null;
  private currentSpeed = 1;
  private currentRobotId = 'franka_panda_stack';
  private currentSceneFile = 'scene.xml';

  constructor(wasmModule?: MujocoModule) {
    if (wasmModule) {
      this.wasmModule = wasmModule;
    }
  }

  /**
   * Initializes the MuJoCo WASM runtime and attaches rendering viewport to container element
   */
  async initialize(
    container: HTMLElement,
    robotId = 'franka_panda_stack',
    sceneFile = 'scene.xml',
    onProgress?: (msg: string) => void
  ): Promise<void> {
    this.dispose();
    this.currentRobotId = robotId;
    this.currentSceneFile = sceneFile;

    if (!this.wasmModule) {
      onProgress?.("Downloading & linking MuJoCo WASM physics module...");
      this.wasmModule = await getMujocoWasmModule();
    }

    onProgress?.("Instantiating MuJoCo 500Hz physics loop & Three.js viewport...");
    this.sim = new MujocoSim(container, this.wasmModule);
    await this.sim.init(robotId, sceneFile, onProgress);
    this.sim.setIkEnabled(false);
    this.isReady = true;
  }

  /**
   * Hot-reloads robot definition into active scene
   */
  async loadRobot(robotId: string): Promise<void> {
    this.currentRobotId = robotId;
    if (this.sim && this.wasmModule) {
      await this.sim.init(this.currentRobotId, this.currentSceneFile);
    }
  }

  /**
   * Loads specific XML scene configuration
   */
  async loadScene(sceneFile: string): Promise<void> {
    this.currentSceneFile = sceneFile;
    if (this.sim && this.wasmModule) {
      await this.sim.init(this.currentRobotId, this.currentSceneFile);
    }
  }

  /**
   * Cleanly disposes simulation context, geometries, and rendering loop
   */
  dispose(): void {
    if (this.sim) {
      this.sim.dispose();
      this.sim = null;
    }
    this.isReady = false;
  }

  // --- Simulation Controls ---

  play(): void {
    if (this.sim && this.sim.paused) {
      this.sim.togglePause();
    }
  }

  pause(): void {
    if (this.sim && !this.sim.paused) {
      this.sim.togglePause();
    }
  }

  togglePause(): boolean {
    return this.sim ? this.sim.togglePause() : false;
  }

  isPaused(): boolean {
    return this.sim ? this.sim.paused : true;
  }

  reset(): void {
    this.sim?.reset();
    this.currentSpeed = 1;
    this.sim?.setSpeedMultiplier(1);
  }

  setSpeed(speed: number): void {
    this.currentSpeed = speed;
    this.sim?.setSpeedMultiplier(speed);
  }

  getSpeed(): number {
    return this.currentSpeed;
  }

  // --- Kinematics & Manipulation ---

  setIkEnabled(enabled: boolean): void {
    this.sim?.setIkEnabled(enabled);
  }

  isIkEnabled(): boolean {
    return this.sim?.ikEnabled ?? false;
  }

  moveIkTargetTo(pos: THREE.Vector3, durationMs = 0): void {
    this.sim?.moveIkTargetTo(pos, durationMs);
  }

  pickupItems(positions: THREE.Vector3[], markerIds: number[], onFinished?: () => void): void {
    this.sim?.pickupItems(positions, markerIds, onFinished);
  }

  // --- Visuals & Spatial Rendering ---

  setDarkMode(isDark: boolean): void {
    this.sim?.renderSys.setDarkMode(isDark);
  }

  getCanvasSnapshot(width: number, height: number, format = 'image/png'): string {
    if (!this.sim) return '';
    return this.sim.renderSys.getCanvasSnapshot(width, height, format);
  }

  addErMarker(pos: THREE.Vector3, label?: string, id?: number): void {
    this.sim?.renderSys.addErMarker(pos, label, id);
  }

  clearErMarkers(): void {
    this.sim?.renderSys.clearErMarkers();
  }

  project2DTo3D(x: number, y: number, cameraPos: THREE.Vector3, targetPos: THREE.Vector3): { point: THREE.Vector3 } | null {
    if (!this.sim) return null;
    return this.sim.renderSys.project2DTo3D(x, y, cameraPos, targetPos);
  }

  async moveCameraTo(pos: THREE.Vector3, target: THREE.Vector3, durationMs = 1000): Promise<void> {
    if (this.sim) {
      await this.sim.renderSys.moveCameraTo(pos, target, durationMs);
    }
  }

  getCameraState(): { position: THREE.Vector3; target: THREE.Vector3 } {
    if (!this.sim) {
      return { position: new THREE.Vector3(2.2, -1.2, 2.2), target: new THREE.Vector3(0, 0, 0) };
    }
    return this.sim.renderSys.getCameraState();
  }

  // --- Telemetry & Diagnostics ---

  getTelemetry(): SimulationTelemetry | null {
    if (!this.sim) return null;
    return this.sim.getSimulationTelemetry();
  }

  getCanonicalTelemetry(): SimulationTelemetryData | null {
    const telem = this.getTelemetry();
    if (!telem) return null;

    return {
      timestamp: telem.timestamp,
      simTime: telem.simTime,
      fps: telem.fps,
      stepRateHz: telem.stepRateHz,
      realTimeFactor: telem.realTimeFactor,
      gripperForce: telem.gripperForce,
      gripperCtrl: telem.gripperCtrl,
      jointVelocities: telem.jointVelocities,
      jointPositions: telem.jointPositions,
      maxJointVelocity: telem.maxJointVelocity,
      rmsJointVelocity: telem.rmsJointVelocity,
      collisionCount: telem.collisionCount,
      robotContacts: telem.robotContacts,
      environmentContacts: telem.environmentContacts,
      endEffectorPos: telem.endEffectorPos,
      endEffectorVel: telem.endEffectorVel,
      simulationStatus: telem.simulationStatus
    };
  }

  getGizmoStats(): { pos: THREE.Vector3; rot: THREE.Euler } | null {
    if (!this.sim) return null;
    return this.sim.getGizmoStats();
  }

  getRawSim(): MujocoSim | null {
    return this.sim;
  }

  getRobotDefinitions(): RobotDefinition[] {
    return [
      {
        id: 'franka_panda_stack',
        name: 'Franka Emika Panda',
        manufacturer: 'Franka Robotics',
        dof: 7,
        payloadKg: 3.0,
        reachMm: 855,
        gripperType: 'Panda Hand 2-Finger Parallel',
        sceneFile: 'scene.xml',
        description: '7-DOF collaborative robot with torque sensors in all joints, ideal for precision pick & place and force-sensitive assembly.'
      }
    ];
  }

  getRobotInstance(): RobotInstance | null {
    const telem = this.getTelemetry();
    const gizmo = this.getGizmoStats();
    if (!telem) return null;

    const jointStates = telem.jointPositions.map((pos, idx) => ({
      jointIndex: idx,
      name: `panda_joint${idx + 1}`,
      positionRad: pos,
      velocityRadPerSec: telem.jointVelocities[idx] ?? 0,
      effortNm: 0
    }));

    return {
      id: 'franka_instance_0',
      definitionId: 'franka_panda_stack',
      name: 'Franka Emika Panda #1',
      manufacturer: 'Franka Robotics',
      dof: 7,
      payloadKg: 3.0,
      reachMm: 855,
      gripperType: 'Panda Hand 2-Finger Parallel',
      basePose: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      },
      tcpPose: {
        position: telem.endEffectorPos,
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        eulerDeg: gizmo ? {
          roll: gizmo.rot.x * 180 / Math.PI,
          pitch: gizmo.rot.y * 180 / Math.PI,
          yaw: gizmo.rot.z * 180 / Math.PI
        } : undefined
      },
      jointStates,
      gripperOpenAmount: telem.gripperCtrl,
      gripperForceN: telem.gripperForce,
      status: telem.simulationStatus === 'picking' ? 'executing' : telem.simulationStatus === 'paused' ? 'paused' : 'idle'
    };
  }
}
