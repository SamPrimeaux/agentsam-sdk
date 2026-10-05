import { createHash } from "node:crypto";

export const COPRO_RENDER_PLAN_SCHEMA = "copro.render-plan.v1";

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createRenderPlan(project, {
  width = project?.canvas?.width,
  height = project?.canvas?.height,
  frameRate = project?.canvas?.frameRate,
  container = "mp4",
  videoCodec = "h264",
  audioCodec = "aac",
  quality = "high",
  captions = "separate",
} = {}) {
  if (project?.schema !== "copro.project.v1") throw new Error("copro_render_project_invalid");

  return {
    schema: COPRO_RENDER_PLAN_SCHEMA,
    projectId: project.id,
    projectSnapshotHash: hash(project),
    target: {
      width,
      height,
      frameRate,
      container,
      videoCodec,
      audioCodec,
      quality,
      captions,
    },
    requiredCapabilities: ["render.video"],
  };
}

export function selectRenderBackend(plan, backends = []) {
  if (plan?.schema !== COPRO_RENDER_PLAN_SCHEMA) throw new Error("copro_render_plan_invalid");

  const candidates = backends
    .filter((backend) =>
      backend?.available !== false &&
      plan.requiredCapabilities.every((cap) => (backend.capabilities ?? []).includes(cap))
    )
    .sort((a, b) => {
      const priority = (b.priority ?? 0) - (a.priority ?? 0);
      if (priority) return priority;
      const cost = (a.costScore ?? 0) - (b.costScore ?? 0);
      if (cost) return cost;
      return String(a.id).localeCompare(String(b.id));
    });

  if (!candidates.length) throw new Error("copro_render_backend_unavailable");
  return candidates[0];
}
