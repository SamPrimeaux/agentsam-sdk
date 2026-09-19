# Design & Media

Excalidraw canvas, CAD generation/jobs, Design Studio blueprints/scenes/assets, image generation/upload, video generation/embed, and the full Meshy 3D pipeline (text-to-3D, image-to-3D, rig, retexture, remesh, UV unwrap).

**35 tools** in this domain.

## `design` (3)

- **`excalidraw_export`** (Excalidraw export) — Export the active Draw/Excalidraw canvas as PNG+SVG to R2. Prefer calling without canvasData so the open canvas exports client-side. _never used_
- **`excalidraw_load_library`** (Excalidraw load library) — Load an Excalidraw shape library onto /dashboard/draw by slug (e.g. lofi-wireframe, web-kit, universal-ui-kit). _never used_
- **`excalidraw_plan_map_create`** (Excalidraw plan map) — Generate an Excalidraw plan map from agentsam_plans + plan tasks. Use for multi-task plans — not general freeform drawing (prefer illustration_create). _never used_

## `design.execute` (2)

- **`cad_generate`** (Generate CAD Script Job) — Create an OpenSCAD, FreeCAD, or Blender CAD job from a natural-language prompt, then auto-dispatch execution. Prefer this over pasting source code. Poll cad_job_status.
- **`cad_job_cancel`** (Cancel CAD Job) — Cancel an authenticated user-owned CAD job. Provider cancellation attempted when supported. _risk: high, never used_

## `design.read` (5)

- **`cad_job_status`** (CAD Job Status) — Get one scoped CAD job or list recent CAD jobs for the authenticated user and workspace.
- **`designstudio_asset_list`** (List Design Studio Assets) — List shared 3D Studio assets and user-owned assets available in the active workspace. _never used_
- **`designstudio_blueprint_get`** (Get Design Studio Blueprint) — Fetch one Design Studio blueprint by id, including sketch_json and preview URLs. _never used_
- **`designstudio_blueprint_list`** (List Design Studio Blueprints) — List Design Studio design blueprints for the active workspace. _never used_
- **`designstudio_scene_list`** (List Design Studio Scenes) — List named scene snapshots owned by the authenticated user in the active workspace. _never used_

## `design.write` (2)

- **`designstudio_blueprint_create`** (Create Design Studio Blueprint) — Create a Design Studio blueprint (draft intent). Defaults set_active=true. Do not generate CAD unless the user asks. _never used_
- **`designstudio_blueprint_update`** (Update Design Studio Blueprint) — Update blueprint fields (title, status, preview URLs, sketch_json) or set_active to select it in Studio. _never used_

## `media` (1)

- **`illustration_create`** (Illustration Create (iam.illustration.v1)) — Single SSOT envelope for sketches (Excalidraw /draw) vs CAD blueprints (Design Studio). Pass iam.illustration.v1 with intent, fidelity, engine=auto, title, brief, constraints, payload.

## `media.execute` (19)

- **`agentsam_video_embed`** (Video Embed (Gemini media lane)) — Index a media_assets row into AGENTSAM_VECTORIZE_MEDIA via gemini-embedding-2 @1536. _never used_
- **`imgx_edit_image`** (Image Edit) — Edit or modify an existing image. Only call when user explicitly asks to edit/modify/alter an image file. _**inactive**, never used_
- **`imgx_generate_image`** (Image Generate) — Generate 1 image, or up to 4 in ONE call via variations:N (concurrent, not sequential — always use variations for multi-image asks instead of repeated calls). provider=openai|google|workers_ai.
- **`imgx_list_providers`** (Image Providers) — List available image generation providers and their current status. _**inactive**, never used_
- **`meshy_animate`** (Meshy Animate) — Apply a custom Meshy animation clip to a completed rig task. _never used_
- **`meshy_convert`** (Meshy Convert) — Convert a Meshy model to requested 3D formats. _never used_
- **`meshy_image_to_3d`** (Meshy Image to 3D) — Create a textured Meshy model from one image. _never used_
- **`meshy_multi_image_to_3d`** (Meshy Multi-Image to 3D) — Create a Meshy model from 1–4 views of the same object. _never used_
- **`meshy_remesh`** (Meshy Remesh) — Change topology or polygon count for an owned Meshy task or model URL. _never used_
- **`meshy_resize`** (Meshy Resize) — Set real-world dimensions for a Meshy model. _never used_
- **`meshy_retexture`** (Meshy Retexture) — Apply a text- or image-guided texture to an existing Meshy model. _never used_
- **`meshy_rig`** (Meshy Rig) — Rig a humanoid Meshy model. Source should use a T-pose, no more than 300,000 faces. _never used_
- **`meshy_text_to_3d`** (Meshy Text to 3D) — Create a Meshy Text-to-3D preview task. Spends credits; texture the preview with meshy_text_to_3d_refine. _never used_
- **`meshy_text_to_3d_refine`** (Meshy Text to 3D Refine) — Texture a completed Meshy Text-to-3D preview. Requires the preview task id, spends credits. _never used_
- **`meshy_uv_unwrap`** (Meshy UV Unwrap) — Generate a UV layout for an existing Meshy model. _never used_
- **`moviemode_export`** (MovieMode Export) — Export a MovieMode video project to final output format. _never used_
- **`moviemode_render`** (MovieMode Render) — Queue a Remotion render job for a MovieMode project timeline. _never used_
- **`social_card_generate`** (Social Card) — Generate a social share card image from template + metadata. _**inactive**, never used_
- **`veo_generate_video`** (Video Generate) — Generate video with Vertex Veo (async). Default destination=local; destination=stream saves to Hosted Videos when connected.

## `media.manage` (1)

- **`meshy_cancel_task`** (Delete Meshy Task) — Permanently delete an authenticated user-owned Meshy task and mark its IAM CAD job canceled. DELETE, not a reversible cancel. _risk: high, never used_

## `media.status` (2)

- **`meshy_get_task_status`** (Meshy Task Status) — Read IAM-owned Meshy job status by CAD job id. _never used_
- **`meshy_list_tasks`** (List Meshy Tasks) — List recent IAM-owned Meshy jobs for the authenticated user and workspace. _never used_
