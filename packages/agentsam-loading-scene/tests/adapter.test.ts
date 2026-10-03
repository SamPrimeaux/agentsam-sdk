import { describe, expect, it } from "vitest";
import { adaptAgentSamActivity, adaptAgentSamEvent, mapRuntimeEventType } from "../src/adapters/agentsam.js";

describe("agentsam adapter", () => {
  it("maps runtime event types to semantics", () => {
    expect(mapRuntimeEventType("agent.session.started")).toBe("boot");
    expect(mapRuntimeEventType("file.read")).toBe("reading");
    expect(mapRuntimeEventType("model.inference")).toBe("thinking");
    expect(mapRuntimeEventType("tool.invoke")).toBe("tool_execution");
    expect(mapRuntimeEventType("context.window.loaded")).toBe("context_loading");
    expect(mapRuntimeEventType("catalog.indexing")).toBe("indexing");
    expect(mapRuntimeEventType("output.verify")).toBe("verification");
    expect(mapRuntimeEventType("memory.compaction")).toBe("compaction");
    expect(mapRuntimeEventType("content.asset.generated")).toBe("asset_generation");
    expect(mapRuntimeEventType("site.build")).toBe("build");
    expect(mapRuntimeEventType("site.deploy")).toBe("deployment");
    expect(mapRuntimeEventType("provider.pending")).toBe("waiting_external");
    expect(mapRuntimeEventType("task.completed")).toBe("success");
    expect(mapRuntimeEventType("task.failed")).toBe("error");
  });

  it("asset generation wins over tool-ish names", () => {
    expect(mapRuntimeEventType("tool.image.generate")).toBe("asset_generation");
  });

  it("unknown events fall back safely without crashing", () => {
    expect(mapRuntimeEventType("totally.novel.thing")).toBe("thinking");
    const adapted = adaptAgentSamEvent({ type: "totally.novel.thing" });
    expect(adapted.semantic).toBe("thinking");
    expect(adapted.phase).toBe("started");
  });

  it("failure becomes failed phase with error severity", () => {
    const adapted = adaptAgentSamEvent({ type: "deploy.failed", operationId: "op1" });
    expect(adapted.phase).toBe("failed");
    expect(adapted.severity).toBe("error");
  });
});


describe("agentsam.activity.v1 adapter", () => {
  it("canonical activity progress becomes plan metric points", () => {
    const event = adaptAgentSamActivity({
      schema: "agentsam.activity.v1",
      run_id: "run-1",
      step_id: "step-build",
      phase: "execute",
      event: "step.progress",
      label: "Building preview",
      detail: "Rendering the selected application surface",
      progress: { current: 7, total: 10 },
      timestamp: "2026-10-03T06:00:00.000Z",
    });

    expect(event.semantic).toBe("tool_execution");
    expect(event.metricPoints).toEqual({
      completed: 7,
      total: 10,
      basis: "plan-points",
    });
    expect(event.progress).toBe(0.7);
    expect(event.operationId).toBe("step-build");
    expect(event.parentOperationId).toBe("run-1");
  });

  it("activity kinds route to task-appropriate semantic scenes", () => {
    expect(adaptAgentSamActivity({
      schema: "agentsam.activity.v1",
      run_id: "r",
      phase: "execute",
      event: "artifact.created",
    }).semantic).toBe("asset_generation");

    expect(adaptAgentSamActivity({
      schema: "agentsam.activity.v1",
      run_id: "r",
      phase: "waiting",
      event: "approval.required",
    }).semantic).toBe("waiting_external");

    expect(adaptAgentSamActivity({
      schema: "agentsam.activity.v1",
      run_id: "r",
      phase: "verify",
      event: "run.failed",
    }).semantic).toBe("error");
  });
});
