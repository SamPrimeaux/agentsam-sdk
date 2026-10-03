import { describe, expect, it } from "vitest";
import { OperationStore } from "../src/core/operation-store.js";
import { LoadingSceneController } from "../src/core/controller.js";
import { computationalHyperspace } from "../src/presets/computational-hyperspace.js";

function makeController(nowRef: { t: number }) {
  return new LoadingSceneController(computationalHyperspace, { now: () => nowRef.t });
}

describe("operation store + coalescing", () => {
  it("single running tool reads as tool_execution", () => {
    const store = new OperationStore();
    store.handle({ operationId: "a", semantic: "tool_execution", phase: "started", timestamp: 1000 });
    const snap = store.snapshot(1000);
    expect(snap.weights).toEqual([{ semantic: "tool_execution", weight: 1 }]);
    expect(snap.activeCount).toBe(1);
  });

  it("concurrent tools coalesce into parallel_execution", () => {
    const store = new OperationStore();
    store.handle({ operationId: "a", semantic: "tool_execution", phase: "started", timestamp: 1000 });
    store.handle({ operationId: "b", semantic: "tool_execution", phase: "started", timestamp: 1001 });
    store.handle({ operationId: "c", semantic: "tool_execution", phase: "started", timestamp: 1002 });
    const snap = store.snapshot(1005);
    expect(snap.weights.find((w) => w.semantic === "parallel_execution")?.weight).toBe(3);
    expect(snap.weights.find((w) => w.semantic === "tool_execution")).toBeUndefined();
  });

  it("coalesces 19 rapid reads into one weighted semantic, not 19 states", () => {
    const store = new OperationStore();
    for (let i = 0; i < 19; i++) {
      store.handle({ semantic: "reading", phase: "started", timestamp: 1000 + i * 10 });
    }
    const snap = store.snapshot(1200);
    const reading = snap.weights.filter((w) => w.semantic === "reading");
    expect(reading).toHaveLength(1);
    expect(snap.activeCount).toBeGreaterThan(1); // concurrency visible spatially
    expect(snap.activeCount).toBeLessThanOrEqual(4); // but bounded, never 19 loaders
  });

  it("pulses decay after their window", () => {
    const store = new OperationStore();
    store.handle({ semantic: "reading", phase: "started", timestamp: 1000 });
    expect(store.snapshot(1100).weights.length).toBe(1);
    expect(store.snapshot(4000).weights.length).toBe(0);
  });

  it("label changes are throttled against flicker", () => {
    const nowRef = { t: 1000 };
    const c = makeController(nowRef);
    c.start({ operationId: "a", semantic: "reading", label: "Understanding your project" });
    expect(c.getScene().label).toBe("Understanding your project");
    nowRef.t = 1100;
    c.activity({ operationId: "a", semantic: "reading", label: "Reading config" });
    expect(c.getScene().label).toBe("Understanding your project"); // throttled
    nowRef.t = 1700;
    expect(c.getScene().label).toBe("Reading config"); // allowed after interval
  });
});

  it("preserves runtime-supplied task detail for narration", () => {
    const nowRef = { t: 1000 };
    const c = makeController(nowRef);
    c.start({
      operationId: "task",
      semantic: "thinking",
      label: "Planning the next step",
    });
    c.activity({
      operationId: "task",
      semantic: "tool_execution",
      label: "Running package checks",
      detail: "Verifying the loading-scene package before preview",
    });
    const scene = c.getScene();
    expect(scene.detail).toBe(
      "Verifying the loading-scene package before preview",
    );
  });

describe("controller lifecycle", () => {
  it("complete → success, fail → error, reset → idle", () => {
    const nowRef = { t: 1000 };
    const c = makeController(nowRef);
    c.start({ operationId: "a", semantic: "build", label: "Building" });
    expect(c.getScene().status).toBe("running");
    c.complete("a");
    nowRef.t = 1600;
    expect(c.getScene().status).toBe("success");

    c.reset();
    expect(c.getScene().status).toBe("idle");

    c.start({ operationId: "b", semantic: "deployment" });
    c.fail("b", "upstream rejected");
    nowRef.t = 2600;
    const scene = c.getScene();
    expect(scene.status).toBe("error");
    expect(scene.intent.fracture).toBeGreaterThan(0.5);
  });

  it("waiting_external slows the world and reports waiting", () => {
    const nowRef = { t: 1000 };
    const c = makeController(nowRef);
    c.start({ operationId: "w", semantic: "waiting_external", label: "Waiting for print provider" });
    const scene = c.getScene();
    expect(scene.status).toBe("waiting");
    expect(scene.intent.signalActivity).toBeLessThan(0.15);
    expect(scene.secondary).toMatch(/Waiting/i);
  });

  it("never fabricates progress", () => {
    const nowRef = { t: 1000 };
    const c = makeController(nowRef);
    c.start({ operationId: "a", semantic: "build" });
    expect(c.getScene().progress).toBeNull();
    c.activity({ operationId: "a", semantic: "build", progress: 0.4 });
    expect(c.getScene().progress).toBeCloseTo(0.4);
  });
});
