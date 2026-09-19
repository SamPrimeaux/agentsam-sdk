/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 3D Spatial Vector
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 4D Quaternion Orientation [x, y, z, w]
 */
export interface Quaternion4D {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Euler Angles in Degrees or Radians [roll, pitch, yaw]
 */
export interface EulerAngles {
  roll: number;
  pitch: number;
  yaw: number;
}

/**
 * Canonical 6-DOF Spatial Pose
 */
export interface Pose {
  position: Vector3D;
  orientation: Quaternion4D;
  eulerDeg?: EulerAngles;
  frameId?: string;
  timestamp?: number;
}

/**
 * Canonical Joint State for an Actuated Degree of Freedom
 */
export interface JointState {
  jointIndex: number;
  name: string;
  positionRad: number;
  velocityRadPerSec: number;
  effortNm: number;
  limits?: {
    minRad: number;
    maxRad: number;
    maxVelRadPerSec: number;
    maxTorqueNm: number;
  };
}

/**
 * Canonical Robot Instance domain model
 */
export interface RobotInstance {
  id: string;
  definitionId: string;
  name: string;
  manufacturer: string;
  dof: number;
  payloadKg: number;
  reachMm: number;
  gripperType: string;
  basePose: Pose;
  tcpPose: Pose;
  jointStates: JointState[];
  gripperOpenAmount: number; // 0 (closed) to 1 (fully open)
  gripperForceN: number;
  status: 'idle' | 'executing' | 'error' | 'paused' | 'holding';
  activeTrajectoryId?: string;
}

/**
 * Robot Model Specification Definition
 */
export interface RobotDefinition {
  id: string;
  name: string;
  manufacturer: string;
  dof: number;
  payloadKg: number;
  reachMm: number;
  gripperType: string;
  sceneFile: string;
  description: string;
  jointNames?: string[];
  homeJointPositions?: number[];
  defaultTcpOffset?: Vector3D;
}

/**
 * 2D Bounding Box in Normalized Coordinates [ymin, xmin, ymax, xmax] (0 - 1000)
 */
export type BoundingBox2D = [number, number, number, number];

/**
 * 2D Point in Normalized Coordinates [y, x] (0 - 1000)
 */
export type Point2D = [number, number];

/**
 * Canonical Perception / Detection Result from Vision-Language-Action Models
 */
export interface DetectionResult {
  id: string;
  label: string;
  confidence?: number;
  box_2d?: BoundingBox2D;
  point?: Point2D;
  worldPosition?: Vector3D;
  targetMarkerId?: number;
  category?: string;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Canonical Simulation Telemetry for real-time physics & diagnostics
 */
export interface SimulationTelemetry {
  timestamp: number;
  simTime: number;
  fps: number;
  stepRateHz: number;
  realTimeFactor: number;
  gripperForce: number;
  gripperCtrl: number;
  jointVelocities: number[];
  jointPositions: number[];
  maxJointVelocity: number;
  rmsJointVelocity: number;
  collisionCount: number;
  robotContacts: number;
  environmentContacts: number;
  endEffectorPos: Vector3D;
  endEffectorVel: number;
  simulationStatus: 'running' | 'paused' | 'picking' | 'ik_active' | 'idle';
}

/**
 * Historical telemetry sample for sparkline charts and trend analysis
 */
export interface TelemetryHistoryPoint {
  timestamp: number;
  fps: number;
  stepRateHz: number;
  collisionCount: number;
  robotContacts: number;
  environmentContacts: number;
  gripperForce: number;
  maxJointVelocity: number;
  endEffectorVel: number;
}

/**
 * Summary trend metrics derived from historical telemetry stream
 */
export interface SimulationTrendMetrics {
  avgFps: number;
  minFps: number;
  maxFps: number;
  peakForce: number;
  peakVelocity: number;
  totalCollisions: number;
  activeContacts: number;
}

/**
 * Alias for canonical simulation telemetry data model
 */
export type SimulationTelemetryData = SimulationTelemetry;

/**
 * Grasp & Manipulation Target Specification
 */
export interface GraspTarget {
  id: string;
  targetMarkerId: number;
  label: string;
  approachPose: Pose;
  graspPose: Pose;
  liftPose: Pose;
  destinationPose?: Pose;
  gripForceN: number;
  status: 'pending' | 'approaching' | 'grasping' | 'lifting' | 'placed' | 'failed';
}

/**
 * Trajectory Waypoint in Cartesian Space
 */
export interface CartesianWaypoint {
  pose: Pose;
  linearVelocity?: number;
  timeFromStartSec: number;
  blendRadiusMm?: number;
}

/**
 * Trajectory Plan in Cartesian or Joint Space
 */
export interface CartesianTrajectory {
  id: string;
  robotId: string;
  waypoints: CartesianWaypoint[];
  totalDurationSec: number;
  interpolation: 'linear' | 'cubic_spline' | 'quintic';
  isGripAction?: boolean;
}

/**
 * Embodied Reasoning Vision Task
 */
export interface EmbodiedReasoningTask {
  id: string;
  timestamp: Date;
  prompt: string;
  fullPrompt: string;
  detectionType: '2D bounding boxes' | 'Points';
  imageSnapshotBase64: string;
  detections: DetectionResult[];
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
}
