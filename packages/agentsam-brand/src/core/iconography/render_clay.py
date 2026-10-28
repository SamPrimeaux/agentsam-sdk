#!/usr/bin/env python3
"""Manifest-driven clay relief renderer for the AgentSam brand iconography kit.

The source PNG is used only to derive a threshold mask. The exported GLB is a
real rounded tile plus a pixel-derived raised relief mesh, with named nodes and
PBR materials. This renderer authors a model; it does not optimize existing GLBs.
"""
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_job_path():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--job" not in args:
        raise RuntimeError("renderer requires --job <renderer-job.json>")
    return Path(args[args.index("--job") + 1]).resolve()


def hex_rgba(value):
    raw = str(value).lstrip("#")
    if len(raw) == 3:
        raw = "".join(c * 2 for c in raw)
    return tuple(int(raw[i:i + 2], 16) / 255.0 for i in (0, 2, 4)) + (1.0,)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, roughness=0.48, metallic=0.02):
    mat = bpy.data.materials.new(name=name)
    mat.diffuse_color = hex_rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = float(roughness)
    bsdf.inputs["Metallic"].default_value = float(metallic)
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.46
    return mat


def make_area(name, location, power, size, color):
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0.12)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def add_camera(scene, location, ortho_scale=3.45):
    data = bpy.data.cameras.new("StudioCamera")
    camera = bpy.data.objects.new("StudioCamera", data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    camera.rotation_euler = (Vector((0, 0, 0.16)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    scene.camera = camera
    return camera


def read_mask(mask_path):
    image = bpy.data.images.load(str(mask_path), check_existing=False)
    width, height = int(image.size[0]), int(image.size[1])
    if width < 2 or height < 2:
        raise RuntimeError(f"Mask image is too small: {mask_path}")
    pixels = list(image.pixels[:])
    return image, width, height, pixels


def build_relief(app_id, mask_path, mesh_resolution, tile_top_z, relief_height, extent, mark_mat):
    image, mask_w, mask_h, mask_pixels = read_mask(mask_path)
    n = int(mesh_resolution)
    if n < 64 or n > 1024:
        raise RuntimeError(f"mesh_resolution outside supported range: {n}")

    def sample(ix, iy):
        x = max(0, min(mask_w - 1, int(round(ix))))
        y = max(0, min(mask_h - 1, int(round(iy))))
        return float(mask_pixels[(y * mask_w + x) * 4])

    # Sample the source-derived grayscale mask once on the mesh lattice.
    grid = []
    for y in range(n + 1):
        image_y = (1.0 - y / n) * (mask_h - 1)
        row = []
        for x in range(n + 1):
            image_x = (x / n) * (mask_w - 1)
            row.append(sample(image_x, image_y))
        grid.append(row)

    occupied = []
    for y in range(n):
        row = []
        for x in range(n):
            value = (grid[y][x] + grid[y][x + 1] + grid[y + 1][x + 1] + grid[y + 1][x]) / 4.0
            row.append(value >= 0.46)
        occupied.append(row)

    vertices = []
    faces = []
    top_vertex_index = {}
    bottom_vertex_index = {}
    bottom_z = tile_top_z - 0.001

    def top_vertex(x, y):
        key = (x, y)
        if key not in top_vertex_index:
            u = x / n
            v = y / n
            px = -extent + 2.0 * extent * u
            py = -extent + 2.0 * extent * v
            z = tile_top_z + relief_height * grid[y][x]
            top_vertex_index[key] = len(vertices)
            vertices.append((px, py, z))
        return top_vertex_index[key]

    def bottom_vertex(x, y):
        key = (x, y)
        if key not in bottom_vertex_index:
            px = -extent + 2.0 * extent * (x / n)
            py = -extent + 2.0 * extent * (y / n)
            bottom_vertex_index[key] = len(vertices)
            vertices.append((px, py, bottom_z))
        return bottom_vertex_index[key]

    for y in range(n):
        for x in range(n):
            if not occupied[y][x]:
                continue
            a = top_vertex(x, y)
            b = top_vertex(x + 1, y)
            c = top_vertex(x + 1, y + 1)
            d = top_vertex(x, y + 1)
            faces.append((a, b, c, d))

    top_face_count = len(faces)
    # Close the underside slightly inside the tile body, keeping the relief a real solid.
    for y in range(n):
        for x in range(n):
            if not occupied[y][x]:
                continue
            ba = bottom_vertex(x, y)
            bb = bottom_vertex(x + 1, y)
            bc = bottom_vertex(x + 1, y + 1)
            bd = bottom_vertex(x, y + 1)
            faces.append((ba, bd, bc, bb))

    def add_wall(edge_a, edge_b):
        top_a = top_vertex(*edge_a)
        top_b = top_vertex(*edge_b)
        lower_a = bottom_vertex(*edge_a)
        lower_b = bottom_vertex(*edge_b)
        faces.append((top_a, top_b, lower_b, lower_a))

    # Close every exposed boundary edge, creating an actual raised solid mark.
    for y in range(n):
        for x in range(n):
            if not occupied[y][x]:
                continue
            if y == 0 or not occupied[y - 1][x]:
                add_wall((x, y), (x + 1, y))
            if x == n - 1 or not occupied[y][x + 1]:
                add_wall((x + 1, y), (x + 1, y + 1))
            if y == n - 1 or not occupied[y + 1][x]:
                add_wall((x + 1, y + 1), (x, y + 1))
            if x == 0 or not occupied[y][x - 1]:
                add_wall((x, y + 1), (x, y))

    mesh = bpy.data.meshes.new(f"{app_id}_relief_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mark_mat)
    mesh.update()
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold_edge_count = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    obj = bpy.data.objects.new(f"{app_id}_relief", mesh)
    bpy.context.collection.objects.link(obj)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = index < top_face_count
    bevel = obj.modifiers.new("Soft relief edge", "BEVEL")
    bevel.width = min(0.006, (2.0 * extent / n) * 1.2)
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    normal = obj.modifiers.new("Relief weighted normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    bpy.data.images.remove(image)
    return obj, len(vertices), len(faces), non_manifold_edge_count


def make_tile(app_id, width, thickness, body_mat, surface_mat):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, thickness / 2.0))
    tile = bpy.context.object
    tile.name = f"{app_id}_tile"
    tile.dimensions = (width, width, thickness)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    tile.data.materials.append(body_mat)
    tile.data.materials.append(surface_mat)
    for polygon in tile.data.polygons:
        polygon.material_index = 1 if polygon.normal.z > 0.9 else 0
    bevel = tile.modifiers.new("Soft clay edge", "BEVEL")
    bevel.width = 0.17
    bevel.segments = 8
    bevel.profile = 0.5
    normal = tile.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    return tile

def add_ground():
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.045))
    ground = bpy.context.object
    ground.name = "StudioGround"
    mat = material("Studio background", "#edf2f7", 0.82, 0.0)
    ground.data.materials.append(mat)
    return ground


def set_render_settings(scene, resolution, fps):
    scene.render.engine = "BLENDER_EEVEE"
    try:
        scene.eevee.taa_render_samples = 48
    except Exception:
        pass
    scene.render.resolution_x = int(resolution)
    scene.render.resolution_y = int(resolution)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.fps = int(fps)
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -0.45
    scene.view_settings.gamma = 1.0
    scene.world = bpy.data.worlds.new("StudioWorld") if bpy.data.worlds.get("StudioWorld") is None else bpy.data.worlds["StudioWorld"]
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.82, 0.88, 1.0)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.2


