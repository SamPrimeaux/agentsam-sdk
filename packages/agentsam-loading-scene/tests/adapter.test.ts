import { describe, expect, it } from "vitest";
import { adaptAgentSamEvent, mapRuntimeEventType } from "../src/adapters/agentsam.js";

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
