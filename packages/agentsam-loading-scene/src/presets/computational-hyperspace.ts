import type { ScenePreset } from "../core/types.js";
import { DEFAULT_SEMANTIC_INTENTS } from "../core/visual-intent.js";

/**
 * AgentSam Computational Hyperspace.
 *
 * Six full-frame studies share one runtime contract and one persistent canvas.
 * Runtime semantics choose the active study; the renderer cross-fades between
 * them without rebuilding the controller/world/RAF.
 */
export const computationalHyperspace: ScenePreset = {
  id: "computational-hyperspace",
  palette: {
    canvas: "#090A0E",
    line: "rgba(181, 177, 192, 0.34)",
    accents: [
      "rgba(139, 92, 246, 0.94)",  // AgentSam violet
      "rgba(182, 154, 248, 0.90)", // accent soft
      "rgba(218, 111, 143, 0.84)", // dusty rose
      "rgba(228, 158, 83, 0.86)",  // amber
      "rgba(104, 173, 215, 0.88)", // steel cyan
    ],
    warning: "rgba(242, 139, 130, 0.94)",
    text: "rgba(247, 245, 251, 0.96)",
  },
  semanticIntents: DEFAULT_SEMANTIC_INTENTS,
  geometry: {
    pathCount: 56,
    signalCount: 24,
    layerCount: 7,
    topologyCount: 14,
  },
  transition: {
    easing: 0.045,
    settleMs: 950,
  },
  reducedMotion: {
    signalActivity: 0.05,
    forwardMotion: 0.02,
  },
};