def glb_bbox(objects):
    points = []
    for obj in objects:
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        return None
    return {
        "x": round(max(p.x for p in points) - min(p.x for p in points), 5),
        "y": round(max(p.y for p in points) - min(p.y for p in points), 5),
        "z": round(max(p.z for p in points) - min(p.z for p in points), 5),
    }


def render_still(scene, camera, root, output_path, angle):
    if angle == "hero":
        camera.location = (2.8, -3.6, 2.65)
    elif angle == "front":
        camera.location = (0.0, -4.4, 1.05)
    elif angle == "top":
        camera.location = (0.0, -0.001, 5.2)
    camera.rotation_euler = (Vector((0, 0, 0.17)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    root.rotation_euler = (0, 0, 0)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)


def export_glb(output_path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    with open(output_path, "rb") as stream:
        header = stream.read(12)
    if len(header) != 12 or header[:4] != b"glTF" or int.from_bytes(header[4:8], "little") != 2:
        raise RuntimeError(f"GLB export verification failed: {output_path}")


def render_turntable(scene, root, frames_dir, frames, fps, resolution):
    scene.render.resolution_x = int(resolution)
    scene.render.resolution_y = int(resolution)
    scene.render.resolution_percentage = 100
    scene.render.fps = int(fps)
    scene.frame_start = 1
    scene.frame_end = int(frames)
    root.rotation_euler.z = 0.0
    root.keyframe_insert(data_path="rotation_euler", index=2, frame=1)
    root.rotation_euler.z = math.tau
    root.keyframe_insert(data_path="rotation_euler", index=2, frame=frames)
    # Render image sequences because this Blender build has no FFMPEG image-output enum.
    # The brand pipeline encodes the deterministic PNG frames with the host ffmpeg binary.
    frames_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(frames_dir / "frame_")
    bpy.ops.render.render(animation=True)


def build_one(job, app, colorway):
    reset_scene()
    scene = bpy.context.scene
    app_id = app["id"]
    color_id = colorway["id"]
    width = float(job["icon_width"])
    thickness = float(job["tile_thickness"])
    relief_height = float(job["relief_height"])
    body = material(f"{app_id}_{color_id}_tile_body", colorway["base_bottom"], colorway.get("roughness", 0.48), colorway.get("metallic", 0.02))
    surface = material(f"{app_id}_{color_id}_tile_surface", colorway["base_top"], colorway.get("roughness", 0.48), colorway.get("metallic", 0.02))
    mark = material(f"{app_id}_{color_id}_raised_mark", colorway["mark"], max(0.28, float(colorway.get("roughness", 0.42)) - 0.06), colorway.get("metallic", 0.01))
    tile = make_tile(app_id, width, thickness, body, surface)
    relief, vertex_count, face_count, non_manifold_edge_count = build_relief(app_id, app["mask_path"], job["mesh_resolution"], thickness, relief_height, 0.80, mark)
    root = bpy.data.objects.new(f"{app_id}_{color_id}_root", None)
    bpy.context.collection.objects.link(root)
    tile.parent = root
    relief.parent = root
    output_root = Path(job["output_root"])
    model_rel = Path("models") / app_id / color_id / f"{app_id}-{color_id}.glb"
    model_path = output_root / model_rel
    model_path.parent.mkdir(parents=True, exist_ok=True)
    # The exported model contains only the actual tile and relief meshes.
    export_glb(model_path, [tile, relief])

    # This process authors geometry only. Three.js/WebGL in the actual Studio
    # viewer renders the exported GLB; Blender background rendering is not
    # invoked because it aborts on this host even for a minimal scene.
    renders = {}
    turntable = None
    turntable_frames_dir = None

    bounds = glb_bbox([tile, relief])
    return {
        "app_icon_id": app_id,
        "colorway_id": color_id,
        "glb": model_rel.as_posix(),
        "glb_bytes": model_path.stat().st_size,
        "source_sha256": app["source_sha256"],
        "mask_sha256": app["mask_sha256"],
        "mesh_resolution": int(job["mesh_resolution"]),
        "vertex_count": int(vertex_count),
        "face_count": int(face_count),
        "non_manifold_edge_count": int(non_manifold_edge_count),
        "bbox_icon_units": bounds,
        "node_names_expected": [f"{app_id}_tile", f"{app_id}_relief"],
        "material_names": [body.name, surface.name, mark.name],
        "renders": renders,
        "turntable": turntable,
        "turntable_frames_dir": turntable_frames_dir,
        "turntable_frame_count": int(job["turntable_frames"]) if turntable_frames_dir else 0,
        "verified": True,
    }


def main():
    job_path = parse_job_path()
    job = json.loads(job_path.read_text())
    if job.get("schema") != "agentsam.brand-iconography.renderer-job.v1":
        raise RuntimeError("Unsupported renderer job schema")
    models = []
    turntables = []
    for app in job["app_icons"]:
        for colorway in job["colorways"]:
            result = build_one(job, app, colorway)
            models.append(result)
            if result["turntable"]:
                turntables.append(result["turntable"])
            print(f"[iconography] {app['id']} / {colorway['id']} -> {result['glb']} ({result['vertex_count']} relief vertices)", flush=True)
    report = {
        "schema": "agentsam.brand-iconography.renderer-report.v1",
        "renderer": "Blender",
        "renderer_version": bpy.app.version_string,
        "models": models,
        "turntables": turntables,
        "all_glbs_exported": all(row["verified"] for row in models),
        "source_geometry": "grayscale mask generated from canonical app-icon raster by the Node iconography pipeline",
        "static_renders": {"status": "not-generated", "reason": job.get("render_skip_reason")},
        "preview_engine": job.get("preview_engine", "Three.js/WebGL"),
    }
    report_path = Path(job["output_root"]) / "renderer-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"[iconography] report -> {report_path}", flush=True)


if __name__ == "__main__":
    main()
