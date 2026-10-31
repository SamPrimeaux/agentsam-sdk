function clone(value) {
  return structuredClone(value);
}

function locateClip(project, clipId) {
  for (const track of project.tracks ?? []) {
    const index = (track.clips ?? []).findIndex((clip) => clip.id === clipId);
    if (index >= 0) return { track, index, clip: track.clips[index] };
  }
  return null;
}

function locateTrack(project, trackId) {
  return (project.tracks ?? []).find((track) => track.id === trackId) ?? null;
}

function assertNonNegativeInteger(value, code) {
  if (!Number.isInteger(value) || value < 0) throw new Error(code);
}

export function applyCoProCommand(inputProject, command) {
  const project = clone(inputProject);
  if (!command?.type) throw new Error("copro_command_type_required");
  const payload = command.payload ?? {};

  switch (command.type) {
    case "clip.insert": {
      const track = locateTrack(project, payload.trackId);
      if (!track) throw new Error("copro_track_not_found");
      if (!payload.clip?.id || !payload.clip?.assetId) throw new Error("copro_clip_invalid");
      if (locateClip(project, payload.clip.id)) throw new Error("copro_clip_id_conflict");
      track.clips.push(clone(payload.clip));
      break;
    }

    case "clip.move": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      assertNonNegativeInteger(payload.startUs, "copro_clip_start_invalid");
      found.clip.startUs = payload.startUs;
      if (payload.trackId && payload.trackId !== found.track.id) {
        const destination = locateTrack(project, payload.trackId);
        if (!destination) throw new Error("copro_track_not_found");
        const [moved] = found.track.clips.splice(found.index, 1);
        destination.clips.push(moved);
      }
      break;
    }

    case "clip.trim": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      if (payload.startUs !== undefined) {
        assertNonNegativeInteger(payload.startUs, "copro_clip_start_invalid");
        found.clip.startUs = payload.startUs;
      }
      if (payload.inUs !== undefined) {
        assertNonNegativeInteger(payload.inUs, "copro_clip_in_invalid");
        found.clip.inUs = payload.inUs;
      }
      if (payload.durationUs !== undefined) {
        if (!Number.isInteger(payload.durationUs) || payload.durationUs <= 0) {
          throw new Error("copro_clip_duration_invalid");
        }
        found.clip.durationUs = payload.durationUs;
      }
      break;
    }

    case "clip.split": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      if (!payload.rightClipId) throw new Error("copro_split_right_clip_id_required");
      if (locateClip(project, payload.rightClipId)) throw new Error("copro_clip_id_conflict");
      assertNonNegativeInteger(payload.atUs, "copro_split_time_invalid");

      const relativeUs = payload.atUs - found.clip.startUs;
      if (relativeUs <= 0 || relativeUs >= found.clip.durationUs) {
        throw new Error("copro_split_out_of_bounds");
      }

      const right = {
        ...clone(found.clip),
        id: String(payload.rightClipId),
        startUs: payload.atUs,
        inUs: found.clip.inUs + relativeUs,
        durationUs: found.clip.durationUs - relativeUs,
      };
      found.clip.durationUs = relativeUs;
      found.track.clips.splice(found.index + 1, 0, right);
      break;
    }

    case "clip.duplicate": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      if (!payload.newClipId) throw new Error("copro_duplicate_new_clip_id_required");
      if (locateClip(project, payload.newClipId)) throw new Error("copro_clip_id_conflict");
      const duplicated = {
        ...clone(found.clip),
        id: String(payload.newClipId),
        startUs: payload.startUs ?? found.clip.startUs + found.clip.durationUs,
      };
      found.track.clips.splice(found.index + 1, 0, duplicated);
      break;
    }

    case "clip.set_speed": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const rate = Number(payload.playbackRate);
      if (!(rate > 0)) throw new Error("copro_clip_playback_rate_invalid");
      const previousRate = Number(found.clip.playbackRate) > 0 ? Number(found.clip.playbackRate) : 1;
      const sourceSpanUs = found.clip.durationUs * previousRate;
      found.clip.playbackRate = rate;
      found.clip.durationUs = Math.max(1, Math.round(sourceSpanUs / rate));
      break;
    }

    case "clip.set_volume": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const volume = Number(payload.volume);
      if (!(volume >= 0)) throw new Error("copro_clip_volume_invalid");
      found.clip.volume = volume;
      break;
    }

    case "clip.set_transform": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const previous = found.clip.metadata?.transform ?? {};
      const next = { ...previous };
      for (const key of ["scale", "x", "y", "rotation", "opacity"]) {
        if (payload[key] === undefined) continue;
        const value = Number(payload[key]);
        if (!Number.isFinite(value)) throw new Error("copro_clip_transform_invalid");
        if (key === "scale" && (value < 0.05 || value > 8)) throw new Error("copro_clip_scale_invalid");
        if (key === "opacity" && (value < 0 || value > 1)) throw new Error("copro_clip_opacity_invalid");
        if ((key === "x" || key === "y") && Math.abs(value) > 1000) throw new Error("copro_clip_position_invalid");
        if (key === "rotation" && Math.abs(value) > 3600) throw new Error("copro_clip_rotation_invalid");
        next[key] = value;
      }
      found.clip.metadata = { ...(found.clip.metadata ?? {}), transform: next };
      break;
    }

    case "clip.set_text": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      found.clip.metadata = { ...(found.clip.metadata ?? {}), text: String(payload.text ?? "") };
      break;
    }

    case "clip.set_effect": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const effect = String(payload.effect ?? "none");
      found.clip.metadata = { ...(found.clip.metadata ?? {}), effect };
      break;
    }

    case "clip.set_motion": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const motion = String(payload.motion ?? "none");
      const metadata = { ...(found.clip.metadata ?? {}) };
      if (motion === "none") {
        delete metadata.motion;
      } else {
        const durationUs = Number.isSafeInteger(payload.durationUs) && payload.durationUs > 0 ? payload.durationUs : 800_000;
        const delayUs = Number.isSafeInteger(payload.delayUs) && payload.delayUs >= 0 ? payload.delayUs : 0;
        const amplitude = payload.amplitude === undefined ? 80 : Number(payload.amplitude);
        if (!Number.isFinite(amplitude) || Math.abs(amplitude) > 10_000) throw new Error("copro_motion_amplitude_invalid");
        metadata.motion = { id: motion, durationUs, delayUs, amplitude };
      }
      found.clip.metadata = metadata;
      break;
    }

    case "clip.set_creative_parameters": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const current = found.clip.metadata?.creative;
      if (!current || current.schema !== "copro.creative-clip.v1") throw new Error("copro_clip_creative_not_found");
      const parameters = { ...(current.parameters ?? {}) };
      for (const [key, value] of Object.entries(payload.patch ?? {})) {
        if (["title", "subtitle", "label", "author", "contact"].includes(key)) {
          if (typeof value !== "string" || value.length > 4000) throw new Error("copro_creative_text_parameter_invalid");
        } else if (key === "accent" || key === "background" || key === "foreground") {
          if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("copro_creative_color_parameter_invalid");
        } else {
          throw new Error("copro_creative_parameter_not_editable");
        }
        parameters[key] = value;
      }
      found.clip.metadata = { ...(found.clip.metadata ?? {}), creative: { ...current, parameters } };
      if (project.metadata?.creative) project.metadata = { ...project.metadata, creative: { ...project.metadata.creative, parameters: { ...(project.metadata.creative.parameters ?? {}), ...payload.patch } } };
      if (project.metadata?.templateSlots) project.metadata = { ...project.metadata, templateSlots: { ...project.metadata.templateSlots, ...payload.patch } };
      break;
    }

    case "clip.set_graphic": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const graphic = payload.graphic;
      const metadata = { ...(found.clip.metadata ?? {}) };
      if (!graphic || graphic.id === "none") {
        delete metadata.graphic;
      } else {
        if (!["typewriter", "counter"].includes(String(graphic.id))) throw new Error("copro_graphic_not_supported");
        const durationUs = Number.isSafeInteger(graphic.durationUs) && graphic.durationUs > 0 ? graphic.durationUs : 1_000_000;
        if (graphic.id === "typewriter") {
          const sequence = graphic.sequence;
          if (typeof graphic.text !== "string" || graphic.text.length > 4000) throw new Error("copro_typewriter_text_invalid");
          if (!sequence || !Array.isArray(sequence.events) || sequence.events.length > 10_000 || sequence.events.some(event => !Number.isSafeInteger(event.timeUs) || typeof event.text !== "string" || event.text.length > 4000)) throw new Error("copro_typewriter_sequence_invalid");
        } else {
          const values = graphic.values;
          if (!Array.isArray(values) || values.length < 2 || values.length > 100 || values.some(value => !Number.isFinite(value))) throw new Error("copro_counter_values_invalid");
        }
        metadata.graphic = { ...graphic, durationUs };
      }
      found.clip.metadata = metadata;
      break;
    }

    case "clip.set_transition": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const transition = String(payload.transition ?? "none");
      const durationUs = Number.isInteger(payload.durationUs) && payload.durationUs >= 0
        ? payload.durationUs
        : 300_000;
      found.clip.metadata = {
        ...(found.clip.metadata ?? {}),
        transitionOut: { type: transition, durationUs },
      };
      break;
    }

    case "track.insert": {
      if (!payload.track?.id) throw new Error("copro_track_invalid");
      if (locateTrack(project, payload.track.id)) throw new Error("copro_track_id_conflict");
      const index = Number.isInteger(payload.index)
        ? Math.max(0, Math.min(project.tracks.length, payload.index))
        : project.tracks.length;
      project.tracks.splice(index, 0, clone(payload.track));
      break;
    }

    case "track.reorder": {
      const index = project.tracks.findIndex((track) => track.id === payload.trackId);
      if (index < 0) throw new Error("copro_track_not_found");
      if (!Number.isInteger(payload.index)) throw new Error("copro_track_index_invalid");
      const [track] = project.tracks.splice(index, 1);
      const target = Math.max(0, Math.min(project.tracks.length, payload.index));
      project.tracks.splice(target, 0, track);
      break;
    }

    case "track.set_state": {
      const track = locateTrack(project, payload.trackId);
      if (!track) throw new Error("copro_track_not_found");
      if (payload.visible !== undefined) track.visible = Boolean(payload.visible);
      if (payload.muted !== undefined) track.muted = Boolean(payload.muted);
      if (payload.locked !== undefined) track.locked = Boolean(payload.locked);
      break;
    }

    case "clip.delete": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      found.track.clips.splice(found.index, 1);
      break;
    }

    default:
      throw new Error("copro_command_unsupported:" + command.type);
  }

  return project;
}

export class CoProEditorSession {
  #past = [];
  #future = [];
  #project;

  constructor(project) {
    this.#project = clone(project);
  }

  get project() {
    return clone(this.#project);
  }

  execute(command) {
    const next = applyCoProCommand(this.#project, command);
    this.#past.push(this.#project);
    this.#project = next;
    this.#future = [];
    return this.project;
  }

  undo() {
    if (!this.#past.length) return this.project;
    this.#future.push(this.#project);
    this.#project = this.#past.pop();
    return this.project;
  }

  redo() {
    if (!this.#future.length) return this.project;
    this.#past.push(this.#project);
    this.#project = this.#future.pop();
    return this.project;
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }
}
