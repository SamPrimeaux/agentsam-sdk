import type { WeightConfig } from "./types.js";

/** Mirrors weights/brand-affinity.v1.json — keep in sync. */
export const BRAND_AFFINITY_V1: WeightConfig = {
  id: "brand-affinity",
  version: "v1",
  weightsVersion: "brand-affinity.v1",
  algorithm: "weighted-sum.v1",
  description:
    "Brand association proposal score from independent signal families. Not BrandPack authority.",
  components: {
    "known-asset": { weight: 0.3, label: "Known asset / duplicate of brand-scoped asset" },
    "logo-mark": { weight: 0.2, label: "Logo / mark similarity" },
    "names-domains-metadata": { weight: 0.15, label: "Names, domains, metadata keywords" },
    palette: { weight: 0.1, label: "Palette affinity" },
    typography: { weight: 0.1, label: "Typography affinity" },
    "imagery-style": { weight: 0.1, label: "Imagery style affinity" },
    "contextual-usage": { weight: 0.05, label: "Contextual usage / placement" },
  },
  penalties: {
    "conflicting-explicit-brand": 25,
    "customer-literal-leak": 40,
  },
};

/** Mirrors weights/package-readiness.v1.json — keep in sync. */
export const PACKAGE_READINESS_V1: WeightConfig = {
  id: "package-readiness",
  version: "v1",
  weightsVersion: "package-readiness.v1",
  algorithm: "weighted-sum-minus-penalties.v1",
  description:
    "Harvest productization readiness for Theme/Template/Section/Component candidates.",
  components: {
    recurrence: { weight: 0.22, label: "Recurrence across sites/builds" },
    structural: { weight: 0.18, label: "Structural coherence" },
    portability: { weight: 0.16, label: "Portability across hosts" },
    "token-coverage": { weight: 0.14, label: "Token coverage / semantic families" },
    responsive: { weight: 0.1, label: "Responsive behavior" },
    stability: { weight: 0.08, label: "Stability across revisions" },
    "framework-independence": { weight: 0.07, label: "Framework independence" },
    testability: { weight: 0.05, label: "Testability / fixtureability" },
  },
  penalties: {
    "owner-specific-literals": 20,
    "hardcoded-routes": 15,
    "secret-or-credential-refs": 40,
    "host-coupling": 25,
    "silent-canonical-promotion": 30,
  },
};
