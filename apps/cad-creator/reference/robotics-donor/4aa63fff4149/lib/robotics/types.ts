/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export * from '../../shared/cad/src/robotics/types';

export interface RobotJointState {
  jointIndex: number;
  name: string;
  positionRad: number;
  velocityRadPerSec: number;
  torqueNm: number;
  limits: { min: number; max: number };
}

export interface EndEffectorPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  eulerDeg: { x: number; y: number; z: number };
}

export interface PerceptionResult {
  box_2d?: number[];
  point?: number[];
  label?: string;
  worldPos?: { x: number; y: number; z: number };
  confidence?: number;
}

export interface RobotActionPlan {
  actionType: 'pickup' | 'place' | 'move_to_pose' | 'scan';
  targets: Array<{ x: number; y: number; z: number }>;
  markerIds?: number[];
  status: 'idle' | 'planning' | 'executing' | 'completed' | 'failed';
}

export interface RoboticsSceneItem {
  id: string;
  name: string;
  type: 'cube' | 'tray' | 'fixture' | 'custom_mesh' | 'cad_part';
  pos: [number, number, number];
  color?: string;
  massKg?: number;
  sourceEngine?: 'openscad' | 'blender' | 'freecad' | 'meshy' | 'system';
}
