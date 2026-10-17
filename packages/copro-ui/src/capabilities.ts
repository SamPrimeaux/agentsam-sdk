/**
 * MovieMode / CoPro agent-facing capability catalog.
 * One canonical id per surface.object.interaction; this is discovery metadata,
 * never an authorization bypass. Hosts must map handlers to registered tools,
 * revalidate project/resource grants on their server/native boundary, enforce
 * approval gates and issue execution receipts. No hard-coded AI providers.
 */
export type CapabilitySurface = "workspace" | "media" | "capture" | "player" | "timeline" | "inspector" | "composition" | "generation" | "export" | "agent";
export type CapabilityActor = "user" | "agent" | "system";
export type CapabilityScope = "workspace" | "project" | "asset" | "track" | "clip" | "selection";
export type CapabilityGate = "supported" | "verified";
export type CapabilityApproval = "none" | "user" | "destructive" | "external";
export type CapabilityEffect = "read" | "write" | "external";
export type CapabilitySpec = {
  surface: CapabilitySurface;
  actors: readonly CapabilityActor[];
  scope: CapabilityScope;
  gate: CapabilityGate;
  approval: CapabilityApproval;
  effect: CapabilityEffect;
  handler: string;
  requires?: readonly string[];
  help: string;
};

// Capability IDs denote usable GUI operations, not a provider/model catalog.
// "verified" additionally requires execution evidence from the actual host.
export const CAPABILITIES = {
  "workspace.layout.view": {surface:"workspace", actors:["user","agent"], scope:"workspace",gate:"supported",approval:"none",effect:"read",handler:"workspace.layout.read",help:"Read the current dock arrangement and sizes."},
  "workspace.layout.resize": {surface:"workspace", actors:["user","agent"], scope:"workspace",gate:"supported",approval:"user",effect:"write",handler:"workspace.layout.update",help:"Resize panels, timeline and tracks."},
  "workspace.layout.dock": {surface:"workspace", actors:["user","agent"], scope:"workspace",gate:"supported",approval:"user",effect:"write",handler:"workspace.layout.dock",help:"Dock, undock or reorder a panel."},
  "workspace.layout.restore": {surface:"workspace", actors:["user","agent"], scope:"workspace",gate:"supported",approval:"user",effect:"write",handler:"workspace.layout.restore",help:"Apply an approved saved workspace layout."},
  "media.library.browse": {surface:"media", actors:["user","agent"], scope:"workspace",gate:"supported",approval:"none",effect:"read",handler:"media.library.browse",help:"Browse authorized original and prepared assets."},
  "media.source.import": {surface:"media", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"media.source.import",help:"Import authorized video, images or audio, preserving originals."},
  "media.source.inspect": {surface:"media", actors:["user","agent"], scope:"asset",gate:"supported",approval:"none",effect:"read",handler:"media.source.inspect",help:"Read media metadata and source references."},
  "media.source.relink": {surface:"media", actors:["user","agent"], scope:"asset",gate:"verified",approval:"user",effect:"write",handler:"media.source.relink",help:"Relink missing original footage after obtaining file access."},
  "media.source.prepare": {surface:"media", actors:["user","agent"], scope:"asset",gate:"verified",approval:"user",effect:"write",handler:"media.source.prepare",help:"Create thumbnails, proxies and waveforms while preserving originals."},
  "capture.screen.record": {surface:"capture", actors:["user","agent"], scope:"project",gate:"verified",approval:"user",effect:"write",handler:"capture.screen.record",help:"Request OS/browser screen-sharing consent before recording."},
  "capture.microphone.record": {surface:"capture", actors:["user","agent"], scope:"project",gate:"verified",approval:"user",effect:"write",handler:"capture.microphone.record",help:"Request microphone consent before capture."},
  "player.media.play": {surface:"player", actors:["user","agent"], scope:"project",gate:"supported",approval:"none",effect:"read",handler:"player.media.play",help:"Play or pause the project preview."},
  "player.timeline.seek": {surface:"player", actors:["user","agent"], scope:"project",gate:"supported",approval:"none",effect:"read",handler:"player.timeline.seek",help:"Scrub to an exact timecode."},
  "player.viewport.fit": {surface:"player", actors:["user","agent"], scope:"project",gate:"supported",approval:"none",effect:"read",handler:"player.viewport.fit",help:"Fit, fill, zoom or fullscreen the preview."},
  "timeline.track.create": {surface:"timeline", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"timeline.track.create",help:"Add a real editable track to the timeline."},
  "timeline.track.edit": {surface:"timeline", actors:["user","agent"], scope:"track",gate:"supported",approval:"user",effect:"write",handler:"timeline.track.edit",help:"Reorder, mute, lock or show a track."},
  "timeline.clip.insert": {surface:"timeline", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"timeline.clip.insert",help:"Insert source media at the requested time and track."},
  "timeline.clip.select": {surface:"timeline", actors:["user","agent"], scope:"selection",gate:"supported",approval:"none",effect:"read",handler:"timeline.clip.select",help:"Choose a clip, track or editable selection."},
  "timeline.clip.move": {surface:"timeline", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"timeline.clip.move",help:"Drag or numerically reposition a timeline clip."},
  "timeline.clip.trim": {surface:"timeline", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"timeline.clip.trim",help:"Trim original in/out points without changing source bytes."},
  "timeline.clip.split": {surface:"timeline", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"timeline.clip.split",help:"Split a clip at the playhead."},
  "timeline.clip.duplicate": {surface:"timeline", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"timeline.clip.duplicate",help:"Create another editable instance of a clip."},
  "timeline.clip.delete": {surface:"timeline", actors:["user","agent"], scope:"clip",gate:"supported",approval:"destructive",effect:"write",handler:"timeline.clip.delete",help:"Delete an edit from the sequence without deleting the original asset."},
  "timeline.history.undo": {surface:"timeline", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"timeline.history.undo",help:"Undo a saved timeline action."},
  "timeline.history.redo": {surface:"timeline", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"timeline.history.redo",help:"Redo an undone timeline action."},
  "inspector.video.transform": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"inspector.video.transform",help:"Set exact scale, X/Y, rotation or opacity."},
  "inspector.video.effect": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"inspector.video.effect",help:"Apply registered, previewable video effects."},
  "inspector.video.transition": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"inspector.video.transition",help:"Set a registered transition and duration."},
  "inspector.audio.gain": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"inspector.audio.gain",help:"Set audio volume/gain and mute."},
  "inspector.audio.fade": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"verified",approval:"user",effect:"write",handler:"inspector.audio.fade",help:"Adjust source audio fade-in/out using rendered automation."},
  "inspector.clip.speed": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"supported",approval:"user",effect:"write",handler:"inspector.clip.speed",help:"Set exact clip playback speed."},
  "inspector.clip.keyframe": {surface:"inspector", actors:["user","agent"], scope:"clip",gate:"verified",approval:"user",effect:"write",handler:"inspector.clip.keyframe",help:"Create serialized animation keyframes evaluated in preview and render."},
  "composition.text.create": {surface:"composition", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"composition.text.create",help:"Create editable title/sticker layers."},
  "composition.caption.edit": {surface:"composition", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"composition.caption.edit",help:"Create and edit timed captions."},
  "composition.template.apply": {surface:"composition", actors:["user","agent"], scope:"project",gate:"verified",approval:"user",effect:"write",handler:"composition.template.apply",help:"Apply a versioned reusable MovieMode template."},
  "generation.image.create": {surface:"generation", actors:["user","agent"], scope:"project",gate:"verified",approval:"external",effect:"external",handler:"generation.image.create",help:"Generate an image using a connected authorized provider."},
  "generation.video.create": {surface:"generation", actors:["user","agent"], scope:"project",gate:"verified",approval:"external",effect:"external",handler:"generation.video.create",help:"Generate footage using a connected authorized provider."},
  "generation.audio.transcribe": {surface:"generation", actors:["user","agent"], scope:"asset",gate:"verified",approval:"external",effect:"external",handler:"generation.audio.transcribe",help:"Transcribe audio using an approved service or local model."},
  "export.project.save": {surface:"export", actors:["user","agent"], scope:"project",gate:"supported",approval:"user",effect:"write",handler:"export.project.save",help:"Save a portable editable project document."},
  "export.video.render": {surface:"export", actors:["user","agent"], scope:"project",gate:"verified",approval:"external",effect:"external",handler:"export.video.render",help:"Render the actual edited composition to a verified media file."},
  "export.media.verify": {surface:"export", actors:["user","agent","system"], scope:"asset",gate:"verified",approval:"none",effect:"read",handler:"export.media.verify",help:"Probe exported bytes and attach reproducible verification receipts."},
  "agent.proposal.create": {surface:"agent", actors:["agent"], scope:"project",gate:"verified",approval:"none",effect:"write",handler:"agent.proposal.create",help:"Suggest edits from the user's current selection without silently applying them."},
  "agent.proposal.apply": {surface:"agent", actors:["user","agent"], scope:"project",gate:"verified",approval:"user",effect:"write",handler:"agent.proposal.apply",requires:["agent.proposal.create"],help:"Apply reviewed and explicitly approved edit proposals."},
} as const satisfies Record<string,CapabilitySpec>;

