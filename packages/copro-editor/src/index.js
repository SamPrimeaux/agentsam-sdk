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
