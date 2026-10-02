import type { ScenePreset } from "../core/types.js";
import { DEFAULT_SEMANTIC_INTENTS } from "../core/visual-intent.js";

/**
 * First preset of the generic framework. Near-black, very thin geometry,
 * huge negative space, viewer inside the structure. Future presets
 * (Architectural Blueprint, …) reuse the same machinery.
 */
export const computationalHyperspace: ScenePreset = {
  id: "computational-hyperspace",
  palette: {
    canvas: "#000000",
    line: "rgba(148, 152, 170, 0.5)",
    accents: [
      "rgba(139, 125, 183, 0.85)", // muted violet
      "rgba(104, 117, 173, 0.85)", // indigo
      "rgba(176, 134, 146, 0.8)", // dusty rose
      "rgba(190, 165, 118, 0.7)", // subtle amber
      "rgba(120, 143, 162, 0.8)", // steel blue
    ],
    warning: "rgba(198, 134, 110, 0.9)",
    text: "rgba(220, 222, 232, 0.8)",
  },
  semanticIntents: DEFAULT_SEMANTIC_INTENTS,
  geometry: { pathCount: 56, signalCount: 24, layerCount: 7, topologyCount: 14 },
  transition: { easing: 0.045, settleMs: 950 },
  reducedMotion: { signalActivity: 0.05, forwardMotion: 0.02 },
};