export type CapabilityId = keyof typeof CAPABILITIES;
export const SURFACE_CAPABILITIES = Object.freeze(Object.fromEntries(
  (["workspace","media","capture","player","timeline","inspector","composition","generation","export","agent"] as const)
    .map(surface=>[surface,(Object.keys(CAPABILITIES) as CapabilityId[]).filter(id=>CAPABILITIES[id].surface===surface)]))
) as Record<CapabilitySurface,CapabilityId[]>;

export type CapabilityRuntime = {
  handlers: ReadonlySet<string>;
  verified?: ReadonlySet<CapabilityId>;
  granted?: ReadonlySet<CapabilityId>;
};
export type CapabilityResolution = {
  capability: CapabilityId;
  surface: CapabilitySurface;
  supported: boolean;
  verified: boolean;
  enabled: boolean;
  reason?: "handler" | "verification" | "approval" | "dependency" | "actor";
  blockedBy?: CapabilityId[];
};

/** Discovery only; a server/native executor must repeat actor, grant and resource checks. */
export function resolveCapabilities(runtime: CapabilityRuntime, actor: CapabilityActor): CapabilityResolution[] {
  const ids=Object.keys(CAPABILITIES) as CapabilityId[];
  const results=new Map<CapabilityId,CapabilityResolution>();
  for (const id of ids) {
    const c:CapabilitySpec=CAPABILITIES[id];
    const supported=runtime.handlers.has(c.handler);
    const verified=c.gate==="supported" || Boolean(runtime.verified?.has(id));
    const actorAllowed=c.actors.includes(actor);
    const approved=actor==="user" || c.approval==="none" || Boolean(runtime.granted?.has(id));
    const enabled=supported && verified && actorAllowed && approved;
    results.set(id,{capability:id,surface:c.surface,supported,verified,enabled,reason:!supported?"handler":!verified?"verification":!actorAllowed?"actor":!approved?"approval":undefined});
  }
  // Fixed point handles arbitrary dependency depth, unlike a single shallow pass.
  let changed=true;
  while(changed){
    changed=false;
    for(const id of ids){
      const resolution=results.get(id)!;
      const spec:CapabilitySpec=CAPABILITIES[id];
      const blocked=(spec.requires??[]).filter(dependency=>!results.get(dependency as CapabilityId)?.enabled) as CapabilityId[];
      if(resolution.enabled && blocked.length){resolution.enabled=false;resolution.reason="dependency";resolution.blockedBy=blocked;changed=true;}
    }
  }
  return ids.map(id=>results.get(id)!);
}
export function canDo(runtime:CapabilityRuntime,id:CapabilityId,actor:CapabilityActor){
  return resolveCapabilities(runtime,actor).find(item=>item.capability===id)!;
}

/** Canonical bridge from existing GUI action types to agent-discoverable operations. */
export const EDITOR_ACTION_CAPABILITIES = {
  "export-project":"export.project.save",
  "undo":"timeline.history.undo",
  "redo":"timeline.history.redo",
  "split":"timeline.clip.split",
  "duplicate":"timeline.clip.duplicate",
  "delete":"timeline.clip.delete",
  "move":"timeline.clip.move",
  "trim":"timeline.clip.trim",
  "speed":"inspector.clip.speed",
  "volume":"inspector.audio.gain",
  "transform":"inspector.video.transform",
  "effect":"inspector.video.effect",
  "transition":"inspector.video.transition",
  "create-text":"composition.text.create",
  "text":"composition.text.create",
  "import-media":"media.source.import",
  "add-track":"timeline.track.create",
  "track-state":"timeline.track.edit",
  "track-reorder":"timeline.track.edit",
} as const satisfies Record<string,CapabilityId>;
