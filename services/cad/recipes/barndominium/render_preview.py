"""Run with Blender --background --python ... -- source.obj output.glb output.webp"""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args=sys.argv[sys.argv.index("--")+1:]
obj_path=Path(args[0]); glb_path=Path(args[1]); image_path=Path(args[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=str(obj_path),forward_axis="Y",up_axis="Z")
mesh_objs=[o for o in bpy.context.scene.objects if o.type=="MESH"]
if not mesh_objs: raise RuntimeError("OBJ contained no mesh geometry")
# Preserve distinct BIM element IDs in individual glTF nodes.
for obj in mesh_objs:
    obj.data.validate()
    for material in obj.data.materials:
        if material:
            material.use_nodes=True
            bsdf=material.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Roughness"].default_value=.78
                bsdf.inputs["Metallic"].default_value=.17 if "roof" in material.name else 0.04
glb_path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(glb_path),export_format="GLB",export_yup=True,
                           export_apply=False,export_materials="EXPORT",export_cameras=False,
                           export_lights=False)
# Render accessible visual review thumbnail with the same materials.
scene=bpy.context.scene
scene.render.engine="CYCLES"
scene.cycles.samples=24
scene.render.resolution_x=1280
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
world=bpy.data.worlds.new("StudioBackdrop")
scene.world=world
world.use_nodes=True
world.node_tree.nodes.get("Background").inputs["Color"].default_value=(.86,.88,.90,1)
world.node_tree.nodes.get("Background").inputs["Strength"].default_value=.7

# Location units are meters. The front is y+; x increases from garage to house.
center=Vector((16.5,7.3,2.7))
bpy.ops.object.camera_add(location=(38,100,70))
camera=bpy.context.object
camera.name="Front three-quarter review camera"
direction=center-camera.location
camera.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=62
scene.camera=camera
def area(name,loc,power,size):
    bpy.ops.object.light_add(type="AREA",location=loc)
    ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.shape="DISK";ob.data.size=size
    ob.rotation_euler=(center-ob.location).to_track_quat("-Z","Y").to_euler()
area("Key",(16,33,65),8500,30)
area("Fill",(-33,4,46),5000,36)
area("Back",(49,-36,62),6200,34)
# Floor indicates front/topology without pretending verified terrain geometry.
bpy.ops.mesh.primitive_cube_add(size=1,location=(16,8,-.79))
floor=bpy.context.object
floor.name="Preview ground plane (not project BIM)"
floor.dimensions=(66,62,.1)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
material=bpy.data.materials.new("Ground neutral")
material.diffuse_color=(.76,.77,.75,1)
material.use_nodes=True
material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(.76,.77,.75,1)
floor.data.materials.append(material)
image_path.parent.mkdir(parents=True,exist_ok=True)
scene.render.filepath=str(image_path.with_suffix(".png"))
bpy.ops.render.render(write_still=True)
print("PROOF",len(mesh_objs),"model nodes; glb bytes",glb_path.stat().st_size,"render",scene.render.filepath)
