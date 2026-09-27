import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertWeightSum,
  BRAND_AFFINITY_V1,
  computeBrandAffinity,
  computePackageReadiness,
  computeScoreCard,
  explainScoreCard,
  PACKAGE_READINESS_V1,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("agentsam-scoring", () => {
  it("weight configs sum to 1.0 and match published JSON", () => {
    expect(assertWeightSum(BRAND_AFFINITY_V1).ok).toBe(true);
    expect(assertWeightSum(PACKAGE_READINESS_V1).ok).toBe(true);
    const ba = JSON.parse(readFileSync(join(here, "../weights/brand-affinity.v1.json"), "utf8"));
    const pr = JSON.parse(readFileSync(join(here, "../weights/package-readiness.v1.json"), "utf8"));
    expect(ba.weightsVersion).toBe(BRAND_AFFINITY_V1.weightsVersion);
    expect(pr.weightsVersion).toBe(PACKAGE_READINESS_V1.weightsVersion);
    expect(ba.components["known-asset"].weight).toBe(BRAND_AFFINITY_V1.components["known-asset"]?.weight);
    expect(pr.components.recurrence.weight).toBe(PACKAGE_READINESS_V1.components.recurrence?.weight);
  });

  it("computes brand_affinity v1 with explainable contributions", () => {
    const card = computeBrandAffinity({
      id: "ba_demo",
      raws: {
        "known-asset": 0,
        "logo-mark": 0.5,
        "names-domains-metadata": 1,
        palette: 0,
        typography: 0,
        "imagery-style": 0,
        "contextual-usage": 0.2,
      },
      evidenceRefs: ["tag:garage", "filename:emblem.svg"],
      computedAt: "2026-09-27T00:00:00.000Z",
    });

    expect(card.kind).toBe("brand-affinity");
    expect(card.weightsVersion).toBe("brand-affinity.v1");
    // 0.20*0.5*100 + 0.15*1*100 + 0.05*0.2*100 = 10 + 15 + 1 = 26
    expect(card.score).toBe(26);
    expect(card.components["names-domains-metadata"]?.contribution).toBe(15);
    expect(card.evidenceRefs).toContain("tag:garage");

    const expl = explainScoreCard(card);
    expect(expl.rankedComponents[0]?.key).toBe("names-domains-metadata");
    expect(expl.formula).toContain("brand-affinity:");
    expect(expl.formula).toContain("→ 26");
  });

  it("applies package_readiness penalties without mutating raws", () => {
    const raws = {
      recurrence: 1,
      structural: 0.8,
      portability: 0.5,
      "token-coverage": 0.4,
      responsive: 0.6,
      stability: 0.7,
      "framework-independence": 0.9,
      testability: 0.5,
    };
    const base = computePackageReadiness({ id: "pr_base", raws, computedAt: "2026-09-27T00:00:00.000Z" });
    const penalized = computePackageReadiness({
      id: "pr_pen",
      raws,
      activePenalties: ["owner-specific-literals", "host-coupling"],
      computedAt: "2026-09-27T00:00:00.000Z",
    });

    expect(penalized.score).toBe(clampExpected(base.score - 20 - 25));
    expect(penalized.penalties["owner-specific-literals"]).toBe(20);
    expect(raws.recurrence).toBe(1); // evidence untouched
  });

  it("never invents a grand similarity_score kind", () => {
    const card = computeScoreCard({
      id: "x",
      kind: "structural-similarity",
      weights: {
        id: "structural",
        version: "v1",
        weightsVersion: "structural.v1",
        algorithm: "weighted-sum.v1",
        components: { structure: { weight: 1 } },
      },
      raws: { structure: 0.75 },
      computedAt: "2026-09-27T00:00:00.000Z",
    });
    expect(card.kind).toBe("structural-similarity");
    expect((card as { similarity_score?: unknown }).similarity_score).toBeUndefined();
  });
});

function clampExpected(n: number): number {
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n * 1000) / 1000;
}
