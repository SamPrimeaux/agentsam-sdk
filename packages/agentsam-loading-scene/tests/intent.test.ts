import { describe, expect, it } from "vitest";
import { applyConcurrency, blendIntents } from "../src/core/visual-intent.js";
import { TransitionEngine } from "../src/core/transition-engine.js";
import { ZERO_INTENT } from "../src/core/types.js";

describe("visual intent blending", () => {
  it("parallel_execution + asset_generation blend instead of fighting", () => {
    const blended = blendIntents([
      { semantic: "parallel_execution", weight: 1 },
      { semantic: "asset_generation", weight: 1 },
    ]);
    // branching from parallelism survives
    expect(blended.branching).toBeGreaterThan(0.4);
    // generation is max-blended so it is never diluted
    expect(blended.generation).toBeCloseTo(0.9, 1);
  });

  it("fracture is never diluted by concurrent healthy work", () => {
    const blended = blendIntents([
      { semantic: "error", weight: 1 },
      { semantic: "tool_execution", weight: 5 },
    ]);
    expect(blended.fracture).toBeCloseTo(0.8, 5);
  });

  it("concurrency widens branching with a bounded bonus", () => {
    const base = blendIntents([{ semantic: "tool_execution", weight: 1 }]);
    const wide = applyConcurrency(base, 19);
    expect(wide.branching).toBeGreaterThan(base.branching);
    expect(wide.branching - base.branching).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("empty weights yield near-idle intent", () => {
    const blended = blendIntents([]);
    expect(blended).toEqual(ZERO_INTENT);
  });
});

describe("transition engine", () => {
  it("interpolates toward targets — no hard cuts", () => {
    const engine = new TransitionEngine(0.1);
    engine.setTarget({ ...ZERO_INTENT, forwardMotion: 1 });
    const first = engine.step(16.7).forwardMotion;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.2); // nothing jumps
    for (let i = 0; i < 300; i++) engine.step(16.7);
    expect(engine.current.forwardMotion).toBeGreaterThan(0.95);
    expect(engine.distance()).toBeLessThan(0.05);
  });
});
