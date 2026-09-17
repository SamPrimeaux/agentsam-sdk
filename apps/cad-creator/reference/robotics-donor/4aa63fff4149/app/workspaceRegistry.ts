/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Activity,
  Box,
  Code2,
  Cpu,
  Layers,
  LayoutGrid,
  Sparkles,
  SunMedium
} from 'lucide-react';
import React from 'react';

export type WorkspaceId = 'robotics' | 'parametric' | 'model' | 'plan' | 'render' | 'generative';

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
    id: 'robotics',
    name: 'Robotics & Physics Studio',
    shortName: 'Robotics',
    icon: Cpu,
    description: 'MuJoCo 500Hz physics simulation, Franka Panda 7-DOF kinematics, and Gemini Embodied Reasoning 2.0.',
    engine: 'MuJoCo WASM',
    badge: 'Physics 500Hz',
    isPrimary: true
  },
  {
    id: 'parametric',
    name: 'OpenSCAD Parametric CAD',
    shortName: 'OpenSCAD',
    icon: Code2,
    description: 'Constructive Solid Geometry (CSG) parametric code editor, dynamic variables, and precision STL/DXF compilation.',
    engine: 'OpenSCAD CSG',
    badge: 'Deterministic'
  },
  {
    id: 'render',
    name: 'Blender Studio & PBR',
    shortName: 'Blender',
    icon: SunMedium,
    description: 'High-fidelity material shaders, studio three-point lighting, turntable baking, and GLTF/GLB export pipeline.',
    engine: 'Blender 4.2',
    badge: 'Raytracing'
  },
  {
    id: 'model',
    name: '3D Spatial & Assemblies',
    shortName: '3D Studio',
    icon: Box,
    description: 'Spatial assembly viewer, component hierarchy, exploded views, dimensional verification, and kinematic joints.',
    engine: 'Three.js / WebGL',
    badge: 'Spatial'
  },
  {
    id: 'plan',
    name: '2D Layout & Workcell Plan',
    shortName: '2D Plan',
    icon: LayoutGrid,
    description: 'Workcell floor layouts, robot reach radius envelopes, safety barriers, and conveyor positioning.',
    engine: '2D Vector Plan',
    badge: 'BIM / Workcell'
  },
  {
    id: 'generative',
    name: 'Meshy Generative 3D',
    shortName: 'Meshy AI',
    icon: Sparkles,
    description: 'AI-assisted text/image-to-3D asset synthesis for automated obstacle and fixture generation.',
    engine: 'Meshy AI API',
    badge: 'GenAI 3D'
  }
];
