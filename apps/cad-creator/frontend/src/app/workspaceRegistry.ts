/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Box,
  Code2,
  Cpu,
  LayoutGrid,
  SunMedium
} from 'lucide-react';

export type WorkspaceId = 'plan' | 'model' | 'parametric' | 'robotics' | 'render';

export interface WorkspaceDescriptor {
  id: WorkspaceId;
  name: string;
  shortName: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  engine: string;
  badge?: string;
  isPrimary?: boolean;
}

export const WORKSPACE_REGISTRY: WorkspaceDescriptor[] = [
  {
    id: 'plan',
    name: '2D Floor Plan & Sketch',
    shortName: 'Plan',
    icon: LayoutGrid,
    description: 'Architectural drafting, 2D floor plans, split layout, tldraw sketching, and room zoning.',
    engine: 'Vector CAD / tldraw',
    badge: 'BIM / 2D',
    isPrimary: true
  },
  {
    id: 'model',
    name: 'Explore in 3D',
    shortName: 'Explore',
    icon: Box,
    description: '3D architectural viewer, component assemblies, spatial object placement, and materials.',
    engine: 'Three.js / WebGL',
    badge: '3D',
    isPrimary: true
  },
  {
    id: 'parametric',
    name: 'Parametric Solid Modeling',
    shortName: 'Parametric',
    icon: Code2,
    description: 'Constructive Solid Geometry (CSG), OpenSCAD compilation, dynamic variables, and FreeCAD precision solid kernel.',
    engine: 'OpenSCAD / CSG',
    badge: 'Deterministic'
  },
  {
    id: 'robotics',
    name: 'Robotics & Physics Studio',
    shortName: 'Robotics',
    icon: Cpu,
    description: 'MuJoCo 500Hz physics simulation, Franka Panda 7-DOF kinematics, and embodied perception reasoning.',
    engine: 'MuJoCo WASM',
    badge: 'Physics 500Hz',
    isPrimary: true
  },
  {
    id: 'render',
    name: 'Render & Generative Studio',
    shortName: 'Render',
    icon: SunMedium,
    description: 'Photorealistic PBR raytracing, studio three-point lighting, Meshy generative AI 3D assets, and Veo architectural video.',
    engine: 'Blender / PBR',
    badge: 'Raytracing / GenAI'
  }
];

/** Model and render tools are contextual, not separate primary destinations. */
export const PRIMARY_WORKSPACES = WORKSPACE_REGISTRY.filter((ws) => ws.isPrimary);
export function primaryWorkspaceFor(id: WorkspaceId): 'plan' | 'model' | 'robotics' {
  return id === 'plan' || id === 'robotics' ? id : 'model';
}

export interface RuntimeCapabilityStatus {
  id: string;
  name: string;
  available: boolean;
  version?: string;
  lane: 'local_native' | 'docker' | 'browser' | 'cloud_byok' | 'cloud_platform';
  source: string;
  binary?: string;
  status: 'ready' | 'connected' | 'not_connected' | 'unavailable';
  description?: string;
}

export const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilityStatus[] = [
  {
    id: 'openscad',
    name: 'OpenSCAD',
    available: false,
    version: undefined,
    lane: 'local_native',
    source: 'unprobed',
    binary: undefined,
    status: 'not_connected',
    description: 'Parametric CSG compiler for precision solid geometry and STL/DXF export.'
  },
  {
    id: 'freecad',
    name: 'FreeCAD',
    available: false,
    version: undefined,
    lane: 'local_native',
    source: 'unprobed',
    binary: undefined,
    status: 'not_connected',
    description: 'Precision B-Rep solid modeling with ISO 10303 STEP/IGES interchange.'
  },
  {
    id: 'blender',
    name: 'Blender',
    available: false,
    version: undefined,
    lane: 'local_native',
    source: 'unprobed',
    binary: undefined,
    status: 'not_connected',
    description: 'High-fidelity PBR rendering, camera baking, and GLTF/GLB production pipeline.'
  },
  {
    id: 'mujoco',
    name: 'MuJoCo',
    available: true,
    version: '3.2.0',
    lane: 'browser',
    source: 'bundled_wasm',
    status: 'ready',
    description: '500Hz physics simulation engine running in WebAssembly.'
  },
  {
    id: 'generative-provider',
    name: 'Generative provider (optional)',
    available: false,
    version: undefined,
    lane: 'cloud_byok',
    source: 'unprobed',
    status: 'not_connected',
    description: 'Optional provider-backed image/video/perception. Availability is probed via AgentSam provider discovery; no provider is hardcoded or assumed connected.'
  },
  {
    id: 'meshy',
    name: 'Meshy',
    available: false,
    lane: 'cloud_byok',
    source: 'unprobed',
    status: 'not_connected',
    description: 'Generative AI text/image-to-3D asset synthesis for automated obstacles and props.'
  }
];
