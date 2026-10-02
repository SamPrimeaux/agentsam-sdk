import type { ScenePreset, VisualIntent } from "../core/types.js";

/**
 * ONE persistent world. Constructed once, mutated forever.
 * Conservation of geometry: semantic changes alter forces on these
 * structures — they never rebuild them.
 */

export interface Ray {
  angle: number; // radians around the vanishing point
  baseAngle: number;
  branch: number; // 0..1 how far it has split from its parent direction
  branchPhase: number;
  accent: number; // palette accent index or -1
  jitter: number;
  fractured: boolean;
  fractureT: number; // 0..1 position of fracture along the ray
  weight: number;
}

export interface DepthLayer {
  depth: number; // 0 (far) .. 1 (near)
  lift: number; // current lift toward plane
  phase: number;
}

export interface Signal {
  ray: number; // index of host ray
  t: number; // 0 (vanishing point) .. 1 (viewer edge)
  speed: number;
  size: number;
  accent: number;
  alive: number; // 0..1 brightness envelope
}

export interface TopologyNode {
  angle: number;
  radius: number; // normalized radial distance from VP
  phase: number;
  links: number[];
}

export interface GenerationSite {
  ray: number;
  t: number;
  /** 0 = nothing, →1 line, →2 contour, →3 plane, →4 resolved and returning */
  stage: number;
  phase: number;
}

export interface World {
  rays: Ray[];
  layers: DepthLayer[];
  signals: Signal[];
  topology: TopologyNode[];
  generation: GenerationSite;
  time: number;
  travel: number; // accumulated forward travel
  settle: number; // 0 running .. 1 fully settled (success arrival)
}

export function createWorld(preset: ScenePreset, rand: () => number = Math.random): World {
  const rays: Ray[] = [];
  const n = preset.geometry.pathCount;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + rand() * 0.04;
    rays.push({
      angle,
      baseAngle: angle,
      branch: 0,
      branchPhase: rand() * Math.PI * 2,
      accent: rand() < 0.18 ? Math.floor(rand() * 5) : -1,
      jitter: rand(),
      fractured: false,
      fractureT: 0.3 + rand() * 0.4,
      weight: 0.4 + rand() * 0.6,
    });
  }

  const layers: DepthLayer[] = [];
  for (let i = 0; i < preset.geometry.layerCount; i++) {
    layers.push({ depth: (i + 1) / (preset.geometry.layerCount + 1), lift: 0, phase: rand() * Math.PI * 2 });
  }

  const signals: Signal[] = [];
  for (let i = 0; i < preset.geometry.signalCount; i++) {
    signals.push({
      ray: Math.floor(rand() * n),
      t: rand(),
      speed: 0.12 + rand() * 0.3,
      size: 0.6 + rand() * 1.2,
      accent: Math.floor(rand() * 5),
      alive: 0,
    });
  }

  const topology: TopologyNode[] = [];
  for (let i = 0; i < preset.geometry.topologyCount; i++) {
    topology.push({
      angle: rand() * Math.PI * 2,
      radius: 0.15 + rand() * 0.45,
      phase: rand() * Math.PI * 2,
      links: [],
    });
  }
  for (let i = 0; i < topology.length; i++) {
    const a = topology[i]!;
    for (let j = i + 1; j < topology.length; j++) {
      const b = topology[j]!;
      const d = Math.abs(a.radius - b.radius) + Math.abs(angDist(a.angle, b.angle)) * 0.3;
      if (d < 0.22 && a.links.length < 3) a.links.push(j);
    }
  }

  return {
    rays,
    layers,
    signals,
    topology,
    generation: { ray: Math.floor(n * 0.62), t: 0.55, stage: 0, phase: 0 },
    time: 0,
    travel: 0,
    settle: 0,
  };
}

/** Advance physics. intent is the smoothed vector; dt in seconds. */
export function stepWorld(world: World, intent: VisualIntent, dt: number, settling: boolean): void {
  world.time += dt;
  world.travel += dt * (0.04 + intent.forwardMotion * 0.9) * (1 - world.settle * 0.9);

  // settle envelope for success arrival
  const settleTarget = settling ? 1 : 0;
  world.settle += (settleTarget - world.settle) * Math.min(1, dt * 1.6);

  const t = world.time;

  for (let i = 0; i < world.rays.length; i++) {
    const ray = world.rays[i]!;
    // branching: rays split away from their base direction and breathe
    const branchTarget = intent.branching * (0.4 + ray.jitter * 0.6);
    ray.branch += (branchTarget - ray.branch) * Math.min(1, dt * 2.2);
    const sway = Math.sin(t * 0.3 + ray.branchPhase) * 0.05 * ray.branch;
    const convergePull = (intent.convergence + world.settle) * 0.5;
    ray.angle = ray.baseAngle + sway + ray.branch * Math.sin(ray.branchPhase) * 0.12 * (1 - convergePull);

    // localized fracture: only a few rays ever fracture
    const shouldFracture = intent.fracture > 0.35 && ray.jitter > 0.82;
    ray.fractured = shouldFracture;
  }

  // depth layers lift into planes with context_loading / structure
  for (const layer of world.layers) {
    const liftTarget = Math.min(1, intent.layerLift + intent.structure * 0.4) * (0.3 + 0.7 * layer.depth);
    layer.lift += (liftTarget - layer.lift) * Math.min(1, dt * 1.4);
  }

  // signals travel the rays; waiting_external nearly freezes them
  const activity = intent.signalActivity * (1 - world.settle * 0.85);
  for (const s of world.signals) {
    const aliveTarget = s.ray % world.signals.length < activity * world.signals.length * 2 ? 1 : 0;
    s.alive += ((activity > 0.03 ? aliveTarget : 0) - s.alive) * Math.min(1, dt * 1.5);
    if (s.alive > 0.02) {
      s.t += dt * s.speed * (0.15 + activity * 1.6);
      if (s.t > 1) {
        s.t = 0;
        s.ray = (s.ray + 7) % world.rays.length;
      }
    }
  }

  // generation site: line → contour → plane → resolve
  const g = world.generation;
  const genTarget = intent.generation > 0.15 ? Math.min(4, intent.generation * 4.4) : 0;
  g.stage += (genTarget - g.stage) * Math.min(1, dt * 0.9);
  g.phase += dt * (0.4 + intent.generation);
}

function angDist(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
