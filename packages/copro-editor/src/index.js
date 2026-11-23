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
  if (command.type.startsWith("clip.") && payload.clipId && locateClip(project, payload.clipId)?.track.locked)
    throw new Error("copro_track_locked");
  if ((command.type === "clip.insert" || command.type === "clip.move") && locateTrack(project, payload.trackId)?.locked)
    throw new Error("copro_track_locked");

  switch (command.type) {
    case "project.set_cover": {
      const cover = payload.cover;
      if (cover !== null && (!cover || !["frame","upload"].includes(cover.kind) || typeof cover.url !== "string" || !cover.url.startsWith("data:image/") || cover.url.length > 2_000_000))
        throw new Error("copro_cover_invalid");
      project.metadata = {...project.metadata, cover: clone(cover)};
      break;
    }
    case "project.apply_template": {
      if (!Array.isArray(payload.tracks) || !payload.tracks.length) throw new Error("copro_template_tracks_required");
      const ids = new Set(project.tracks.map(track => track.id));
      const clipIds = new Set(project.tracks.flatMap(track => track.clips.map(clip => clip.id)));
      for (const track of payload.tracks) {
        if (!track.id || ids.has(track.id) || !Array.isArray(track.clips)) throw new Error("copro_template_track_conflict");
        ids.add(track.id);
        for (const clip of track.clips) {
          if (!clip.id || clipIds.has(clip.id) || !clip.assetId) throw new Error("copro_template_clip_conflict");
          clipIds.add(clip.id);
        }
      }
      project.tracks.push(...clone(payload.tracks));
      if (payload.canvas && !inputProject.tracks.some(track => track.clips.length)) project.canvas = clone(payload.canvas);
      break;
    }

    case "project.set_environment": {
      if (payload.patch === null) {
        project.metadata = {...(project.metadata??{})};
        delete project.metadata.environment;
        break;
      }
      const patch = payload.patch;
      if (!patch || typeof patch!=="object" || Array.isArray(patch) ||
        Object.keys(patch).some(key=>!["background","ambient","exposure","fogColor","fogOpacity","showGrid","skyPreset","finish","cloudDensity","skyProgression","starIntensity","galaxyIntensity","auroraIntensity","stars","glow","lightHue","shadowSoftness","keyAngle","skyVideoAssetId"].includes(key)))
        throw new Error("copro_environment_patch_invalid");
      for (const [key,value] of Object.entries(patch)) {
        if (key==="background"||key==="fogColor") {
          if (typeof value!=="string" || !/^#[0-9a-fA-F]{6}$/.test(value))throw new Error("copro_environment_color_invalid");
        } else if (["showGrid","stars","glow"].includes(key)) {
          if (typeof value!=="boolean")throw new Error("copro_environment_toggle_invalid");
        } else if (key==="skyVideoAssetId") {
          if (typeof value !== "string" || value.length > 512 || (value && !value.startsWith("asset:"))) throw new Error("copro_environment_sky_video_invalid");
        } else if (key==="skyPreset" || key==="finish") {
          const options=key==="skyPreset" ? ["studio","night","spiral","aurora","exoplanet","supernova","eclipse","cloudbank"] : ["original","gold","cryo-titanium","copper","carbon","calacatta","marquina","basalt"];
          if (typeof value!=="string" || !options.includes(value)) throw new Error("copro_environment_preset_invalid");
        } else if (typeof value!=="number" || !Number.isFinite(value) ||
          (key==="ambient" && (value<.2||value>2.5)) ||
          (key==="exposure" && (value<.25||value>2.5)) ||
          (key==="fogOpacity" && (value<0||value>.8)) ||
          (["cloudDensity","skyProgression","starIntensity","galaxyIntensity","auroraIntensity"].includes(key) && (value<0||value>1)) ||
          (key==="lightHue" && (value<0||value>360)) ||
          (key==="shadowSoftness" && (value<.5||value>10)) ||
          (key==="keyAngle" && (value< -90||value>180))) {
          throw new Error("copro_environment_value_invalid");
        }
      }
      project.metadata={...(project.metadata??{}),environment:{...(project.metadata?.environment??{}),...clone(patch)}};
      break;
    }

    case "project.set_canvas": {
      const width = Number(payload.width);
      const height = Number(payload.height);
      const frameRate = Number(payload.frameRate ?? project.canvas?.frameRate ?? 30);
      if (!Number.isSafeInteger(width) || width < 1 || width > 32768) throw new Error("copro_canvas_width_invalid");
      if (!Number.isSafeInteger(height) || height < 1 || height > 32768) throw new Error("copro_canvas_height_invalid");
      if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 240) throw new Error("copro_canvas_frame_rate_invalid");
      project.canvas = { width, height, frameRate };
      break;
    }

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
        inUs: (found.clip.inUs ?? 0) + Math.round(relativeUs * (found.clip.playbackRate ?? 1)),
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
      if (!Number.isFinite(rate) || !(rate > 0)) throw new Error("copro_clip_playback_rate_invalid");
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
      if (!Number.isFinite(volume) || !(volume >= 0)) throw new Error("copro_clip_volume_invalid");
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

    case "clip.set_world3d": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      if (found.clip.metadata?.sourceKind !== "samscene-timeline-cue" || found.clip.metadata?.sceneCue?.kind !== "scene-object")
        throw new Error("copro_world3d_clip_required");
      const patch = payload.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some(key => !["transform", "visible", "keyframes", "animationIndex"].includes(key)))
        throw new Error("copro_world3d_patch_invalid");
      const previous = found.clip.metadata.world3d ?? {};
      const next = { ...previous };
      const numericKeys = ["x", "y", "z", "rotationYDeg", "scale", "opacity"];
      function validate3dNumeric(key, value) {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("copro_world3d_numeric_invalid");
        if (key === "scale" && (value < .05 || value > 100)) throw new Error("copro_world3d_scale_invalid");
        if (key === "opacity" && (value < 0 || value > 1)) throw new Error("copro_world3d_opacity_invalid");
        if (key === "rotationYDeg" && Math.abs(value) > 36000) throw new Error("copro_world3d_rotation_invalid");
        if (["x","y","z"].includes(key) && Math.abs(value) > 100000) throw new Error("copro_world3d_position_invalid");
      }
      if (patch.transform !== undefined) {
        if (!patch.transform || typeof patch.transform !== "object" || Array.isArray(patch.transform) || Object.keys(patch.transform).some(key => !numericKeys.includes(key)))
          throw new Error("copro_world3d_transform_invalid");
        const transform={...(previous.transform || {})};
        for (const [key,value] of Object.entries(patch.transform)) {
          validate3dNumeric(key,value);
          transform[key]=value;
        }
        next.transform=transform;
      }
      if (patch.visible !== undefined) {
        if (typeof patch.visible !== "boolean") throw new Error("copro_world3d_visible_invalid");
        next.visible=patch.visible;
      }
      if (patch.animationIndex !== undefined) {
        if (!Number.isSafeInteger(patch.animationIndex) || patch.animationIndex < 0 || patch.animationIndex > 4096)
          throw new Error("copro_world3d_animation_invalid");
        next.animationIndex=patch.animationIndex;
      }
      if (patch.keyframes !== undefined) {
        if (!Array.isArray(patch.keyframes) || patch.keyframes.length > 2000)
          throw new Error("copro_world3d_keyframes_invalid");
        let lastTime=-1;
        for (const keyframe of patch.keyframes) {
          if (!keyframe || typeof keyframe !== "object" || Array.isArray(keyframe) ||
              !Number.isSafeInteger(keyframe.timeUs) || keyframe.timeUs <= lastTime || keyframe.timeUs > 24*60*60*1000000 ||
              Object.keys(keyframe).some(key => key !== "timeUs" && !numericKeys.includes(key)))
            throw new Error("copro_world3d_keyframe_invalid");
          for (const [key,value] of Object.entries(keyframe)) if(key !== "timeUs") validate3dNumeric(key,value);
          lastTime=keyframe.timeUs;
        }
        next.keyframes=clone(patch.keyframes);
      }
      found.clip.metadata={...found.clip.metadata,world3d:next};
      break;
    }

    case "clip.set_mask": {
      const found = locateClip(project,payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      if (payload.mask === null) {
        const metadata = {...(found.clip.metadata??{})};delete metadata.mask;found.clip.metadata=metadata;
        break;
      }
      const mask = payload.mask;
      if (!mask || typeof mask!=="object" || Array.isArray(mask) ||
          Object.keys(mask).some(key=>!["shape","size","feather","invert"].includes(key)) ||
          !["circle","rectangle"].includes(mask.shape) ||
          typeof mask.size!=="number" || !Number.isFinite(mask.size) || mask.size<20 || mask.size>100 ||
          typeof mask.feather!=="number" || !Number.isFinite(mask.feather) || mask.feather<0 || mask.feather>30 ||
          typeof mask.invert!=="boolean" || (mask.shape==="rectangle"&&mask.invert))
        throw new Error("copro_clip_mask_invalid");
      found.clip.metadata={...(found.clip.metadata??{}),mask:clone(mask)};
      break;
    }

    case "clip.set_adjustments": {
      const found = locateClip(project, payload.clipId);
      if (!found) throw new Error("copro_clip_not_found");
      const limits = {
        exposure: [-5, 5], contrast: [-100, 100], saturation: [0, 200],
        highlights: [-100, 100], shadows: [-100, 100],
        temperature: [-100, 100], tint: [-100, 100],
        lift: [-100,100], gamma: [-100,100], gain: [-100,100],
        hue: [-180,180], luminance: [-100,100],
      };
      if (!payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch))
        throw new Error("copro_adjustments_patch_invalid");
      const next = {...(found.clip.metadata?.adjustments ?? {})};
      for (const [key, raw] of Object.entries(payload.patch)) {
        if (!Object.hasOwn(limits, key)) throw new Error("copro_adjustment_key_invalid");
        const value = Number(raw);
        const [min,max] = limits[key];
        if (typeof raw !== "number" || !Number.isFinite(value) || value < min || value > max)
          throw new Error("copro_adjustment_value_invalid");
        next[key] = value;
      }
      found.clip.metadata = {...(found.clip.metadata ?? {}), adjustments: next};
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
        let nextValue=value;
        if (["title", "subtitle", "label", "author", "contact"].includes(key)) {
          if (typeof value !== "string" || value.length > 4000) throw new Error("copro_creative_text_parameter_invalid");
        } else if (key === "accent" || key === "background" || key === "foreground") {
          if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("copro_creative_color_parameter_invalid");
        } else if (key === "media") {
          if (typeof value !== "string" || value.length > 512) throw new Error("copro_creative_media_parameter_invalid");
        } else if (key === "backgroundMode") {
          if(value!=="transparent"&&value!=="solid")throw new Error("copro_creative_background_mode_invalid");
        } else if (key === "words" || key === "items") {
          if (!Array.isArray(value) || value.length > 24 || value.some(item=>typeof item!=="string"||item.length>160)) throw new Error("copro_creative_list_parameter_invalid");
          nextValue=value.map(item=>item.trim()).filter(Boolean);
        } else if (key === "values") {
          if (!Array.isArray(value) || value.length > 24 || value.some(item=>!Number.isFinite(Number(item))||Number(item)<0||Number(item)>1_000_000)) throw new Error("copro_creative_values_parameter_invalid");
          nextValue=value.map(Number);
        } else {
          throw new Error("copro_creative_parameter_not_editable");
        }
        parameters[key] = nextValue;
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
        transitionOut: {
          type: transition, durationUs,
          ...(payload.direction ? {direction: ["left","right","up","down"].includes(payload.direction) ? payload.direction : "left"} : {}),
          ...(payload.easing ? {easing: ["linear","ease-in","ease-out","ease-in-out"].includes(payload.easing) ? payload.easing : "ease-in-out"} : {}),
        },
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
