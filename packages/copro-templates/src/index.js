export const COPRO_TEMPLATE_SCHEMA = "copro.template.v1";

export function defineCoProTemplate({
  id,
  name,
  description = "",
  canvas,
  slots = [],
  tracks = [],
  styles = {},
  metadata = {},
} = {}) {
  if (!id) throw new Error("copro_template_id_required");
  if (!name) throw new Error("copro_template_name_required");
  if (!canvas?.width || !canvas?.height || !canvas?.frameRate) {
    throw new Error("copro_template_canvas_required");
  }

  return {
    schema: COPRO_TEMPLATE_SCHEMA,
    id: String(id),
    name: String(name),
    description: String(description),
    canvas: structuredClone(canvas),
    slots: structuredClone(slots),
    tracks: structuredClone(tracks),
    styles: structuredClone(styles),
    metadata: structuredClone(metadata),
  };
}

export function instantiateTemplate(template, {
  projectId,
  title = template?.name,
  slotValues = {},
  now,
} = {}) {
  if (template?.schema !== COPRO_TEMPLATE_SCHEMA) throw new Error("copro_template_invalid");
  if (!projectId) throw new Error("copro_template_project_id_required");

  const missing = (template.slots ?? [])
    .filter((slot) => slot.required && slotValues[slot.id] === undefined)
    .map((slot) => slot.id);

  if (missing.length) {
    const error = new Error("copro_template_required_slots_missing");
    error.missing = missing;
    throw error;
  }

  const createdAt = (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();

  return {
    schema: "copro.project.v1",
    id: String(projectId),
    title: String(title),
    createdAt,
    updatedAt: createdAt,
    timebase: { unit: "microsecond", ticksPerSecond: 1_000_000 },
    canvas: structuredClone(template.canvas),
    tracks: structuredClone(template.tracks ?? []),
    metadata: {
      templateId: template.id,
      templateSlots: structuredClone(slotValues),
    },
  };
}
