import bpy
import math
import sys
from mathutils import Vector

def args_after_separator():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

args=args_after_separator()
if len(args)!=2:
    raise SystemExit("usage: blender --background --python render_preview.py -- part.stl preview.png")
stl_path, output_path=args

bpy.ops.wm.read_factory_settings(use_empty=True)
if hasattr(bpy.ops.wm, "stl_import"):
    bpy.ops.wm.stl_import(filepath=stl_path)
else:
    bpy.ops.import_mesh.stl(filepath=stl_path)
part=next((obj for obj in bpy.context.selected_objects if obj.type=="MESH"),None)
if part is None:
    raise RuntimeError("stl_import_produced_no_mesh")
part.name="MotorBearingEndPlate_CandidateB"
# STEP/STL geometry is authored in millimetres; render at physical metre scale.
part.scale=(0.001,0.001,0.001)
bpy.context.view_layer.objects.active=part
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
for polygon in part.data.polygons:
    polygon.use_smooth=True
metal=bpy.data.materials.new("Satin machined aluminum — visualization")
metal.diffuse_color=(0.58,0.68,0.68,1)
metal.use_nodes=True
bsdf=metal.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value=(0.34,0.44,0.46,1)
bsdf.inputs["Metallic"].default_value=0.35
bsdf.inputs["Roughness"].default_value=0.34
part.data.materials.append(metal)
bevel=part.modifiers.new("Micro edge highlights","BEVEL")
bevel.width=0.00018
bevel.segments=2
bevel.limit_method="ANGLE"
norm=part.modifiers.new("Weighted highlights","WEIGHTED_NORMAL")
norm.keep_sharp=True

ground_mat=bpy.data.materials.new("Studio ground")
ground_mat.diffuse_color=(0.075,0.105,0.11,1)
ground_mat.use_nodes=True
ground_mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(0.018,0.028,0.032,1)
ground_mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=0.74
bpy.ops.mesh.primitive_plane_add(size=0.48, location=(0,0,-0.0012))
ground=bpy.context.object
ground.name="StudioGround"
ground.data.materials.append(ground_mat)

def aim(obj, point):
    direction=Vector(point)-obj.location
    obj.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()

bpy.ops.object.camera_add(location=(0.205,-0.235,0.235))
camera=bpy.context.object
camera.name="CAM_Review_Iso"
camera.data.type="ORTHO"
camera.data.ortho_scale=0.255
aim(camera,(0,0,0.005))
scene=bpy.context.scene
scene.camera=camera

def area_light(name, location, energy, size, color):
    bpy.ops.object.light_add(type="AREA", location=location)
    light=bpy.context.object
    light.name=name
    light.data.energy=energy
    light.data.shape="DISK"
    light.data.size=size
    light.data.color=color
    aim(light,(0,0,0))
    return light

area_light("Key softbox",(-0.11,-0.14,0.19),15,0.14,(0.83,0.91,1.0))
area_light("Warm rim",(0.12,0.10,0.15),8,0.12,(1.0,0.78,0.55))
area_light("Fill",(0.12,-0.08,0.08),4,0.10,(0.58,0.8,1.0))
scene.world=bpy.data.worlds.new("Dark studio world")
scene.world.use_nodes=True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(0.018,0.028,0.032,1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=0.2
scene.render.engine="CYCLES" if hasattr(scene,"cycles") else "BLENDER_EEVEE_NEXT"
if hasattr(scene,"cycles"):
    scene.cycles.samples=32
scene.render.resolution_x=1600
scene.render.resolution_y=1120
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.film_transparent=False
scene.render.filepath=output_path
scene.view_settings.view_transform="AgX"
scene.view_settings.exposure=-0.3
scene.render.image_settings.color_mode="RGBA"
bpy.ops.render.render(write_still=True)
print("AGENTSAM_CAM_RENDER="+output_path)
