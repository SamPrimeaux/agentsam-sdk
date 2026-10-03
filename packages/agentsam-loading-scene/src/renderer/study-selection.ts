import type { LoadingSceneSemantic, SceneState } from "../core/types.js";

export type HyperspaceStudyId =
  | "runway"
  | "signal"
  | "layers"
  | "quantum"
  | "merkle"
  | "horizon";

export interface HyperspaceStudyDefinition {
  id: HyperspaceStudyId;
  title: string;
  description: string;
  family: string;
}

export const HYPERSPACE_STUDIES: readonly HyperspaceStudyDefinition[] = [
  {
    id: "runway",
    title: "Interdimensional Runway",
    description: "A clean approach into the workspace.",
    family: "runtime field",
  },
  {
    id: "signal",
    title: "Signal Through the Void",
    description: "A single signal finds its path.",
    family: "signal transit",
  },
  {
    id: "layers",
    title: "Infinite Layer Stack",
    description: "Context assembles in dimensional layers.",
    family: "dimensional layers",
  },
  {
    id: "quantum",
    title: "Quantum Navigation Field",
    description: "Multiple paths, one coherent result.",
    family: "execution lanes",
  },
  {
    id: "merkle",
    title: "Warped Merkle Space",
    description: "Structure bends until state agrees.",
    family: "merkle space",
  },
  {
    id: "horizon",
    title: "Event Horizon Compute Field",
    description: "Everything converges toward completion.",
    family: "event horizon",
  },
] as const;

export const DEFAULT_SEMANTIC_STUDY: Record<LoadingSceneSemantic, HyperspaceStudyId> = {
  idle: "runway",
  boot: "runway",
  reading: "signal",
  thinking: "signal",
  tool_execution: "quantum",
  parallel_execution: "quantum",
  context_loading: "layers",
  indexing: "merkle",
  verification: "merkle",
  compaction: "merkle",
  asset_generation: "layers",
  build: "horizon",
  deployment: "horizon",
  waiting_external: "signal",
  success: "horizon",
  error: "horizon",
};

export function studyForSemantic(semantic: LoadingSceneSemantic): HyperspaceStudyId {
  return DEFAULT_SEMANTIC_STUDY[semantic];
}

export function studyForScene(scene: SceneState): HyperspaceStudyId {
  return studyForSemantic(scene.dominantSemantic);
}
